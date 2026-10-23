import { describe, expect, it } from 'vitest'
import { countFileMatches, findTextMatches, getSearchRanges, getTokenRanges, tokenAt } from './diffSearch'
import type { Hunk } from './parseDiff'

const file = {
  path: 'src/Button.tsx',
  hunks: [{ changes: [
    { type: 'normal', oldLineNumber: 4, newLineNumber: 4, content: ' const Button = createButton()' },
    { type: 'insert', lineNumber: 5, content: ' return Button' },
    { type: 'delete', lineNumber: 3, content: ' const oldButton = null' },
  ] }],
} as unknown as { path: string; hunks: Hunk[] }

describe('diff search', () => {
  it('finds case-insensitive literal occurrences in diff lines', () => {
    expect(findTextMatches([
      { lineNumber: 4, content: ' const Button = createButton()' },
      { lineNumber: 5, content: ' return Button' },
    ], 'button')).toEqual([
      { lineNumber: 4, start: 7, length: 6 },
      { lineNumber: 4, start: 22, length: 6 },
      { lineNumber: 5, start: 8, length: 6 }
    ])
  })

  it('keeps matches aligned when code starts in the first column', () => {
    expect(findTextMatches([{ lineNumber: 1, content: 'const value = 1' }], 'const')).toEqual([
      { lineNumber: 1, start: 0, length: 5 },
    ])
  })

  it('counts path and content matches for collapsed files', () => {
    expect(countFileMatches(file, 'button')).toBe(5)
    expect(countFileMatches(file, '[')).toBe(0)
  })

  it('finds every occurrence of a selected phrase in diff lines', () => {
    expect(getSearchRanges(file.hunks, 'const Button')).toEqual({
      oldRanges: [{ lineNumber: 4, start: 1, length: 12 }],
      newRanges: [{ lineNumber: 4, start: 1, length: 12 }],
    })
  })

  it('highlights exact identifier matches without matching identifier substrings', () => {
    expect(getTokenRanges(file.hunks, 'Button').newRanges).toEqual([
      { lineNumber: 4, start: 7, length: 6 },
      { lineNumber: 5, start: 8, length: 6 },
    ])
  })

  it('returns the identifier beneath a pointer offset only', () => {
    expect(tokenAt('const Button = makeButton()', 8)).toBe('Button')
    expect(tokenAt('const Button = makeButton()', 18)).toBe('makeButton')
    expect(tokenAt('const Button = makeButton()', 12)).toBeUndefined()
  })
})
