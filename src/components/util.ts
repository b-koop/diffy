import type { ChangeData } from 'react-diff-view'
import type { Hunk } from '../lib/parseDiff'
import { problemFileName, serializeProblem } from '../lib/problemFile'
import { useStore, type Problem } from '../store'
import { locate, type Pos, type Side } from '../lib/snippet'

export function download(name: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** Downloads one problem, with its own comments and used custom tags, as a `.diffy.json` file. */
export function exportProblem(problem: Problem) {
  const { comments, customTags } = useStore.getState()
  download(problemFileName(problem.title), serializeProblem(problem, comments, customTags))
}

/** Line number and side a gutter click refers to. */
export function lineOf(change: ChangeData, side?: Side): { side: Side; lineNumber: number } {
  if (change.type === 'insert') return { side: 'new', lineNumber: change.lineNumber }
  if (change.type === 'delete') return { side: 'old', lineNumber: change.lineNumber }
  return side === 'old'
    ? { side: 'old', lineNumber: change.oldLineNumber }
    : { side: 'new', lineNumber: change.newLineNumber }
}

/** The change a comment on (side, lineNumber) belongs to, or undefined if the line is gone. */
export function changeAt(hunks: Hunk[], side: Side, lineNumber: number) {
  for (const h of hunks) {
    const c = h.changes.find((x) =>
      side === 'new'
        ? (x.type === 'insert' && x.lineNumber === lineNumber) || (x.type === 'normal' && x.newLineNumber === lineNumber)
        : (x.type === 'delete' && x.lineNumber === lineNumber) || (x.type === 'normal' && x.oldLineNumber === lineNumber),
    )
    if (c) return c
  }
}

export const readFile = (f: File) => f.text()

export type ClickResult =
  | { kind: 'start'; start: Pos }
  | { kind: 'single'; start: Pos }
  | { kind: 'range'; start: Pos; end: Pos }
  | { kind: 'cross' }

/**
 * What a gutter click means. With no pending start, it becomes the start. Clicking the
 * pending line again yields a single-line comment; another line in the same hunk completes
 * a range (ordered by hunk position); a line in another hunk is rejected.
 */
export function resolveClick(hunks: Hunk[], pending: Pos | undefined, clicked: Pos): ClickResult {
  const a = pending && locate(hunks, pending.side, pending.lineNumber)
  const b = locate(hunks, clicked.side, clicked.lineNumber)
  if (!pending || !a || !b) return { kind: 'start', start: clicked }
  if (a.hunk !== b.hunk) return { kind: 'cross' }
  if (a.index === b.index) return { kind: 'single', start: pending }
  return a.index < b.index ? { kind: 'range', start: pending, end: clicked } : { kind: 'range', start: clicked, end: pending }
}
