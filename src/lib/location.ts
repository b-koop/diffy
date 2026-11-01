import type { Hunk } from './parseDiff'
import { linkedPositions, locate, rangeChanges, type Pos } from './snippet'

/** Line label: "N" for added or context lines (new-side number), "-N" for removed lines. */
export function lineLabel(hunks: Hunk[], p: Pos): string {
  const change = locate(hunks, p.side, p.lineNumber)?.change
  if (change?.type === 'normal') return String(change.newLineNumber)
  const removed = change ? change.type === 'delete' : p.side === 'old'
  return (removed ? '-' : '') + p.lineNumber
}

/** Mixed removed/inserted selections name every selected row with explicit change signs. */
function mixedLineLabels(hunks: Hunk[], positions: Pos[]): string | undefined {
  const rows = positions.map((p) => ({ p, change: locate(hunks, p.side, p.lineNumber)?.change }))
  const removed = rows.some(({ p, change }) => change ? change.type === 'delete' : p.side === 'old')
  const added = rows.some(({ p, change }) => change ? change.type === 'insert' : p.side === 'new')
  if (!removed || !added) return undefined
  return rows.map(({ p, change }) => ((change?.type === 'insert' || (!change && p.side === 'new')) ? '+' : '') + lineLabel(hunks, p)).join(',')
}

/** Whole-file, single-line, and same-kind ranges retain compact labels; mixed selections use signed rows. */
export function locationLabel(c: Partial<Pos> & { end?: Pos; lines?: Pos[] }, hunks: Hunk[]): string {
  if (c.side === undefined || c.lineNumber === undefined) return 'all'
  if (c.lines) {
    const ordered = linkedPositions(hunks, c.lines)
    const positions = ordered.length ? ordered : c.lines
    return mixedLineLabels(hunks, positions) ?? positions.map((p) => lineLabel(hunks, p)).join(',')
  }
  const start = lineLabel(hunks, { side: c.side, lineNumber: c.lineNumber })
  if (!c.end) return start
  const changes = rangeChanges(hunks, { side: c.side, lineNumber: c.lineNumber }, c.end)
  if (changes) {
    const positions = changes.map((change): Pos => change.type === 'normal'
      ? { side: 'new', lineNumber: change.newLineNumber }
      : { side: change.type === 'delete' ? 'old' : 'new', lineNumber: change.lineNumber })
    const mixed = mixedLineLabels(hunks, positions)
    if (mixed) return mixed
  }
  const end = lineLabel(hunks, c.end)
  return start.startsWith('-') || end.startsWith('-') ? `${start} to ${end}` : `${start}-${end}`
}
