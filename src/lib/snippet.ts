import type { Hunk } from './parseDiff'

export type Side = 'old' | 'new'
export interface Pos {
  side: Side
  lineNumber: number
}
interface LocatedChange {
  hunk: Hunk
  index: number
  change: Change
}
type Change = Hunk['changes'][number]

const matches = (c: Change, side: Side, lineNumber: number) =>
  side === 'new'
    ? (c.type === 'insert' && c.lineNumber === lineNumber) || (c.type === 'normal' && c.newLineNumber === lineNumber)
    : (c.type === 'delete' && c.lineNumber === lineNumber) || (c.type === 'normal' && c.oldLineNumber === lineNumber)

const renderChange = (c: Change) => (c.type === 'insert' ? '+' : c.type === 'delete' ? '-' : ' ') + c.content
const render = (changes: Change[]) => changes.map(renderChange).join('\n')

/** The hunk and change index holding the line, or undefined. */
export function locate(hunks: Hunk[], side: Side, lineNumber: number): LocatedChange | undefined {
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
  let previous: LocatedChange | undefined
  return ordered.map((p) => {
    const row = locate(hunks, p.side, p.lineNumber)!
    const gap = previous && (previous.hunk !== row.hunk || row.index !== previous.index + 1) ? '…\n' : ''
    previous = row
    return gap + renderChange(row.change)
  }).join('\n')
}

export interface SnippetLineNumbers {
  oldLineNumber?: number
  newLineNumber?: number
}

/** Line numbers for a saved snippet, or undefined if the current diff no longer matches it. */
export function snippetLineNumbers(
  hunks: Hunk[],
  text: string,
  anchor: Pos & { end?: Pos; lines?: Pos[] },
): (SnippetLineNumbers | undefined)[] | undefined {
  let changes: (Change | undefined)[]
  if (anchor.lines) {
    const ordered = linkedPositions(hunks, anchor.lines)
    changes = []
    let previous: LocatedChange | undefined
    for (const position of ordered) {
      const row = locate(hunks, position.side, position.lineNumber)
      if (!row) return undefined
      if (previous && (previous.hunk !== row.hunk || row.index !== previous.index + 1)) changes.push(undefined)
      changes.push(row.change)
      previous = row
    }
  } else if (anchor.end) {
    const range = rangeChanges(hunks, anchor, anchor.end)
    if (!range) return undefined
    changes = range
  } else {
    const row = locate(hunks, anchor.side, anchor.lineNumber)
    if (!row) return undefined
    changes = row.hunk.changes.slice(Math.max(0, row.index - 3), row.index + 4)
  }

  const rows: ({ text: string } & SnippetLineNumbers)[] = changes.map((change) => {
    if (!change) return { text: '…' }
    const text = renderChange(change)
    switch (change.type) {
      case 'normal': return { text, oldLineNumber: change.oldLineNumber, newLineNumber: change.newLineNumber }
      case 'delete': return { text, oldLineNumber: change.lineNumber }
      case 'insert': return { text, newLineNumber: change.lineNumber }
    }
  })
  if (rows.map((row) => row.text).join('\n') !== text) return undefined
  return rows.map(({ oldLineNumber, newLineNumber }) => oldLineNumber === undefined && newLineNumber === undefined
    ? undefined
    : { oldLineNumber, newLineNumber })
}
