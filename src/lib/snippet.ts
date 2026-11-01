import type { Hunk } from './parseDiff'

export type Side = 'old' | 'new'
export interface Pos {
  side: Side
  lineNumber: number
}
type Change = Hunk['changes'][number]

const matches = (c: Change, side: Side, lineNumber: number) =>
  side === 'new'
    ? (c.type === 'insert' && c.lineNumber === lineNumber) || (c.type === 'normal' && c.newLineNumber === lineNumber)
    : (c.type === 'delete' && c.lineNumber === lineNumber) || (c.type === 'normal' && c.oldLineNumber === lineNumber)

const render = (changes: Change[]) =>
  changes.map((c) => (c.type === 'insert' ? '+' : c.type === 'delete' ? '-' : ' ') + c.content).join('\n')

/** The hunk and change index holding the line, or undefined. */
export function locate(hunks: Hunk[], side: Side, lineNumber: number) {
  for (const hunk of hunks) {
    const index = hunk.changes.findIndex((c) => matches(c, side, lineNumber))
    if (index !== -1) return { hunk, index, change: hunk.changes[index] }
  }
}

/** The changes from `start` to `end` inclusive. Undefined if either is missing, they are in different hunks, or end precedes start. */
export function rangeChanges(hunks: Hunk[], start: Pos, end: Pos): Change[] | undefined {
  const a = locate(hunks, start.side, start.lineNumber)
  const b = a && a.hunk.changes.findIndex((c) => matches(c, end.side, end.lineNumber))
  if (!a || b === undefined || b < a.index) return undefined
  return a.hunk.changes.slice(a.index, b + 1)
}

/**
 * The commented line plus `context` surrounding lines from its hunk, as diff text
 * (each line prefixed with ' ', '+' or '-'). Returns '' if the line is not in the hunks.
 */
export function makeSnippet(hunks: Hunk[], side: Side, lineNumber: number, context = 3): string {
  const f = locate(hunks, side, lineNumber)
  return f ? render(f.hunk.changes.slice(Math.max(0, f.index - context), f.index + context + 1)) : ''
}

/** Exactly the lines from start to end (no extra context), prefixed git-style. '' if the range is invalid. */
export function makeRangeSnippet(hunks: Hunk[], start: Pos, end: Pos): string {
  const r = rangeChanges(hunks, start, end)
  return r ? render(r) : ''
}

/** Unique selected rows in diff order; context rows always use their new-side address. */
export function linkedPositions(hunks: Hunk[], lines: Pos[]): Pos[] {
  const selected = new Set(lines.map((p) => locate(hunks, p.side, p.lineNumber)?.change).filter(Boolean))
  return hunks.flatMap((h) => h.changes.filter((c) => selected.has(c)).map((c): Pos =>
    c.type === 'normal' ? { side: 'new', lineNumber: c.newLineNumber }
      : { side: c.type === 'delete' ? 'old' : 'new', lineNumber: c.lineNumber }))
}

/** Only selected rows, with an explicit separator wherever diff rows were skipped. */
export function makeLinkedSnippet(hunks: Hunk[], lines: Pos[]): string {
  if (!lines.length || lines.some((p) => !locate(hunks, p.side, p.lineNumber))) return ''
  const ordered = linkedPositions(hunks, lines)
  let previous: ReturnType<typeof locate>
  return ordered.map((p) => {
    const row = locate(hunks, p.side, p.lineNumber)!
    const gap = previous && (previous.hunk !== row.hunk || row.index !== previous.index + 1) ? '…\n' : ''
    previous = row
    return gap + render([row.change])
  }).join('\n')
}
