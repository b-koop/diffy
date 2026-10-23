import { describe, expect, it } from 'vitest'
import { countLineChanges, summarizeDiffFiles } from './diffStats'
import type { Hunk } from './parseDiff'

const hunks = [{ changes: [
  { type: 'normal', oldLineNumber: 1, newLineNumber: 1, content: ' context' },
  { type: 'insert', lineNumber: 2, content: '+added' },
  { type: 'delete', lineNumber: 2, content: '-removed' },
  { type: 'insert', lineNumber: 3, content: '+also added' },
] }] as unknown as Hunk[]

describe('file change counts', () => {
  it('counts added and removed lines but excludes context lines', () => {
    expect(countLineChanges(hunks)).toEqual({ additions: 2, deletions: 1 })
  })

  it('returns zero counts for files without hunks', () => {
    expect(countLineChanges([])).toEqual({ additions: 0, deletions: 0 })
  })

  it('summarizes changed files and line totals across a diff', () => {
    expect(summarizeDiffFiles([{ hunks }, { hunks: [] }])).toEqual({ filesChanged: 2, additions: 2, deletions: 1 })
  })
})
