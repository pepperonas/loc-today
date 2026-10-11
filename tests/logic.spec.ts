import { test } from 'node:test'
import assert from 'node:assert/strict'

import { changesOf, countHunks, fromAddDel, lineCount, parseNumstat, snapshotDelta } from '../hooks/count.ts'
import { bar, cardLines, num, reportText, rowSegs } from '../hooks/row.ts'
import { KEEP_DAYS, MAX_FILES, asSessionDay, dayOf, grand, keyFor, parseOffset, rank, record, staleKeys } from '../hooks/tally.ts'
import type { Change } from '../hooks/count.ts'
import type { SessionDay } from '../hooks/tally.ts'

const hunk = (...lines: string[]) => ({ lines })
const text = (segs: { text: string }[]) => segs.map(s => s.text).join('')

// ── counting ────────────────────────────────────────────────────────────────

test('pure additions are new lines, pure removals deleted lines', () => {
  assert.deepEqual(countHunks([hunk(' a', '+b', '+c', ' d')]), { created: 2, edited: 0, deleted: 0 })
  assert.deepEqual(countHunks([hunk(' a', '-b', '-c', ' d')]), { created: 0, edited: 0, deleted: 2 })
})

test('a removed line paired with an added one is one edited line, the rest new or deleted', () => {
  assert.deepEqual(countHunks([hunk('-old', '+new')]), { created: 0, edited: 1, deleted: 0 })
  assert.deepEqual(countHunks([hunk('-a', '-b', '+x', '+y', '+z')]), { created: 1, edited: 2, deleted: 0 })
  assert.deepEqual(countHunks([hunk('-a', '-b', '-c', '+x')]), { created: 0, edited: 1, deleted: 2 })
})

test('runs are paired separately: context between them ends a run', () => {
  assert.deepEqual(countHunks([hunk('-a', ' ctx', '+b')]), { created: 1, edited: 0, deleted: 1 })
})

test('several hunks add up; "\\ No newline" changes nothing; empty patches are zero', () => {
  assert.deepEqual(countHunks([hunk('+a'), hunk('-b', '\\ No newline at end of file', '+c')]), { created: 1, edited: 1, deleted: 0 })
  assert.deepEqual(countHunks([]), { created: 0, edited: 0, deleted: 0 })
  assert.deepEqual(countHunks(undefined), { created: 0, edited: 0, deleted: 0 })
})

test('lineCount does not count a trailing newline as a line', () => {
  assert.equal(lineCount(''), 0)
  assert.equal(lineCount('a'), 1)
  assert.equal(lineCount('a\nb\n'), 2)
  assert.equal(lineCount('a\n\nb'), 3)
})

test('Edit: the file and its patch', () => {
  const r = { filePath: '/p/a.ts', structuredPatch: [hunk(' x', '-y', '+Y', '+z')] }
  assert.deepEqual(changesOf('Edit', r), [{ path: '/p/a.ts', counts: { created: 1, edited: 1, deleted: 0 } }])
  assert.deepEqual(changesOf('Edit', { filePath: '/p/a.ts', structuredPatch: [] }), [])
})

test('Write: a new file without a patch counts its content as new lines', () => {
  assert.deepEqual(changesOf('Write', { type: 'create', filePath: '/p/n.ts', content: 'a\nb\nc\n', structuredPatch: [] }), [
    { path: '/p/n.ts', counts: { created: 3, edited: 0, deleted: 0 }, added: true },
  ])
  // an overwrite counts its patch, not its content
  assert.deepEqual(changesOf('Write', { type: 'update', filePath: '/p/n.ts', content: 'a\nB\nc\n', structuredPatch: [hunk(' a', '-b', '+B', ' c')] }), [
    { path: '/p/n.ts', counts: { created: 0, edited: 1, deleted: 0 } },
  ])
  // an overwrite whose old content was too large to diff counts nothing rather than guessing
  assert.deepEqual(changesOf('Write', { type: 'update', filePath: '/p/n.ts', content: 'x\n', structuredPatch: [], originalFile: null }), [])
})

