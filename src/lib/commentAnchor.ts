import type { Comment } from '../store'
import { linkedPositions, locate, makeLinkedSnippet, makeRangeSnippet, makeSnippet, type Pos, type Side } from './snippet'

export interface CommentAnchorDraft {
  side: Side
  lineNumber: number
  end?: Pos
  lines?: Pos[]
}

export type CommentAnchorPatch = Pick<Comment, 'side' | 'lineNumber' | 'end' | 'lines' | 'snippet'>

/** Resolve edited line fields against the candidate diff and regenerate their saved snippet. */
export function buildCommentAnchorPatch(hunks: Parameters<typeof makeSnippet>[0], anchor: CommentAnchorDraft): CommentAnchorPatch {
  const start: Pos = { side: anchor.side, lineNumber: anchor.lineNumber }
  if (anchor.lines) {
    if (!anchor.lines.some((line) => line.side === start.side && line.lineNumber === start.lineNumber)) {
      throw new Error('Linked lines must include the primary line.')
    }
    if (anchor.lines.some((line) => !locate(hunks, line.side, line.lineNumber))) {
      throw new Error('Every linked line must exist in this diff.')
    }
    const lines = linkedPositions(hunks, anchor.lines)
    const snippet = makeLinkedSnippet(hunks, lines)
    const primaryChange = locate(hunks, start.side, start.lineNumber)?.change
    const primary = lines.find((line) => locate(hunks, line.side, line.lineNumber)?.change === primaryChange)
    if (!primary || !snippet) throw new Error('Those lines are no longer in this diff.')
    return { ...primary, lines, end: undefined, snippet }
  }
  if (anchor.end) {
    const snippet = makeRangeSnippet(hunks, start, anchor.end)
    if (!snippet) throw new Error('Those lines are no longer in this diff.')
    return { ...start, end: anchor.end, lines: undefined, snippet }
  }
  const snippet = makeSnippet(hunks, start.side, start.lineNumber)
  if (!snippet) throw new Error('Those lines are no longer in this diff.')
  return { ...start, end: undefined, lines: undefined, snippet }
}
