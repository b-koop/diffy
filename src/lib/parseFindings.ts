import type { FindingAnswer } from './findings'
export interface FindingImportItem {
  sourceNumber: string; title: string; rawText: string; claim: string; evidence: string; proposedFix: string
  findingAnswer: FindingAnswer; fixAnswer: FindingAnswer; unresolvedText: string; needsConfirmation: boolean
}
export type FindingParseResult = { ok: true; items: FindingImportItem[]; rawText: string; fragments: string[] } | { ok: false; error: string }
const empty = (): FindingAnswer => ({ decision: 'unreviewed', text: '' })
const clean = (s: string) => s.replace(/^[\s\u2009\u200a\u202f]+|[\s\u2009\u200a\u202f]+$/g, '')
export function parseFindings(input: string): FindingParseResult {
  if (!input.trim()) return { ok: false, error: 'Paste one or more findings.' }
  const normalized = input.replace(/\r\n?/g, '\n')
  const lines = normalized.split('\n')
  const starts: number[] = []
  lines.forEach((line, i) => { if (/^\d+\.\s+.+$/.test(clean(line))) starts.push(i) })
  const items: FindingImportItem[] = []
  starts.forEach((start, index) => {
    const end = starts[index + 1] ?? lines.length
    const slice = lines.slice(start, end)
    const labels = slice.map((line, i) => ({ value: clean(line), i })).filter((x) => x.value !== '*')
    const evidence = labels.find((x) => x.value === 'Cited evidence')
    const q1 = labels.find((x) => x.value === 'Would you raise this finding?')
    const q2 = labels.find((x) => x.value === 'Would you recommend this fix?')
    if (!evidence || !q1 || !q2 || !(evidence.i < q1.i && q1.i < q2.i)) return
    const header = clean(slice[0]).match(/^(\d+)\.\s+(.+)$/)!
    const content = (a: number, b: number) => clean(slice.slice(a, b).filter((l) => clean(l) !== '*').join('\n'))
    const findingResponse = labels.find((x) => x.i > q1.i && x.i < q2.i && ['Revised finding', 'Why? One sentence.'].includes(x.value))
    const fixResponse = labels.find((x) => x.i > q2.i && ['Revised fix', 'Why? One sentence.'].includes(x.value))
    const unresolvedText = findingResponse ? content(findingResponse.i + 1, q2.i) : ''
    const trailing = content(q2.i + 1, fixResponse ? fixResponse.i : slice.length)
    items.push({ sourceNumber: header[1], title: header[2], rawText: slice.join('\n'), claim: content(1, evidence.i), evidence: content(evidence.i + 1, q1.i), proposedFix: findingResponse ? '' : content(q1.i + 1, q2.i), findingAnswer: { ...empty(), text: findingResponse && !unresolvedText ? content(findingResponse.i + 1, q2.i) : '' }, fixAnswer: { ...empty(), text: fixResponse ? content(fixResponse.i + 1, slice.length) : '' }, unresolvedText: unresolvedText || (trailing && !fixResponse ? trailing : ''), needsConfirmation: Boolean(findingResponse || trailing) })
  })
  if (!items.length) return { ok: false, error: 'No complete findings found. Include each numbered title, cited evidence, and both review questions.' }
  const fragments: string[] = []
  let cursor = 0
  for (const item of items) {
    const pos = normalized.indexOf(item.rawText, cursor)
    if (pos > cursor) fragments.push(normalized.slice(cursor, pos))
    cursor = pos + item.rawText.length
  }
  if (cursor < normalized.length) fragments.push(normalized.slice(cursor))
  return { ok: true, items, rawText: input, fragments: fragments.filter((x) => x.trim()) }
}
