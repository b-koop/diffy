import { describe, expect, it } from 'vitest'
import { locationLabel } from './location'
import { parseDiff } from './parseDiff'

const r = parseDiff(`diff --git a/a b/a
--- a/a
+++ b/a
@@ -5,4 +5,4 @@
 ctx
-gone
+added
 tail
`)
if (!r.ok) throw new Error(r.error)
const hunks = r.files[0].hunks

describe('locationLabel', () => {
  it('uses the plain new-side number for added lines and "-N" for removed lines', () => {
    expect(locationLabel({ side: 'new', lineNumber: 6 }, hunks)).toBe('6')
    expect(locationLabel({ side: 'old', lineNumber: 6 }, hunks)).toBe('-6')
  })
  it('uses the new-side number for context lines, whichever side was clicked', () => {
    expect(locationLabel({ side: 'new', lineNumber: 5 }, hunks)).toBe('5')
    expect(locationLabel({ side: 'old', lineNumber: 7 }, hunks)).toBe('7')
  })
  it('joins non-removed ends with a dash and uses "to" when either end is removed', () => {
    expect(locationLabel({ side: 'new', lineNumber: 5, end: { side: 'new', lineNumber: 7 } }, hunks)).toBe('5-7')
    expect(locationLabel({ side: 'old', lineNumber: 6, end: { side: 'new', lineNumber: 7 } }, hunks)).toBe('-6 to 7')
    expect(locationLabel({ side: 'new', lineNumber: 5, end: { side: 'old', lineNumber: 6 } }, hunks)).toBe('5 to -6')
  })
  it('is "all" for a whole-file comment', () => {
    expect(locationLabel({}, hunks)).toBe('all')
  })
})
