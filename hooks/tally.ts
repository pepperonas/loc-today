/**
 * Today's figures, kept per session and summed for the display. Each session
 * writes only its own store key (`day:<date>:<session>`), so two sessions
 * writing at once can never overwrite each other's lines. Engine-free.
 */
import { ZERO, sum, total } from './count'
import type { Change, Counts } from './count'

export type Project = Counts & {
  /** The project's folder (its git top level, else the session's folder). */
  root: string
  /** Distinct files changed, as paths; capped, so a huge refactor can't grow the store without end. */
  files: string[]
}
export type SessionDay = { projects: Record<string, Project>; at: number }
export type Ranked = Project & { name: string; lines: number; fileCount: number }

/** Files remembered per project and session. */
export const MAX_FILES = 400
/** Days of figures kept in the store. */
export const KEEP_DAYS = 7
export const KEY_PREFIX = 'day:'

/** The local calendar day of `now`, given the local offset from UTC in minutes. */
export function dayOf(now: number, offsetMin: number): string {
  return new Date(now + offsetMin * 60_000).toISOString().slice(0, 10)
}

/** `date +%z` (`+0200`, `-0530`) as minutes east of UTC; 0 when unreadable. */
export function parseOffset(z: string): number {
  const m = z.trim().match(/^([+-])(\d{2}):?(\d{2})$/)
  if (!m) return 0
  const v = Number(m[2]) * 60 + Number(m[3])
  return m[1] === '-' ? -v : v
}

export const keyFor = (day: string, session: string) => `${KEY_PREFIX}${day}:${session}`
export const dayOfKey = (key: string) => (key.startsWith(KEY_PREFIX) ? key.slice(KEY_PREFIX.length, KEY_PREFIX.length + 10) : undefined)

/** The keys of other days than today's KEEP_DAYS window, to delete. */
export function staleKeys(keys: readonly string[], today: string): string[] {
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - (KEEP_DAYS - 1) * 86_400_000).toISOString().slice(0, 10)
  return keys.filter(k => {
    const d = dayOfKey(k)
    return d !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(d) && d < cutoff
  })
}

/** A session's day with one call's changes added. */
export function record(day: SessionDay | undefined, root: string, changes: readonly Change[], now: number): SessionDay {
  const projects = { ...(day?.projects ?? {}) }
  const p: Project = projects[root] ? { ...projects[root]!, files: [...projects[root]!.files] } : { root, ...ZERO, files: [] }
  for (const c of changes) {
    Object.assign(p, sum(p, c.counts))
    if (!p.files.includes(c.path) && p.files.length < MAX_FILES) p.files.push(c.path)
  }
  projects[root] = p
  return { projects, at: now }
}

/** Whatever the store held under a day key, as a SessionDay or nothing. */
export function asSessionDay(v: unknown): SessionDay | undefined {
  if (!v || typeof v !== 'object') return undefined
  const raw = (v as { projects?: unknown }).projects
  if (!raw || typeof raw !== 'object') return undefined
  const projects: Record<string, Project> = {}
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0)
  for (const [root, p] of Object.entries(raw as Record<string, unknown>)) {
    if (!p || typeof p !== 'object') continue
    const q = p as Record<string, unknown>
    projects[root] = {
      root,
      created: n(q.created),
      edited: n(q.edited),
      deleted: n(q.deleted),
      files: Array.isArray(q.files) ? q.files.filter((f): f is string => typeof f === 'string') : [],
    }
  }
  return { projects, at: n((v as { at?: unknown }).at) }
}

const base = (root: string) => root.replace(/\/+$/, '').split('/').pop() || root

/**
 * All sessions' days summed per project, largest first (ties by name). Two
 * projects with the same folder name are told apart by their parent folder.
 */
export function rank(days: readonly SessionDay[]): Ranked[] {
  const merged = new Map<string, { counts: Counts; files: Set<string> }>()
  for (const d of days) {
    for (const p of Object.values(d.projects)) {
      const m = merged.get(p.root) ?? { counts: ZERO, files: new Set<string>() }
      m.counts = sum(m.counts, p)
      for (const f of p.files) m.files.add(f)
      merged.set(p.root, m)
    }
  }
  const roots = [...merged.keys()]
  const clash = (root: string) => roots.some(r => r !== root && base(r) === base(root))
  const named = (root: string) => {
    if (!clash(root)) return base(root)
    const parts = root.replace(/\/+$/, '').split('/')
    return parts.slice(-2).join('/')
  }
  return roots
    .map(root => {
      const m = merged.get(root)!
      return { root, name: named(root), ...m.counts, files: [...m.files], fileCount: m.files.size, lines: total(m.counts) }
    })
    .filter(r => r.lines > 0 || r.fileCount > 0)
    .sort((a, b) => b.lines - a.lines || a.name.localeCompare(b.name))
}

/** The sum over all projects. */
export const grand = (ranked: readonly Ranked[]): Counts => ranked.reduce<Counts>((a, r) => sum(a, r), ZERO)
