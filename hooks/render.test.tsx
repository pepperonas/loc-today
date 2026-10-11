import { expect, mock, test } from 'claude-code/testing'

const DAY = '2026-10-11'
const HINT = {
  plugin: 'loc-today',
  component: 'PromptHint',
  props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
} as const

/** What a tool call answers, by tool: the diffs Claude Code reports. */
const RESULTS: Record<string, unknown> = {
  Edit: { filePath: '/w/shop/src/a.ts', structuredPatch: [{ oldStart: 1, oldLines: 2, newStart: 1, newLines: 3, lines: [' x', '-y', '+Y', '+z'] }] },
  Write: { type: 'create', filePath: '/w/shop/src/new.ts', content: 'a\nb\nc\nd\n', structuredPatch: [] },
  Bash: {
    stdout: '',
    bashEditDiff: { files: [{ filePath: '/w/blog/old.md', deleted: true, hunks: [{ oldStart: 1, oldLines: 2, newStart: 0, newLines: 0, lines: ['-1', '-2'] }] }], moreFiles: 0 },
  },
}

/** The session's work tree as git answers about it; a Bash call may move it to `after`. */
type Tree = { head: string; numstat: string; untracked: string; files: Record<string, string> }
type Repo = { now: Tree; after?: Tree; bashHasDiff?: boolean }

let CLOCK: any

