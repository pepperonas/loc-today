/**
 * Renders the README images from the mod's own renderer (hooks/row.ts) and
 * tally (hooks/tally.ts): sample sessions are recorded and ranked exactly as
 * the mod does, and the segments it returns are what the pictures show.
 *
 *   npm run screenshots   # docs/*.png, docs/demo.gif, docs/social.png, .claude-plugin/icon.png
 *
 * Needs Playwright's Chromium (`npx playwright install chromium`) and ffmpeg
 * for the GIF.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'

import { cardLines, rowSegs } from '../hooks/row.ts'
import type { Seg } from '../hooks/row.ts'
import { grand, rank, record } from '../hooks/tally.ts'
import type { SessionDay } from '../hooks/tally.ts'

const ROOT = resolve(import.meta.dirname, '..')
const DOCS = join(ROOT, 'docs')
const TMP = join(DOCS, '.render')

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const seg = (s: Seg) =>
  `<span style="${s.color ? `color:${s.color};` : ''}${s.dim ? 'opacity:.55;' : ''}${s.bold ? 'font-weight:700;' : ''}">${esc(s.text)}</span>`
const line = (segs: Seg[]) => `<div class="ln">${segs.map(seg).join('') || '&nbsp;'}</div>`

type Work = [root: string, file: string, created: number, edited?: number, deleted?: number]
/** A sample day: what three sessions did, in order. */
const WORK: Work[] = [
  ['/Users/me/src/shop', 'src/routes/login.ts', 120, 14, 6],
  ['/Users/me/src/shop', 'src/lib/rate-limit.ts', 86],
  ['/Users/me/src/api', 'internal/billing/invoice.go', 214, 31, 18],
  ['/Users/me/src/shop', 'tests/login.spec.ts', 162, 4],
  ['/Users/me/src/blog', 'posts/2026-10-11.md', 64, 9],
  ['/Users/me/src/api', 'internal/billing/tax.go', 71, 22, 40],
  ['/Users/me/dotfiles', '.zshrc', 3, 2, 1],
  ['/Users/me/src/infra', 'nginx/shop.conf', 18, 6, 11],
  ['/Users/me/src/shop', 'src/legacy/session.ts', 0, 0, 148],
]

function dayAfter(n: number): SessionDay[] {
  const sessions: (SessionDay | undefined)[] = [undefined, undefined, undefined]
  WORK.slice(0, n).forEach(([root, file, c, e = 0, d = 0], i) => {
    const s = i % 3
    sessions[s] = record(sessions[s], root, [{ path: `${root}/${file}`, counts: { created: c, edited: e, deleted: d } }], i)
  })
  return sessions.filter((s): s is SessionDay => !!s)
}

const CSS = `
*{box-sizing:border-box}
body{margin:0;background:transparent;font-family:"SF Mono",Menlo,"JetBrains Mono",monospace;font-size:15px;color:#e6edf3}
#shot{padding:24px}
.win{background:#0d1117;border:1px solid #30363d;border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.45)}
.bar{display:flex;align-items:center;gap:8px;padding:11px 14px;border-bottom:1px solid #21262d}
.dot{width:12px;height:12px;border-radius:50%}
.title{flex:1;text-align:center;color:#8b949e;font-size:13px;margin-right:52px}
.body{padding:16px 22px 18px;line-height:1.6;white-space:pre}
.ln{min-height:1.6em}
.muted{color:#8b949e}
.rule{border-top:1px solid #30363d;margin:8px 0}
.card{border:1px solid #30363d;border-radius:10px;padding:6px 12px;margin-top:4px}
.hov{background:#1f6feb22;border-radius:4px}
.cap{color:#8b949e;font-size:12.5px;padding:0 0 6px 2px;font-family:-apple-system,"Segoe UI",sans-serif}
`

function frame(title: string, inner: string) {
  return `<style>${CSS}</style><div class="win"><div class="bar"><span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span><span class="title">${esc(title)}</span></div><div class="body">${inner}</div></div>`
}

