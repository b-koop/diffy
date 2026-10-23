import { describe, expect, it } from 'vitest'
import { parseDiff } from './parseDiff'
import { makeRangeSnippet, makeSnippet } from './snippet'

const diff = `diff --git a/a.txt b/a.txt
index 111..222 100644
--- a/a.txt
+++ b/a.txt
@@ -1,8 +1,8 @@
 l1
 l2
 l3
-old4
+new4
 l5
 l6
 l7
 l8
`
const hunks = (() => {
  const r = parseDiff(diff)
  if (!r.ok) throw new Error(r.error)
  return r.files[0].hunks
})()

describe('makeSnippet', () => {
  it('includes the added line with surrounding diff lines (3 each side)', () => {
    expect(makeSnippet(hunks, 'new', 4)).toBe([' l2', ' l3', '-old4', '+new4', ' l5', ' l6', ' l7'].join('\n'))
  })

  it('finds removed lines by old line number', () => {
    expect(makeSnippet(hunks, 'old', 4).split('\n')).toContain('-old4')
  })

  it('clamps context at hunk edges', () => {
    expect(makeSnippet(hunks, 'new', 1).split('\n')[0]).toBe(' l1')
  })

  it('returns empty string when the line is not in the diff', () => {
    expect(makeSnippet(hunks, 'new', 99)).toBe('')
  })
})

const multi = (() => {
  const r = parseDiff(`diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
@@ -1,4 +1,4 @@
 c1
-o2
+n2
+n3
 c4
@@ -20,2 +20,2 @@
 c20
-o21
+n21
`)
  if (!r.ok) throw new Error(r.error)
  return r.files[0].hunks
})()

describe('makeRangeSnippet', () => {
  it('returns exactly the range across context, removed and added lines, with prefixes', () => {
    expect(makeRangeSnippet(multi, { side: 'new', lineNumber: 1 }, { side: 'new', lineNumber: 3 })).toBe(
      [' c1', '-o2', '+n2', '+n3'].join('\n'),
    )
  })
  it('mixes sides: removed start, context end', () => {
    expect(makeRangeSnippet(multi, { side: 'old', lineNumber: 2 }, { side: 'new', lineNumber: 4 })).toBe(
      ['-o2', '+n2', '+n3', ' c4'].join('\n'),
    )
  })
  it('rejects ranges crossing hunks', () => {
    expect(makeRangeSnippet(multi, { side: 'new', lineNumber: 3 }, { side: 'new', lineNumber: 21 })).toBe('')
  })
  it('rejects reversed ranges and unknown lines', () => {
    expect(makeRangeSnippet(multi, { side: 'new', lineNumber: 3 }, { side: 'new', lineNumber: 2 })).toBe('')
    expect(makeRangeSnippet(multi, { side: 'new', lineNumber: 1 }, { side: 'new', lineNumber: 99 })).toBe('')
  })
})
