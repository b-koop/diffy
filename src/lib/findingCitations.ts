import type { DiffFile } from './parseDiff'
export type FindingCitation = { file: string; ranges: { start: number; end: number }[] }
export type CitationResolution = { status: 'available' | 'partial' | 'missing' | 'ambiguous' | 'binary'; message: string; target?: { file: string; side: 'old' | 'new'; lineNumber: number } }
export function parseFindingCitations(evidence: string): FindingCitation[] {
  const result: FindingCitation[] = []
  for (const line of evidence.split(/\r?\n/)) {
    const match = line.trim().match(/^(.+?):([0-9]+(?:-[0-9]+)?(?:,[0-9]+(?:-[0-9]+)?)*)\b.*$/)
    if (!match) continue
    const ranges: { start: number; end: number }[] = []
    for (const part of match[2].split(',')) {
      const [a, b = a] = part.split('-').map(Number)
      if (Number.isSafeInteger(a) && a > 0 && Number.isSafeInteger(b) && b >= a) ranges.push({ start: a, end: b })
    }
    if (ranges.length) result.push({ file: match[1], ranges })
  }
  return result
}
export function resolveFindingCitation(citation: FindingCitation, files: DiffFile[], side: 'old' | 'new'): CitationResolution {
  let matches = files.filter((f) => [f.oldPath, f.newPath, f.path].includes(citation.file))
  if (!matches.length) matches = files.filter((f) => [f.oldPath, f.newPath, f.path].some((p) => p.split('/').at(-1) === citation.file.split('/').at(-1)))
  if (matches.length > 1) return { status: 'ambiguous', message: 'Ambiguous path in patch' }
  const file = matches[0]
  if (!file) return { status: 'missing', message: 'File not present in patch' }
  if (file.isBinary) return { status: 'binary', message: 'Binary content unavailable' }
  const available = new Set<number>()
  for (const h of file.hunks) for (const c of h.changes) {
    if (side === 'new' && c.type !== 'delete') available.add(c.type === 'normal' ? c.newLineNumber : c.lineNumber)
    if (side === 'old' && c.type !== 'insert') available.add(c.type === 'normal' ? c.oldLineNumber : c.lineNumber)
  }
  const ranges = [...citation.ranges].filter((r) => Number.isSafeInteger(r.start) && Number.isSafeInteger(r.end) && r.start > 0 && r.end >= r.start).sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: { start: number; end: number }[] = []
  for (const range of ranges) {
    const last = merged[merged.length - 1]
    if (last && range.start <= last.end + 1) last.end = Math.max(last.end, range.end)
    else merged.push({ ...range })
  }
  const citedCount = merged.reduce((count, range) => count + BigInt(range.end - range.start + 1), 0n)
  const found = [...available].filter((line) => merged.some((range) => line >= range.start && line <= range.end)).sort((a, b) => a - b)
  if (!found.length) return { status: 'missing', message: 'Outside available patch context' }
  const full = BigInt(found.length) === citedCount
  return { status: full ? 'available' : 'partial', message: full ? 'Available in patch' : 'Some lines are outside available patch context', target: { file: file.path, side, lineNumber: found[0] } }
}
