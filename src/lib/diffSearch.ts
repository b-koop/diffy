import type { Hunk } from './parseDiff.js'

export interface TextMatch {
  lineNumber: number
  start: number
  length: number
}

export function findTextMatches(lines: Array<{ lineNumber?: number; content: string }>, query: string): TextMatch[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return []
  const matches: TextMatch[] = []
  for (const line of lines) {
    if (line.lineNumber === undefined) continue
    const content = line.content
    const lower = content.toLocaleLowerCase()
    let from = 0
    while (from <= lower.length - needle.length) {
      const start = lower.indexOf(needle, from)
      if (start < 0) break
      matches.push({ lineNumber: line.lineNumber, start, length: needle.length })
      from = start + needle.length
    }
  }
  return matches
}

export function getSearchRanges(hunks: Hunk[], query: string): { oldRanges: TextMatch[]; newRanges: TextMatch[] } {
  const oldLines: Array<{ lineNumber?: number; content: string }> = []
  const newLines: Array<{ lineNumber?: number; content: string }> = []
  for (const hunk of hunks) {
    for (const change of hunk.changes) {
      if (change.type !== 'insert') oldLines.push({ lineNumber: change.type === 'normal' ? change.oldLineNumber : change.lineNumber, content: change.content })
      if (change.type !== 'delete') newLines.push({ lineNumber: change.type === 'normal' ? change.newLineNumber : change.lineNumber, content: change.content })
    }
  }
  return { oldRanges: findTextMatches(oldLines, query), newRanges: findTextMatches(newLines, query) }
}

export function getTokenRanges(hunks: Hunk[], word?: string): { oldRanges: TextMatch[]; newRanges: TextMatch[] } {
  if (!word) return { oldRanges: [], newRanges: [] }
  const collect = (side: 'old' | 'new') => {
    const lines: Array<{ lineNumber?: number; content: string }> = []
    for (const hunk of hunks) {
      for (const change of hunk.changes) {
        if ((side === 'old' && change.type === 'insert') || (side === 'new' && change.type === 'delete')) continue
        let lineNumber: number | undefined
        if (change.type === 'normal') lineNumber = side === 'old' ? change.oldLineNumber : change.newLineNumber
        else lineNumber = change.lineNumber
        lines.push({ lineNumber, content: change.content })
      }
    }
    const matches: TextMatch[] = []
    for (const line of lines) {
      if (line.lineNumber === undefined) continue
      const content = line.content
      for (const match of content.matchAll(/[\p{L}_$][\p{L}\p{N}_$]*/gu)) {
        if (match[0] === word) matches.push({ lineNumber: line.lineNumber, start: match.index ?? 0, length: word.length })
      }
    }
    return matches
  }
  return { oldRanges: collect('old'), newRanges: collect('new') }
}

export function countFileMatches(file: { path: string; hunks: Hunk[] }, query: string): number {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return 0
  const pathMatches = file.path.toLocaleLowerCase().split(needle).length - 1
  const lines = file.hunks.flatMap((hunk) => hunk.changes.map((change) => ({
    lineNumber: change.type === 'normal' ? change.newLineNumber : change.lineNumber,
    content: change.content,
  })))
  return pathMatches + findTextMatches(lines, query).length
}

export function tokenAt(text: string, offset: number): string | undefined {
  const tokens = text.match(/[\p{L}_$][\p{L}\p{N}_$]*/gu) ?? []
  let cursor = 0
  for (const token of tokens) {
    const start = text.indexOf(token, cursor)
    if (offset >= start && offset < start + token.length) return token
    cursor = start + token.length
  }
  return undefined
}
