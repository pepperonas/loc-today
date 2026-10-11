/**
 * Drift guards: they read a file and hold it to a fact, because what they
 * catch is silent — nothing crashes, the README just tells a stale story.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const README = read('README.md')
const manifest = JSON.parse(read('.claude-plugin/plugin.json'))
const pkg = JSON.parse(read('package.json'))
const market = JSON.parse(read('.claude-plugin/marketplace.json'))
const badge = (name: string) => README.match(new RegExp(`badge/${name}-([^-?]+)-`))?.[1]

/** `test(` calls in a file; inside the per-surface loop each runs twice. */
function countTests(file: string): number {
  const src = read(file)
  const top = (src.match(/^test\(/gm) ?? []).length
  const inLoop = (src.match(/^ {2}test\(/gm) ?? []).length
  const loop = src.match(/^for \(const surface of \[(.*?)\]/m)
  const perLoop = loop ? loop[1]!.split(',').length : 1
  return top + inLoop * perLoop
}
const files = (dir: string, re: RegExp) => readdirSync(join(ROOT, dir)).filter(f => re.test(f)).map(f => `${dir}/${f}`)

test('one version everywhere: badge, plugin.json, package.json, marketplace, CHANGELOG', () => {
  const v = manifest.version
  assert.match(v, /^\d+\.\d+\.\d+$/)
  assert.equal(pkg.version, v)
  assert.equal(badge('version'), v)
  assert.ok(read('CHANGELOG.md').includes(`## [${v}] - `), `CHANGELOG has no section for ${v}`)
  assert.ok(README.includes(`- **${v}** —`), `README changelog summary misses ${v}`)
})

test('CHANGELOG versions descend and carry valid dates', () => {
  const heads = [...read('CHANGELOG.md').matchAll(/^## \[(\d+)\.(\d+)\.(\d+)\] - (\d{4}-\d{2}-\d{2})$/gm)]
  assert.ok(heads.length >= 1)
  const rank = (h: RegExpMatchArray) => Number(h[1]) * 1e6 + Number(h[2]) * 1e3 + Number(h[3])
  for (let i = 1; i < heads.length; i++) assert.ok(rank(heads[i - 1]!) > rank(heads[i]!), 'versions must descend')
  for (const h of heads) assert.ok(!Number.isNaN(Date.parse(h[4]!)), `bad date ${h[4]}`)
})

test('the node-tests badge is the real number of node tests', () => {
  const n = files('tests', /\.spec\.ts$/).reduce((a, f) => a + countTests(f), 0)
  assert.equal(badge('node%20tests'), String(n))
})

test('the engine-tests badge is the real number of engine tests', () => {
  const n = files('hooks', /\.test\.tsx?$/).reduce((a, f) => a + countTests(f), 0)
  assert.equal(badge('engine%20tests'), String(n))
})

test('every /config field is in the README table, with its default', () => {
  for (const [opt, field] of Object.entries<{ default: unknown }>(manifest.userConfig)) {
    const row = README.split('\n').find(l => l.startsWith(`| \`${opt}\` |`))
    assert.ok(row, `README configuration table misses ${opt}`)
    const d = field.default
    const shown = typeof d === 'boolean' ? (d ? 'on' : 'off') : `\`${d}\``
    assert.ok(row.trimEnd().endsWith(`| ${shown} |`), `${opt}: README default should be ${shown}`)
  }
})

test('the default in the code is the default in plugin.json', () => {
  const src = read('hooks/register.tsx')
  assert.ok(src.includes(`isMode(options.mode) ? options.mode : '${manifest.userConfig.mode.default}'`))
})

test('every command the mod answers is documented', () => {
  const src = read('hooks/register.tsx')
  for (const cmd of ['full', 'compact', 'off', 'reset', 'reset all']) {
    assert.ok(src.includes(cmd), `the mod no longer knows ${cmd}`)
    assert.ok(README.includes(`/loc-today ${cmd}`), `README does not mention /loc-today ${cmd}`)
  }
})

test('every image the README shows exists, one sits above the title', () => {
  for (const [, src] of README.matchAll(/<img src="(docs\/[^"]+)"/g)) assert.ok(existsSync(join(ROOT, src!)), `missing ${src}`)
  assert.ok(README.indexOf('<img src=') < README.indexOf('# 📈 loc-today'), 'an image belongs at the very top, above the title')
})

test('the git commands the README lists are the ones the mod runs', () => {
  const src = read('hooks/register.tsx')
  const block = README.slice(README.indexOf('<!-- git-commands -->'), README.indexOf('<!-- /git-commands -->'))
  for (const c of ['rev-parse --show-toplevel', 'rev-parse HEAD', 'diff --numstat --no-renames HEAD', 'ls-files --others --exclude-standard']) {
    const argv = c.split(' ').map(a => `'${a}'`).join(', ')
    assert.ok(src.includes(argv), `the mod no longer runs git ${c}`)
    assert.ok(block.includes(`git ${c}`), `README git command list misses git ${c}`)
  }
})

test('MIT everywhere', () => {
  assert.ok(read('LICENSE').startsWith('MIT License'))
  assert.equal(manifest.license, 'MIT')
  assert.equal(pkg.license, 'MIT')
})

test('no runtime dependencies — the badge says so', () => {
  assert.equal(pkg.dependencies, undefined)
  assert.equal(badge('runtime%20dependencies'), '0')
})

test('the marketplace lists this plugin, from this repo, at the same version', () => {
  const entry = market.plugins.find((p: { name: string }) => p.name === manifest.name)
  assert.ok(entry, `marketplace.json has no entry for ${manifest.name}`)
  assert.equal(entry.source, './')
  assert.equal(entry.version, manifest.version)
  assert.equal(entry.description, manifest.description)
  // one marketplace per repo: a shared name would clash with the other mods' marketplaces
  assert.equal(market.name, `pepperonas-${manifest.name}`)
})

test('the README install commands name the real marketplace and plugin', () => {
  const id = `${manifest.name}@${market.name}`
  assert.ok(README.includes(`/plugin marketplace add pepperonas/${manifest.name}`), 'README misses marketplace add')
  assert.ok(README.includes(`/plugin install ${id}`), `README misses /plugin install ${id}`)
  assert.ok(README.includes(`claude plugin install ${id}`), `README misses claude plugin install ${id}`)
  for (const m of README.matchAll(/loc-today@([a-z0-9._-]+)/g)) assert.equal(m[1], market.name, `stale install id ${m[0]}`)
})

test('no lockfile in the plugin root: Claude Code would install the dev tools for every user', () => {
  for (const f of ['package-lock.json', 'npm-shrinkwrap.json', 'bun.lock', 'bun.lockb']) {
    assert.ok(!existsSync(join(ROOT, f)), `${f} must not exist — run npm install with the repo's .npmrc`)
  }
  assert.match(read('.npmrc'), /^package-lock=false$/m)
})

test('userConfig carries only the fields the plugin directory accepts', () => {
  const allowed = new Set(['type', 'title', 'description', 'default', 'sensitive', 'required', 'multiple', 'min', 'max'])
  for (const [opt, field] of Object.entries<Record<string, unknown>>(manifest.userConfig)) {
    for (const f of Object.keys(field)) assert.ok(allowed.has(f), `userConfig.${opt}.${f} is refused by the directory`)
    assert.ok(['string', 'number', 'boolean', 'directory', 'file'].includes(field.type as string), `userConfig.${opt}.type`)
    assert.ok(field.title && field.description, `userConfig.${opt} needs title and description`)
  }
  assert.match(manifest.userConfig.mode.description, /full.*compact.*off/)
})
