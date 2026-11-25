import { describe, expect, it } from 'vitest'
import { parseFindings } from './parseFindings'
const source = `3. Duplicated logic or state\n\nThe reader and writer maintain separate copies.\n\nCited evidence\nMain.java:16,72-75,79,86\nMain.java:73 maps names to fields\nWould you raise this finding?\n *\nRevised finding\n *\nThe reader and writer use magic strings.\nKeep canonical spelling with each option.\nWould you recommend this fix?\n *\nRevised fix\n *\nCentralize each field in an enum.`
describe('parseFindings', () => {
  it('retains ambiguous response/fix segment for explicit assignment and response text', () => {
    const parsed = parseFindings(source)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.items[0]).toMatchObject({ sourceNumber: '3', title: 'Duplicated logic or state', claim: 'The reader and writer maintain separate copies.', evidence: 'Main.java:16,72-75,79,86\nMain.java:73 maps names to fields', proposedFix: '', needsConfirmation: true, unresolvedText: 'The reader and writer use magic strings.\nKeep canonical spelling with each option.', findingAnswer: { decision: 'unreviewed' }, fixAnswer: { decision: 'unreviewed', text: 'Centralize each field in an enum.' } })
    expect(parsed.items[0].rawText).toContain('Revised finding')
  })
  it('retains source and handles incomplete and empty input explicitly', () => {
    expect(parseFindings('')).toEqual({ ok: false, error: 'Paste one or more findings.' })
    expect(parseFindings('1. Not complete\nCited evidence')).toMatchObject({ ok: false })
    const crlf = parseFindings(source.replace(/\n/g, '\r\n'))
    expect(crlf.ok && crlf.rawText).toBe(source.replace(/\n/g, '\r\n'))
  })
})