/** The prompt area as Claude Code draws it, with the mod's line under it and, when hovered, the card. */
function prompt(days: SessionDay[], hovered: boolean, columns = 120, said = 'Added the billing export and its tests · all 64 pass') {
  const ranked = rank(days)
  const compact = columns < 80
  const row = line(rowSegs(grand(ranked), ranked.length, compact))
  const card = hovered && !compact ? `<div class="card">${cardLines(ranked, columns).map(line).join('')}</div>` : ''
  return `<div class="ln"><span>⏺ </span>${esc(said)}</div><div class="rule"></div><div class="ln">❯ </div><div class="rule"></div><div class="ln muted">  ⏵⏵ auto mode on (shift+tab to cycle)</div><div class="${hovered ? 'hov' : ''}">${row}</div>${card}`
}

async function main() {
  rmSync(TMP, { recursive: true, force: true })
  mkdirSync(join(TMP, 'f'), { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1280, height: 900 } })
  async function shoot(name: string, html: string, out = join(DOCS, `${name}.png`), width = 1160) {
    await page.setViewportSize({ width, height: 900 })
    await page.setContent(`<body><div id="shot">${html}</div></body>`)
    await page.locator('#shot').screenshot({ path: out, omitBackground: true })
  }

  const full = dayAfter(WORK.length)
  await shoot('hero', frame('claude — ~/src/shop', prompt(full, true)))

  const states = [
    ['first thing in the morning', prompt([], false)],
    ['a busy day, all sessions summed', prompt(full, false)],
    ['narrow terminal: numbers only', prompt(full, false, 70)],
  ]
  await shoot('states', states.map(([cap, html]) => `<div class="cap">${esc(cap!)}</div>${frame('claude', html!)}`).join('<div style="height:14px"></div>'))

  // Demo: the day fills up as three sessions work, then the pointer rests on the line.
  let f = 0
  const put = async (html: string, times: number) => {
    for (let k = 0; k < times; k++) await shoot('frame', html, join(TMP, 'f', `f${String(f++).padStart(3, '0')}.png`))
  }
  for (let n = 0; n <= WORK.length; n++) await put(frame('claude — ~/src/shop', prompt(dayAfter(n), false)), n === 0 ? 3 : 2)
  await put(frame('claude — ~/src/shop', prompt(full, true)), 8)
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '2', '-i', join(TMP, 'f', 'f%03d.png'), '-vf', 'scale=1160:-1:flags=lanczos,split[a][b];[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse=dither=none', '-loop', '0', join(DOCS, 'demo.gif')])

  // Listing icon.
  const icon = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 })
  await icon.setContent(`<body style="margin:0">${readFileSync(join(DOCS, 'icon.svg'), 'utf8')}</body>`)
  await icon.locator('svg').screenshot({ path: join(ROOT, '.claude-plugin', 'icon.png') })

  // Social preview, 1280×640.
  const social = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 })
  const ranked = rank(full)
  await social.setContent(`<style>${CSS}
body{width:1280px;height:640px;overflow:hidden;margin:0;padding:56px 72px;font-family:-apple-system,"SF Pro Display","Segoe UI",sans-serif;color:#e6edf3;
background:radial-gradient(1000px 500px at 85% 0%,#3fb95033,transparent),radial-gradient(800px 500px at 0% 100%,#d9775730,transparent),#0d1117;display:flex;flex-direction:column}
.kicker{font-size:22px;letter-spacing:.18em;text-transform:uppercase;color:#8b949e;font-weight:600}
h1{font-size:92px;line-height:1;margin:12px 0 10px;font-weight:800;letter-spacing:-.02em}
h1 span{color:#3fb950}
p{font-size:28px;color:#c9d1d9;max-width:1100px;line-height:1.3;margin:0}
.term{margin-top:auto;background:#0d1117ee;border:1px solid #30363d;border-radius:14px;padding:16px 22px;font-family:"SF Mono",Menlo,monospace;font-size:17px;line-height:1.55;white-space:pre;box-shadow:0 20px 60px rgba(0,0,0,.5)}
</style>
<div class="kicker">Claude Code mod</div>
<h1>loc<span>-</span>today</h1>
<p>Every line Claude wrote today, across all sessions — and which project it went to.</p>
<div class="term">${line(rowSegs(grand(ranked), ranked.length, false))}${cardLines(ranked, 120).slice(0, 5).map(line).join('')}</div>`)
  await social.screenshot({ path: join(DOCS, 'social.png') })

  await browser.close()
  rmSync(TMP, { recursive: true, force: true })
  console.log('docs/: hero.png states.png demo.gif social.png · .claude-plugin/icon.png')
}

await main()
