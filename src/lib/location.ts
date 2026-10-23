import type { Hunk } from './parseDiff'
import { locate, type Pos } from './snippet'

/** Line label: "N" for added or context lines (new-side number), "-N" for removed lines. */
export function lineLabel(hunks: Hunk[], p: Pos): string {
  const change = locate(hunks, p.side, p.lineNumber)?.change
  if (change?.type === 'normal') return String(change.newLineNumber)
  const removed = change ? change.type === 'delete' : p.side === 'old'
  return (removed ? '-' : '') + p.lineNumber
}

/** "all" for a whole-file comment, "36" for a line, "36-40" for a range, "-37 to 38" when either end is a removed line. */
export function locationLabel(c: Partial<Pos> & { end?: Pos }, hunks: Hunk[]): string {
  if (c.side === undefined || c.lineNumber === undefined) return 'all'
  const start = lineLabel(hunks, { side: c.side, lineNumber: c.lineNumber })
  if (!c.end) return start
  const end = lineLabel(hunks, c.end)
  return start.startsWith('-') || end.startsWith('-') ? `${start} to ${end}` : `${start}-${end}`
}
