import { describe, expect, it } from 'vitest'
import { parseDiff } from './parseDiff'
import { buildCommentAnchorPatch } from './commentAnchor'

const parsed = parseDiff('diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,3 +1,3 @@\n one\n-old2\n+new2\n three\n')

if (!parsed.ok) throw new Error('Test diff did not parse')
const hunks = parsed.files[0].hunks

describe('editing comment lines', () => {
  it('moves the saved comment to a new diff line and refreshes its code context', () => {
    const patch = buildCommentAnchorPatch(hunks, { side: 'new', lineNumber: 2 })
    expect(patch).toMatchObject({ side: 'new', lineNumber: 2 })
    expect(patch.snippet).toContain('+new2')
  })

  it('keeps linked line anchors valid when the primary line normalizes to the new side', () => {
    const patch = buildCommentAnchorPatch(hunks, {
      side: 'old',
      lineNumber: 1,
      lines: [{ side: 'old', lineNumber: 1 }, { side: 'new', lineNumber: 2 }],
    })
    expect(patch).toMatchObject({ side: 'new', lineNumber: 1 })
  })

  it('keeps the comment unchanged when the selected line is absent from the diff', () => {
    expect(() => buildCommentAnchorPatch(hunks, { side: 'new', lineNumber: 99 })).toThrow('Those lines are no longer in this diff.')
  })
})
