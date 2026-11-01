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
  it('lists signed rows in mixed ranges and preserves ranges without both change kinds', { tags: ['reporting'] }, () => {
    expect(locationLabel({ side: 'new', lineNumber: 5, end: { side: 'new', lineNumber: 7 } }, hunks)).toBe('5,-6,+6,7')
    expect(locationLabel({ side: 'old', lineNumber: 6, end: { side: 'new', lineNumber: 7 } }, hunks)).toBe('-6,+6,7')
    expect(locationLabel({ side: 'new', lineNumber: 5, end: { side: 'old', lineNumber: 6 } }, hunks)).toBe('5 to -6')
    expect(locationLabel({ side: 'new', lineNumber: 6, end: { side: 'new', lineNumber: 7 } }, hunks)).toBe('6-7')
  })
  it('is "all" for a whole-file comment', () => {
    expect(locationLabel({}, hunks)).toBe('all')
  })
})

const replacement = parseDiff(`diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -14,3 +23,3 @@
 context
-before
+after
 tail
`)
if (!replacement.ok) throw new Error(replacement.error)
const replacementHunks = replacement.files[0].hunks

it('distinguishes removed and inserted addresses in linked comments and contiguous replacements', { tags: ['important', 'reporting'] }, () => {
  const removed = { side: 'old', lineNumber: 15 } as const
  const added = { side: 'new', lineNumber: 24 } as const
  expect(locationLabel({ ...removed, lines: [added, removed] }, replacementHunks)).toBe('-15,+24')
  expect(locationLabel({ ...removed, end: added }, replacementHunks)).toBe('-15,+24')
  expect(locationLabel({ side: 'new', lineNumber: 23, end: { side: 'new', lineNumber: 25 } }, replacementHunks)).toBe('23,-15,+24,25')
  expect(locationLabel({ ...added, lines: [added] }, replacementHunks)).toBe('24')
  expect(locationLabel({ side: 'old', lineNumber: 14, lines: [{ side: 'old', lineNumber: 14 }, { side: 'new', lineNumber: 23 }] }, replacementHunks)).toBe('23')
})