test('Bash: every file the command touched, created and deleted files marked', () => {
  const r = {
    bashEditDiff: {
      files: [
        { filePath: '/p/gen.ts', created: true, hunks: [hunk('+1', '+2')] },
        { filePath: '/p/old.ts', deleted: true, hunks: [hunk('-1', '-2', '-3')] },
        { filePath: '/p/same.ts', hunks: [] },
        { filePath: '/p/sed.ts', hunks: [hunk('-a', '+b')] },
      ],
      moreFiles: 0,
    },
  }
  assert.deepEqual(changesOf('Bash', r), [
    { path: '/p/gen.ts', counts: { created: 2, edited: 0, deleted: 0 }, added: true },
    { path: '/p/old.ts', counts: { created: 0, edited: 0, deleted: 3 }, removed: true },
    { path: '/p/sed.ts', counts: { created: 0, edited: 1, deleted: 0 } },
  ])
  assert.deepEqual(changesOf('Bash', { stdout: 'ok' }), [])
})

test('tools that change no file, and odd results, count nothing', () => {
  for (const [tool, r] of [['Read', { file: {} }], ['Grep', {}], ['Edit', null], ['Edit', 'text'], ['Edit', { structuredPatch: [hunk('+a')] }]] as const) {
    assert.deepEqual(changesOf(tool, r), [], tool)
  }
})

// ── Bash, measured from the work tree ───────────────────────────────────────

test('parseNumstat reads added and removed lines and leaves binary files out', () => {
  assert.deepEqual(parseNumstat('3\t1\tsrc/a.ts\n-\t-\tlogo.png\n0\t7\tdir with space/b.md\n'), {
    'src/a.ts': { add: 3, del: 1 },
    'dir with space/b.md': { add: 0, del: 7 },
  })
  assert.deepEqual(parseNumstat(''), {})
})

test('fromAddDel pairs added with removed lines as edited', () => {
  assert.deepEqual(fromAddDel(3, 1), { created: 2, edited: 1, deleted: 0 })
  assert.deepEqual(fromAddDel(0, 4), { created: 0, edited: 0, deleted: 4 })
})

const snap = (numstat: Record<string, [number, number]>, untracked: string[] = [], head = 'h') => ({
  head,
  numstat: Object.fromEntries(Object.entries(numstat).map(([f, [add, del]]) => [f, { add, del }])),
  untracked,
})

test('snapshotDelta counts only what the command changed, not what was already uncommitted', () => {
  const before = snap({ 'a.ts': [10, 2], 'b.ts': [1, 0] }, ['keep.txt'])
  const after = snap({ 'a.ts': [10, 2], 'b.ts': [2, 1], 'gone.ts': [0, 6] }, ['keep.txt', 'new.txt'])
  assert.deepEqual(snapshotDelta('/r', before, after, { 'new.txt': 4 }), [
    { path: '/r/b.ts', counts: { created: 0, edited: 1, deleted: 0 } },
    { path: '/r/gone.ts', counts: { created: 0, edited: 0, deleted: 6 } },
    { path: '/r/new.txt', counts: { created: 4, edited: 0, deleted: 0 }, added: true },
  ])
})

test('snapshotDelta: undoing earlier uncommitted lines counts as removing them', () => {
  // the command reverted a file that had 5 uncommitted new lines
  assert.deepEqual(snapshotDelta('/r', snap({ 'a.ts': [5, 0] }), snap({})), [{ path: '/r/a.ts', counts: { created: 0, edited: 0, deleted: 5 } }])
})

