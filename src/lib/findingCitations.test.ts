import { describe, expect, it } from 'vitest'
import { parseDiff } from './parseDiff'
import { parseFindingCitations, resolveFindingCitation } from './findingCitations'
const diff = `diff --git a/Main.java b/Main.java\n--- a/Main.java\n+++ b/Main.java\n@@ -55,3 +55,3 @@\n-old55\n+new55\n context56\n context57\n`
describe('finding citations', () => {
  it('parses compact citations and distinguishes present from omitted context', () => {
    const citations = parseFindingCitations('Main.java:55,56,59-60')
    expect(citations).toEqual([{ file: 'Main.java', ranges: [{ start: 55, end: 55 }, { start: 56, end: 56 }, { start: 59, end: 60 }] }])
    const parsed = parseDiff(diff)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(resolveFindingCitation(citations[0], parsed.files, 'new')).toMatchObject({ status: 'partial', target: { side: 'new', lineNumber: 55 } })
    expect(resolveFindingCitation(citations[0], parsed.files, 'old')).toMatchObject({ status: 'partial', target: { side: 'old', lineNumber: 55 } })
  })
})
