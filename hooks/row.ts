/**
 * What is drawn, as plain styled text: the line under the prompt, the hover
 * card with the projects and the `/loc-today` report. Engine-free, so the
 * tests and the screenshot tool use exactly what the mod draws.
 */
import { total } from './count'
import type { Counts } from './count'
import type { Ranked } from './tally'

export const GREEN = '#3fb950'
export const YELLOW = '#d29922'
export const RED = '#f85149'
export const BLUE = '#79c0ff'
export const MUTED = '#8b949e'

export type Seg = { text: string; color?: string; bg?: string; dim?: boolean; bold?: boolean }

/** Projects listed in the hover card; the rest are summed in one line. */
export const TOP = 10
/** Below this many columns the line drops its words. */
export const COMPACT_BELOW = 80

/** 1234 → "1,234"; 12345 → "12.3k". */
export function num(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`
  return n.toLocaleString('en-US')
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** The line under the prompt. */
export function rowSegs(sum: Counts, projects: number, compact: boolean): Seg[] {
  const out: Seg[] = []
  if (!total(sum) && !projects) {
    out.push({ text: compact ? 'Σ 0' : 'Σ today  no lines changed yet', dim: true })
    return out
  }
  out.push({ text: compact ? 'Σ ' : 'Σ today  ', dim: true })
  const part = (sign: string, n: number, word: string, color: string) => {
    out.push({ text: `${sign}${num(n)}`, color: n ? color : undefined, dim: !n, bold: !compact && n > 0 })
    if (!compact) out.push({ text: ` ${word}`, dim: true })
  }
  part('+', sum.created, 'new', GREEN)
  out.push({ text: compact ? ' ' : '  ', dim: true })
  part('~', sum.edited, 'edited', YELLOW)
  out.push({ text: compact ? ' ' : '  ', dim: true })
  part('−', sum.deleted, 'deleted', RED)
  if (!compact) out.push({ text: ` · ${plural(projects, 'project')}`, dim: true })
  return out
}

const pad = (s: string, w: number) => (s.length >= w ? s : s + ' '.repeat(w - s.length))
const padL = (s: string, w: number) => (s.length >= w ? s : ' '.repeat(w - s.length) + s)
const cut = (s: string, w: number) => (s.length <= w ? s : `${s.slice(0, Math.max(1, w - 1))}…`)

/** A bar `width` cells long, filled in proportion; at least one cell for any non-zero share. */
export function bar(part: number, whole: number, width: number): string {
  if (whole <= 0 || part <= 0) return '·'.repeat(width)
  const full = Math.max(1, Math.round((part / whole) * width))
  return '█'.repeat(Math.min(width, full)) + '·'.repeat(Math.max(0, width - full))
}

/** The hover card, one array of segments per line: a heading, the projects largest first, the rest summed. */
export function cardLines(ranked: readonly Ranked[], columns: number): Seg[][] {
  const lines: Seg[][] = []
  const shown = ranked.slice(0, TOP)
  const rest = ranked.slice(TOP)
  const nameW = Math.min(28, Math.max(8, ...shown.map(r => r.name.length)))
  const barW = columns >= 100 ? 16 : 10
  const top = shown[0]?.lines ?? 0
  const whole = ranked.reduce((a, r) => a + r.lines, 0)
  lines.push([
    { text: pad('today, by project', nameW + 3 + barW), color: BLUE, bold: true },
    { text: `   ${padL('new', 7)} ${padL('edited', 7)} ${padL('deleted', 7)}  files  share`, dim: true },
  ])
  if (!shown.length) {
    lines.push([{ text: 'nothing changed by Claude yet today', dim: true }])
    return lines
  }
  shown.forEach((r, i) => {
    const share = whole ? Math.round((r.lines / whole) * 100) : 0
    lines.push([
      { text: `${padL(String(i + 1), 2)} `, dim: true },
      { text: pad(cut(r.name, nameW), nameW), bold: i === 0 },
      { text: ` ${bar(r.lines, top, barW)}`, color: BLUE },
      { text: `   ${padL(`+${num(r.created)}`, 7)}`, color: r.created ? GREEN : undefined, dim: !r.created },
      { text: ` ${padL(`~${num(r.edited)}`, 7)}`, color: r.edited ? YELLOW : undefined, dim: !r.edited },
      { text: ` ${padL(`−${num(r.deleted)}`, 7)}`, color: r.deleted ? RED : undefined, dim: !r.deleted },
      { text: `  ${padL(String(r.fileCount), 5)}  ${padL(`${share}%`, 5)}`, dim: true },
    ])
  })
  if (rest.length) {
    const n = rest.reduce((a, r) => a + r.lines, 0)
    lines.push([{ text: `   … ${plural(rest.length, 'more project')}, ${num(n)} lines`, dim: true }])
  }
  return lines
}

/** `/loc-today`: the same card, as text. */
export function reportText(ranked: readonly Ranked[], sum: Counts, day: string): string {
  const head = `${day}: +${num(sum.created)} new · ~${num(sum.edited)} edited · −${num(sum.deleted)} deleted · ${plural(ranked.length, 'project')}`
  return [head, '', ...cardLines(ranked, 120).map(l => l.map(s => s.text).join(''))].join('\n')
}