test('snapshotDelta measures nothing when HEAD moved, and skips files another tool already counted', () => {
  assert.deepEqual(snapshotDelta('/r', snap({}, [], 'h1'), snap({ 'a.ts': [9, 0] }, [], 'h2'), {}), [])
  assert.deepEqual(snapshotDelta('/r', snap({}, [], ''), snap({ 'a.ts': [9, 0] }, [], ''), {}), [])
  assert.deepEqual(snapshotDelta('/r', snap({}), snap({ 'a.ts': [9, 0], 'b.ts': [1, 0] }), {}, new Set(['/r/a.ts'])), [
    { path: '/r/b.ts', counts: { created: 1, edited: 0, deleted: 0 } },
  ])
})

// ── the day, the store keys ─────────────────────────────────────────────────

test('the local day follows the UTC offset across midnight', () => {
  const t = Date.parse('2026-10-11T22:30:00Z')
  assert.equal(dayOf(t, 0), '2026-10-11')
  assert.equal(dayOf(t, 120), '2026-10-12') // Berlin, summer time
  assert.equal(dayOf(t, -300), '2026-10-11')
  assert.equal(parseOffset('+0200\n'), 120)
  assert.equal(parseOffset('-0530'), -330)
  assert.equal(parseOffset('+05:45'), 345)
  assert.equal(parseOffset('garbage'), 0)
})

test(`days older than ${KEEP_DAYS} are cleaned up; today, the window and other keys stay`, () => {
  const keys = [keyFor('2026-10-11', 'a'), keyFor('2026-10-05', 'b'), keyFor('2026-10-04', 'c'), keyFor('2025-01-01', 'd'), 'prefs']
  assert.deepEqual(staleKeys(keys, '2026-10-11'), [keyFor('2026-10-04', 'c'), keyFor('2025-01-01', 'd')])
})

// ── recording and summing ───────────────────────────────────────────────────

const ch = (path: string, created: number, edited = 0, deleted = 0): Change => ({ path, counts: { created, edited, deleted } })

test('record adds up per project and remembers each file once', () => {
  let d = record(undefined, '/src/shop', [ch('/src/shop/a.ts', 3)], 1)
  d = record(d, '/src/shop', [ch('/src/shop/a.ts', 1, 2), ch('/src/shop/b.ts', 0, 0, 4)], 2)
  d = record(d, '/src/blog', [ch('/src/blog/x.md', 5)], 3)
  assert.deepEqual(d.projects['/src/shop'], { root: '/src/shop', created: 4, edited: 2, deleted: 4, files: ['/src/shop/a.ts', '/src/shop/b.ts'] })
  assert.equal(d.projects['/src/blog']!.created, 5)
  assert.equal(d.at, 3)
})

test('record does not change the day it was given', () => {
  const d = record(undefined, '/r', [ch('/r/a', 1)], 1)
  const snapshot = JSON.stringify(d)
  record(d, '/r', [ch('/r/b', 9)], 2)
  assert.equal(JSON.stringify(d), snapshot)
})

test(`at most ${MAX_FILES} files are remembered per project, the lines keep counting`, () => {
  let d: SessionDay | undefined
  for (let i = 0; i < MAX_FILES + 10; i++) d = record(d, '/r', [ch(`/r/f${i}`, 1)], i)
  assert.equal(d!.projects['/r']!.files.length, MAX_FILES)
  assert.equal(d!.projects['/r']!.created, MAX_FILES + 10)
})

test('two sessions are summed per project without counting anything twice', () => {
  const a = record(undefined, '/src/shop', [ch('/src/shop/a.ts', 10, 2)], 1)
  const b = record(record(undefined, '/src/shop', [ch('/src/shop/a.ts', 1), ch('/src/shop/c.ts', 0, 0, 3)], 1), '/src/blog', [ch('/src/blog/p.md', 2)], 2)
  const r = rank([a, b])
  assert.deepEqual(
    r.map(x => [x.name, x.created, x.edited, x.deleted, x.fileCount, x.lines]),
    [
      ['shop', 11, 2, 3, 2, 16],
      ['blog', 2, 0, 0, 1, 2],
    ],
  )
  assert.deepEqual(grand(r), { created: 13, edited: 2, deleted: 3 })
})

