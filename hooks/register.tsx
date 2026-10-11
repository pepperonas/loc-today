import type { EngineInterface, PluginOptions, Register, Timer } from 'claude-code'

import { changesOf, parseNumstat, snapshotDelta, total } from './count'
import type { Change, Snapshot } from './count'
import { COMPACT_BELOW, cardLines, reportText, rowSegs } from './row'
import type { Seg } from './row'
import { KEY_PREFIX, asSessionDay, dayOf, grand, keyFor, parseOffset, rank, record, staleKeys } from './tally'
import type { Ranked, SessionDay } from './tally'

export type Mode = 'full' | 'compact' | 'off'
export type Prefs = { mode: Mode }
const MODES: readonly Mode[] = ['full', 'compact', 'off']

/** How often the other sessions' figures are read again. */
const POLL_MS = 5000
/** How often the local UTC offset is read again (it moves with daylight saving). */
const OFFSET_MS = 10 * 60_000

/** userConfig default, overridden by what /loc-today stored. */
export function prefsOf(options: PluginOptions, stored: unknown): Prefs {
  const isMode = (v: unknown): v is Mode => MODES.includes(v as Mode)
  const s = (stored && typeof stored === 'object' ? stored : {}) as Partial<Prefs>
  const base: Mode = isMode(options.mode) ? options.mode : 'full'
  return { mode: isMode(s.mode) ? s.mode : base }
}

let prefs: Prefs = { mode: 'full' }
let session = 'unknown'
let offset = 0
let offsetAt = -Infinity
let mine: { day: string; data: SessionDay } | undefined
let ranked: Ranked[] = []
let shownKey = ''
let pollTimer: Timer | undefined
/** Writes of this session, one after the other. */
let queue: Promise<void> = Promise.resolve()
const roots = new Map<string, string>()

async function today($: EngineInterface): Promise<string> {
  const now = await $.clock.now()
  if (now - offsetAt > OFFSET_MS) {
    offsetAt = now
    const r = await $.process.run(['date', '+%z'], { timeoutMs: 2000 }).catch(() => undefined)
    if (r && r.exitCode === 0) offset = parseOffset(r.stdout)
  }
  return dayOf(now, offset)
}

const dirOf = (path: string) => path.replace(/\/[^/]*$/, '') || '/'