/** Stand-in for the engine beneath the plugin, with a store shared like the real one across sessions. */
function engine(on: any, disk: Record<string, unknown> = {}, opts: { failing?: boolean; repo?: Repo } = {}) {
  const repo: Repo = opts.repo ?? { now: { head: 'h1', numstat: '', untracked: '', files: {} }, bashHasDiff: true }
  const clock = mock.clock(on)
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>{e.props.hint}</Text>
  })
  on('store.get', (_$: any, e: any) => ({ value: structuredClone(disk[e.key]) }))
  on('store.set', (_$: any, e: any) => ((disk[e.key] = structuredClone(e.value)), { value: undefined }))
  on('store.delete', (_$: any, e: any) => (delete disk[e.key], { value: undefined }))
  on('store.keys', () => ({ value: Object.keys(disk) }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/w/shop' }))
  on('session.id', () => ({ value: 'this-session' }))
  on('command.register', () => ({ value: undefined }))
  on('process.run', (_$: any, e: any) => {
    const argv = e.argv as string[]
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    if (argv[0] === 'date') return ok('+0000\n')
    if (argv[0] === 'git') {
      const sub = argv.slice(3).join(' ')
      if (sub === 'rev-parse --show-toplevel') return ok(`${String(argv[2]).match(/^\/w\/[^/]+/)![0]}\n`)
      if (sub === 'rev-parse HEAD') return ok(`${repo.now.head}\n`)
      if (sub.startsWith('diff --numstat')) return ok(repo.now.numstat)
      if (sub.startsWith('ls-files --others')) return ok(repo.now.untracked)
    }
    return { value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('fs.read', (_$: any, e: any) => {
    const text = repo.now.files[e.path]
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('tool.call', (_$: any, e: any) => {
    if (opts.failing) return { result: RESULTS[e.tool] ?? {}, isError: true, text: 'boom' }
    if (e.tool === 'Bash') {
      if (repo.after) repo.now = repo.after
      return { result: repo.bashHasDiff ? RESULTS.Bash : { stdout: '' } }
    }
    return { result: RESULTS[e.tool] ?? {} }
  })
  CLOCK = clock
  return { disk, clock }
}

const start = async ($: any) => {
  // the mocked clock starts at the epoch; move it to the test day
  await CLOCK.advance(Date.parse(`${DAY}T10:00:00Z`))
  return $.session.start({ cwd: '/w/shop', surface: 'terminal', isInteractive: true })
}
const mount = ($: any, columns = 120): Promise<any> => $.ui.mount({ ...HINT, surface: 'terminal', viewport: { columns, rows: 40 } })
const all = async (ui: any) => (await ui.findAll({ type: 'Text' })).map((t: any) => t.text).join('\n')
const call = ($: any, tool: string) => $.tool.call({ tool, command: 'x' } as any)
const settle = (_$: any) => CLOCK.advance(50)

test('edits, a new file and a deletion by Bash are summed under the prompt, the hint kept', async ($, on) => {
  engine(on)
  await start($)
  await call($, 'Edit')
  await call($, 'Write')
  await call($, 'Bash')
  await settle($)
  const t = await all(await mount($))
  expect(t).toContain('? for shortcuts')
  expect(t).toContain('+5') // 1 from the edit, 4 from the new file
  expect(t).toContain('~1')
  expect(t).toContain('−2')
  expect(t).toContain('2 projects')
})

test('the hover card ranks the projects, largest first', async ($, on) => {
  engine(on)
  await start($)
  await call($, 'Edit')
  await call($, 'Write')
  await call($, 'Bash')
  await settle($)
  const t = await all(await mount($))
  const card = t.slice(t.indexOf('today, by project'))
  expect(card.length).toBeGreaterThan(20)
  // shop: 5 new + 1 edited = 6 lines, blog: 2 deleted -> 75 % / 25 %
  expect(card.indexOf('shop')).toBeGreaterThan(-1)
  expect(card.indexOf('shop')).toBeLessThan(card.indexOf('blog'))
  expect(card).toContain('75%')
})

test("another session's figures for today count too; yesterday's do not", async ($, on) => {
  const disk: Record<string, unknown> = {
    [`day:${DAY}:other`]: { projects: { '/w/api': { created: 40, edited: 3, deleted: 1, files: ['/w/api/x.go'] } }, at: 1 },
    'day:2026-10-10:other': { projects: { '/w/old': { created: 999, edited: 0, deleted: 0, files: ['/w/old/y'] } }, at: 1 },
  }
  engine(on, disk)
  await start($)
  await call($, 'Edit')
  await settle($)
  const t = await all(await mount($))
  expect(t).toContain('+41')
  expect(t).toContain('2 projects')
  expect(t).not.toContain('999')
  // this session wrote only its own key and left the other's alone
  expect(Object.keys(disk).sort()).toEqual([`day:${DAY}:other`, `day:${DAY}:this-session`, 'day:2026-10-10:other'].sort())
})

test('figures another session writes later show up on the next poll', async ($, on) => {
  const disk: Record<string, unknown> = {}
  engine(on, disk)
  await start($)
  const ui = await mount($)
  expect(await all(ui)).toContain('no lines changed yet')
  disk[`day:${DAY}:other`] = { projects: { '/w/api': { created: 7, edited: 0, deleted: 0, files: ['/w/api/x.go'] } }, at: 2 }
  await CLOCK.advance(6000)
  expect(await all(ui)).toContain('+7')
})

test('a failed tool call counts nothing', async ($, on) => {
  engine(on, {}, { failing: true })
  await start($)
  await call($, 'Edit')
  await settle($)
  expect(await all(await mount($))).toContain('no lines changed yet')
})

test('narrow terminals get the numbers only, and no card', async ($, on) => {
  engine(on)
  await start($)
  await call($, 'Edit')
  await settle($)
  const t = await all(await mount($, 60))
  expect(t).toContain('Σ ')
  expect(t).not.toContain('edited')
  expect(t).not.toContain('today, by project')
})

test('/loc-today off hides the line, full brings it back; reset clears only this session', async ($, on) => {
  const disk: Record<string, unknown> = {
    [`day:${DAY}:other`]: { projects: { '/w/api': { created: 7, edited: 0, deleted: 0, files: ['/w/api/x.go'] } }, at: 1 },
  }
  engine(on, disk)
  await start($)
  await call($, 'Edit')
  await settle($)
  await ($ as any).command.run({ command: 'loc-today', args: 'off' })
  expect(await all(await mount($))).not.toContain('Σ')
  await ($ as any).command.run({ command: 'loc-today', args: 'full' })
  expect(await all(await mount($))).toContain('+8')
  const res = await ($ as any).command.run({ command: 'loc-today', args: 'reset' })
  expect(JSON.stringify(res)).toContain('cleared')
  expect(await all(await mount($))).toContain('+7')
  expect(disk[`day:${DAY}:other`]).toBeDefined()
})

test('days older than a week are removed from the store at start', async ($, on) => {
  const disk: Record<string, unknown> = { 'day:2026-09-01:x': { projects: {}, at: 1 }, prefs: { mode: 'full' } }
  engine(on, disk)
  await start($)
  expect(disk['day:2026-09-01:x']).toBeUndefined()
  expect(disk.prefs).toBeDefined()
})

test('Bash without a reported diff: measured from the work tree before and after', async ($, on) => {
  const repo: Repo = {
    now: { head: 'h1', numstat: '2\t0\tsrc/a.ts\n', untracked: 'notes.txt\n', files: {} },
    after: {
      head: 'h1',
      // a.ts unchanged, b.ts: one line reworded, old.ts removed (5 lines), a binary changed
      numstat: '2\t0\tsrc/a.ts\n1\t1\tsrc/b.ts\n0\t5\tsrc/old.ts\n-\t-\tlogo.png\n',
      untracked: 'notes.txt\ngen/out.ts\n',
      files: { '/w/shop/gen/out.ts': 'x\ny\nz\n' },
    },
  }
  engine(on, {}, { repo })
  await start($)
  await call($, 'Bash')
  await settle($)
  const t = await all(await mount($))
  expect(t).toContain('+3') // gen/out.ts
  expect(t).toContain('~1') // src/b.ts
  expect(t).toContain('−5') // src/old.ts
  expect(t).toContain('1 project')
})

test('Bash that moves HEAD (a commit, a checkout) is not measured', async ($, on) => {
  const repo: Repo = {
    now: { head: 'h1', numstat: '3\t0\tsrc/a.ts\n', untracked: '', files: {} },
    after: { head: 'h2', numstat: '', untracked: '', files: {} },
  }
  engine(on, {}, { repo })
  await start($)
  await call($, 'Bash')
  await settle($)
  expect(await all(await mount($))).toContain('no lines changed yet')
})

test('/loc-today reset all clears every session of today, and leaves other days and settings', async ($, on) => {
  const disk: Record<string, unknown> = {
    [`day:${DAY}:other`]: { projects: { '/w/api': { created: 7, edited: 0, deleted: 0, files: ['/w/api/x.go'] } }, at: 1 },
    'day:2026-10-10:other': { projects: {}, at: 1 },
    prefs: { mode: 'full' },
  }
  engine(on, disk)
  await start($)
  await call($, 'Edit')
  await settle($)
  await ($ as any).command.run({ command: 'loc-today', args: 'reset all' })
  expect(await all(await mount($))).toContain('no lines changed yet')
  expect(Object.keys(disk).sort()).toEqual(['day:2026-10-10:other', 'prefs'])
})