test('largest first, ties by name; two folders of the same name are told apart by their parent', () => {
  const d = record(record(record(undefined, '/w/zeta', [ch('/w/zeta/a', 5)], 1), '/w/alpha', [ch('/w/alpha/a', 5)], 1), '/w/big', [ch('/w/big/a', 9)], 1)
  assert.deepEqual(rank([d]).map(r => r.name), ['big', 'alpha', 'zeta'])
  const twins = record(record(undefined, '/a/app', [ch('/a/app/x', 1)], 1), '/b/app', [ch('/b/app/x', 2)], 1)
  assert.deepEqual(rank([twins]).map(r => r.name), ['b/app', 'a/app'])
})

test('asSessionDay takes what the store held and drops what does not fit', () => {
  assert.equal(asSessionDay(null), undefined)
  assert.equal(asSessionDay({}), undefined)
  const d = asSessionDay({ projects: { '/r': { created: 2, edited: -1, deleted: 'x', files: ['/r/a', 3] }, bad: 5 }, at: 7 })
  assert.deepEqual(d, { projects: { '/r': { root: '/r', created: 2, edited: 0, deleted: 0, files: ['/r/a'] } }, at: 7 })
})

// ── drawing ─────────────────────────────────────────────────────────────────

test('the line: totals with words, the project count; numbers only when compact', () => {
  const sum = { created: 1412, edited: 88, deleted: 57 }
  assert.equal(text(rowSegs(sum, 6, false)), 'Σ today  +1,412 new  ~88 edited  −57 deleted · 6 projects')
  assert.equal(text(rowSegs(sum, 6, true)), 'Σ +1,412 ~88 −57')
  assert.equal(text(rowSegs({ created: 0, edited: 0, deleted: 0 }, 0, false)), 'Σ today  no lines changed yet')
  assert.equal(text(rowSegs({ created: 1, edited: 0, deleted: 0 }, 1, false)).endsWith('· 1 project'), true)
})

test('numbers: thousands separators, then k', () => {
  assert.equal(num(999), '999')
  assert.equal(num(1234), '1,234')
  assert.equal(num(12_345), '12.3k')
  assert.equal(num(123_456), '123k')
})

test('bars are proportional, and any non-zero share gets at least one cell', () => {
  assert.equal(bar(10, 10, 4), '████')
  assert.equal(bar(5, 10, 4), '██··')
  assert.equal(bar(1, 1000, 4), '█···')
  assert.equal(bar(0, 10, 4), '····')
})

test('the hover card lists projects largest first with shares, and sums the rest after ten', () => {
  let d: SessionDay | undefined
  for (let i = 1; i <= 12; i++) d = record(d, `/w/p${String(i).padStart(2, '0')}`, [ch(`/w/p/${i}`, i * 10)], i)
  const lines = cardLines(rank([d!]), 120).map(text)
  assert.match(lines[0]!, /^today, by project/)
  assert.match(lines[1]!, /^ 1 p12 /)
  assert.match(lines[10]!, /^10 p03 /)
  assert.match(lines[11]!, /… 2 more projects, 30 lines/)
  assert.equal(lines.length, 12)
  assert.match(lines[1]!, /\+120/)
  assert.match(lines[1]!, /15%/) // 120 of 780
})

test('the card without any figures says so', () => {
  assert.deepEqual(cardLines([], 120).map(text).slice(1), ['nothing changed by Claude yet today'])
})

test('the report carries the day and the totals', () => {
  const r = rank([record(undefined, '/w/shop', [ch('/w/shop/a', 3, 1, 2)], 1)])
  assert.match(reportText(r, grand(r), '2026-10-11'), /^2026-10-11: \+3 new · ~1 edited · −2 deleted · 1 project/)
})