/** The project a file belongs to: its git top level, else the session's folder, else its own folder. */
async function rootFor($: EngineInterface, path: string): Promise<string> {
  const dir = dirOf(path)
  const known = roots.get(dir)
  if (known) return known
  const r = await $.process
    .run(['git', '-C', dir, 'rev-parse', '--show-toplevel'], { timeoutMs: 3000, env: { GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' } })
    .catch(() => undefined)
  let root = r && r.exitCode === 0 ? r.stdout.trim() : ''
  if (!root) {
    const cwd = await $.session.cwd().catch(() => '')
    root = cwd && (path === cwd || path.startsWith(`${cwd}/`)) ? cwd : dir
  }
  roots.set(dir, root)
  return root
}

const GIT_ENV = { GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' }
/** Untracked files that appear in one command and are counted line by line, at most. */
const MAX_NEW_FILES = 50
/** Paths an Edit or Write counted while a Bash command ran: the snapshot must not count them again. */
const countedDuringBash = new Set<string>()
let bashRunning = 0

async function git($: EngineInterface, root: string, args: string[]): Promise<string | undefined> {
  const r = await $.process.run(['git', '-C', root, ...args], { timeoutMs: 5000, env: GIT_ENV }).catch(() => undefined)
  return r && r.exitCode === 0 && !r.isStdoutTruncated ? r.stdout : undefined
}

/** The work tree the session runs in, or nothing outside git. */
const repos = new Map<string, string | null>()
async function sessionRepo($: EngineInterface): Promise<string | undefined> {
  const cwd = await $.session.cwd().catch(() => '')
  if (!cwd) return undefined
  if (!repos.has(cwd)) repos.set(cwd, (await git($, cwd, ['rev-parse', '--show-toplevel']))?.trim() || null)
  return repos.get(cwd) ?? undefined
}

async function snapshot($: EngineInterface, root: string): Promise<Snapshot | undefined> {
  const [head, numstat, untracked] = await Promise.all([
    git($, root, ['rev-parse', 'HEAD']),
    git($, root, ['diff', '--numstat', '--no-renames', 'HEAD']),
    git($, root, ['ls-files', '--others', '--exclude-standard']),
  ])
  if (head === undefined || numstat === undefined || untracked === undefined) return undefined
  return { head: head.trim(), numstat: parseNumstat(numstat), untracked: untracked.split('\n').filter(Boolean) }
}

/** Lines of the untracked files a command created. */
async function newFileLines($: EngineInterface, root: string, files: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const f of files.slice(0, MAX_NEW_FILES)) {
    const text = await $.fs.read(`${root}/${f}`).catch(() => undefined)
    if (typeof text === 'string') out[f] = text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
  }
  return out
}

/** Read every session's figures for today again; redraw when they moved. */
async function refresh($: EngineInterface): Promise<void> {
  const day = await today($)
  const keys = (await $.store.keys().catch(() => [] as string[])).filter(k => k.startsWith(`${KEY_PREFIX}${day}:`))
  const days: SessionDay[] = []
  for (const k of keys) {
    const d = asSessionDay(await $.store.get(k).catch(() => undefined))
    if (d) days.push(d)
  }
  // Our own figures may be newer than what the store answered a moment ago.
  if (mine && mine.day === day) {
    const own = keys.indexOf(keyFor(day, session))
    if (own >= 0) days.splice(own, 1, mine.data)
    else days.push(mine.data)
  }
  const next = rank(days)
  const key = JSON.stringify(next.map(r => [r.root, r.created, r.edited, r.deleted, r.fileCount]))
  ranked = next
  if (key !== shownKey) {
    shownKey = key
    $.ui.invalidate('ui.render')
  }
}

/** Book one call's changes to this session's key for today. */
async function book($: EngineInterface, changes: Change[]): Promise<void> {
  const day = await today($)
  if (!mine || mine.day !== day) mine = { day, data: { projects: {}, at: 0 } }
  const byRoot = new Map<string, Change[]>()
  for (const c of changes) {
    const root = await rootFor($, c.path)
    byRoot.set(root, [...(byRoot.get(root) ?? []), c])
  }
  const now = await $.clock.now()
  let data = mine.data
  for (const [root, cs] of byRoot) data = record(data, root, cs, now)
  mine = { day, data }
  await $.store.set(keyFor(day, session), data).catch(() => undefined)
  await refresh($)
}

const HELP = [
  'Commands:',
  '  /loc-today                    today, by project',
  '  /loc-today full|compact|off   the line under the prompt',
  '  /loc-today reset              forget what this session counted today',
  '  /loc-today reset all          forget what every session counted today',
]

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    prefs = prefsOf(options, await $.store.get('prefs').catch(() => undefined))
    await $.command.register({
      name: 'loc-today',
      description: "loc-today: today's lines of code, all sessions, by project (/loc-today help)",
      argumentHint: '[full|compact|off|reset [all]]',
      immediate: true,
    })
    const started = await next(e)
    const fallback = `s${await $.clock.now()}`
    session = await $.session.id().catch(() => fallback)
    const day = await today($)
    // Picking up a resumed session where it left off today.
    const own = asSessionDay(await $.store.get(keyFor(day, session)).catch(() => undefined))
    mine = own ? { day, data: own } : undefined
    const keys = await $.store.keys().catch(() => [] as string[])
    for (const k of staleKeys(keys, day)) await $.store.delete(k).catch(() => undefined)
    await refresh($)
    pollTimer?.cancel()
    pollTimer = $.clock.every(POLL_MS, () => void refresh($).catch(() => undefined))
    return started
  })

  // Edit and Write: Claude Code reports the diff with the result.
  on('tool.call', async ($, e, next) => {
    if (e.tool === 'Bash') return next(e)
    const result = await next(e)
    if (!('deny' in result && result.deny) && !result.isError) {
      const changes = changesOf(e.tool, result.result)
      if (changes.length) {
        if (bashRunning) for (const c of changes) countedDuringBash.add(c.path)
        queue = queue.then(() => book($, changes)).catch(() => undefined)
      }
    }
    return result
  }).catch(($, e, next) => next(e)) // never in the way of a tool call

  // Bash: measured from outside, by the work tree before and after the command.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const repo = await sessionRepo($).catch(() => undefined)
    const before = repo ? await snapshot($, repo).catch(() => undefined) : undefined
    bashRunning++
    let result
    try {
      result = await next(e)
    } finally {
      bashRunning--
    }
    if ('deny' in result && result.deny) return result
    // Should Claude Code ever hand over the command's own diff, it is the better source.
    const reported = changesOf('Bash', result.result)
    if (reported.length) {
      queue = queue.then(() => book($, reported)).catch(() => undefined)
      return result
    }
    if (repo && before) {
      const after = await snapshot($, repo).catch(() => undefined)
      if (after) {
        const appeared = after.untracked.filter(f => !before.untracked.includes(f))
        const lines = await newFileLines($, repo, appeared)
        const changes = snapshotDelta(repo, before, after, lines, countedDuringBash)
        if (!bashRunning) countedDuringBash.clear()
        if (changes.length) queue = queue.then(() => book($, changes)).catch(() => undefined)
      }
    }
    return result
  }).catch(($, e, next) => next(e)) // never in the way of a tool call

  on('command.run', { command: 'loc-today' }, async ($, e) => {
    const [cmd = '', arg = ''] = e.args.trim().toLowerCase().split(/\s+/)
    if (MODES.includes(cmd as Mode)) {
      prefs = { mode: cmd as Mode }
      await $.store.set('prefs', prefs).catch(() => undefined)
      $.ui.invalidate('ui.render')
      return { text: `mode ${cmd}` }
    }
    const day = await today($)
    if (cmd === 'reset' && arg === 'all') {
      await queue
      mine = { day, data: { projects: {}, at: await $.clock.now() } }
      const keys = (await $.store.keys().catch(() => [] as string[])).filter(k => k.startsWith(`${KEY_PREFIX}${day}:`))
      for (const k of keys) await $.store.delete(k).catch(() => undefined)
      await refresh($)
      return { text: `today's figures of all sessions are cleared (${keys.length} ${keys.length === 1 ? 'session' : 'sessions'})` }
    }
    if (cmd === 'reset') {
      await queue
      mine = { day, data: { projects: {}, at: await $.clock.now() } }
      await $.store.delete(keyFor(day, session)).catch(() => undefined)
      await refresh($)
      return { text: "this session's figures for today are cleared (other sessions keep theirs)" }
    }
    await queue
    await refresh($)
    return { text: [reportText(ranked, grand(ranked), day), '', ...HELP].join('\n') }
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (prefs.mode === 'off') return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const columns = e.viewport?.columns ?? 100
    const compact = prefs.mode === 'compact' || columns < COMPACT_BELOW
    const text = (s: Seg, k: string) => (
      <Text key={k} color={s.color} backgroundColor={s.bg} dimColor={s.dim} bold={s.bold} wrap="truncate-end">
        {s.text}
      </Text>
    )
    const card = compact ? [] : cardLines(ranked, columns)
    return (
      <Box flexDirection="column">
        {await next(e)}
        <Box key="loc-today" flexDirection="column">
          <Box flexDirection="row">{rowSegs(grand(ranked), ranked.length, compact).map((s, i) => text(s, `lt-${i}`))}</Box>
          {card.length ? (
            <Box flexDirection="column" display="none" hover={{ display: 'flex' }} paddingX={1} borderStyle="round" borderColor="#30363d">
              {card.map((line, i) => (
                <Box key={`lt-card-${i}`} flexDirection="row">
                  {line.map((s, j) => text(s, `lt-c${i}-${j}`))}
                </Box>
              ))}
            </Box>
          ) : null}
        </Box>
      </Box>
    )
  })
}
