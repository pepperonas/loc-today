/**
 * Lines a tool call changed, read from the diffs Claude Code itself reports
 * with the result: `structuredPatch` for Edit and Write, `bashEditDiff` for
 * the files a Bash command touched. Engine-free.
 */

export type Counts = { created: number; edited: number; deleted: number }
export type Hunk = { lines: readonly string[] }
/** One file a call changed. */
export type Change = { path: string; counts: Counts; removed?: true; added?: true }

export const ZERO: Counts = { created: 0, edited: 0, deleted: 0 }
export const sum = (a: Counts, b: Counts): Counts => ({ created: a.created + b.created, edited: a.edited + b.edited, deleted: a.deleted + b.deleted })
export const total = (c: Counts) => c.created + c.edited + c.deleted

/**
 * Counts in unified-diff hunks. Within each run of changed lines (between
 * context lines) a removed line paired with an added one is one edited line;
 * what is left over was created or deleted. So a reworded line is 1 edited,
 * not 1 deleted plus 1 created.
 */
export function countHunks(hunks: readonly Hunk[] | undefined): Counts {
  let c = ZERO
  for (const h of hunks ?? []) {
    let plus = 0
    let minus = 0
    const flush = () => {
      const edited = Math.min(plus, minus)
      c = sum(c, { created: plus - edited, edited, deleted: minus - edited })
      plus = 0
      minus = 0
    }
    for (const line of h.lines ?? []) {
      if (line.startsWith('+')) plus++
      else if (line.startsWith('-')) minus++
      else if (!line.startsWith('\\')) flush() // context; "\ No newline at end of file" changes nothing
    }
    flush()
  }
  return c
}

/** Lines in a file's text, a trailing newline not counted as a line of its own. */
export function lineCount(text: string): number {
  if (text === '') return 0
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object'
const asHunks = (v: unknown): Hunk[] | undefined =>
  Array.isArray(v) ? v.filter(isObj).map(h => ({ lines: Array.isArray(h.lines) ? h.lines.filter((l): l is string => typeof l === 'string') : [] })) : undefined

/** The files one tool call changed and by how much; empty for anything that changed no file. */
export function changesOf(tool: string, result: unknown): Change[] {
  if (!isObj(result)) return []
  if (tool === 'Edit' || tool === 'MultiEdit') {
    if (typeof result.filePath !== 'string') return []
    const counts = countHunks(asHunks(result.structuredPatch))
    return total(counts) ? [{ path: result.filePath, counts }] : []
  }
  if (tool === 'Write') {
    if (typeof result.filePath !== 'string') return []
    const hunks = asHunks(result.structuredPatch)
    let counts = countHunks(hunks)
    const created = result.type === 'create'
    // A new file may come without a patch: then its content is what was created.
    if (created && !total(counts) && typeof result.content === 'string') counts = { ...ZERO, created: lineCount(result.content) }
    if (!total(counts) && !created) return []
    return [{ path: result.filePath, counts, ...(created ? { added: true as const } : {}) }]
  }
  if (tool === 'Bash') {
    const diff = result.bashEditDiff
    if (!isObj(diff) || !Array.isArray(diff.files)) return []
    const out: Change[] = []
    for (const f of diff.files) {
      if (!isObj(f) || typeof f.filePath !== 'string') continue
      const counts = countHunks(asHunks(f.hunks))
      if (!total(counts) && !f.created && !f.deleted) continue
      out.push({ path: f.filePath, counts, ...(f.created ? { added: true as const } : {}), ...(f.deleted ? { removed: true as const } : {}) })
    }
    return out
  }
  return []
}

/**
 * What a shell command changed in a git work tree, measured from outside:
 * `git diff --numstat HEAD` before and after the command (tracked files,
 * staged or not) plus the untracked files that appeared. Claude Code does
 * not hand a Bash result's own diff to mods, so this is how `rm`, `sed -i`,
 * `mv` and generators are counted.
 */
export type Snapshot = {
  /** HEAD's commit; a command that moved it (commit, checkout, reset) is not measured. */
  head: string
  /** Per tracked file (repo-relative): lines added and removed against HEAD. */
  numstat: Record<string, { add: number; del: number }>
  /** Untracked files that are not ignored (repo-relative). */
  untracked: string[]
}

/** `git diff --numstat` output; binary files (`-\t-\t`) are left out. */
export function parseNumstat(out: string): Record<string, { add: number; del: number }> {
  const res: Record<string, { add: number; del: number }> = {}
  for (const line of out.split('\n')) {
    const m = line.match(/^(\d+)\t(\d+)\t(.+)$/)
    if (m) res[m[3]!] = { add: Number(m[1]), del: Number(m[2]) }
  }
  return res
}

/** Per-file counts from added and removed lines alone: as many edited as both have, the rest new or deleted. */
export function fromAddDel(add: number, del: number): Counts {
  const edited = Math.min(add, del)
  return { created: add - edited, edited, deleted: del - edited }
}

/**
 * What changed between two snapshots of one work tree, as changes with
 * absolute paths. `newLines` gives the line count of untracked files that
 * appeared; `skip` names absolute paths another tool already counted while
 * the command ran. A file whose figures went down (the command undid
 * earlier work) is counted by how much it went down, as removed lines.
 */
export function snapshotDelta(root: string, before: Snapshot, after: Snapshot, newLines: Record<string, number>, skip: ReadonlySet<string> = new Set()): Change[] {
  if (!before.head || before.head !== after.head) return []
  const abs = (f: string) => `${root.replace(/\/+$/, '')}/${f}`
  const out: Change[] = []
  const files = new Set([...Object.keys(before.numstat), ...Object.keys(after.numstat)])
  for (const f of [...files].sort()) {
    if (skip.has(abs(f))) continue
    const b = before.numstat[f] ?? { add: 0, del: 0 }
    const a = after.numstat[f] ?? { add: 0, del: 0 }
    const add = Math.max(0, a.add - b.add) + Math.max(0, b.del - a.del)
    const del = Math.max(0, a.del - b.del) + Math.max(0, b.add - a.add)
    if (!add && !del) continue
    out.push({ path: abs(f), counts: fromAddDel(add, del) })
  }
  const was = new Set(before.untracked)
  for (const f of after.untracked) {
    if (was.has(f) || skip.has(abs(f))) continue
    out.push({ path: abs(f), counts: { created: newLines[f] ?? 0, edited: 0, deleted: 0 }, added: true })
  }
  return out
}
