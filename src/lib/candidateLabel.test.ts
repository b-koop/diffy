import { describe, expect, it } from 'vitest'
import { nextCandidateLabel } from './candidateLabel'

const candidates = (labels: string[]) => labels.map((label) => ({ label }))

describe('automatic candidate labels', () => {
  it('starts with A and advances through the next unused letter', () => {
    expect(nextCandidateLabel([])).toBe('A')
    expect(nextCandidateLabel(candidates(['A', 'B']))).toBe('C')
  })

  it('fills a deleted letter without renaming custom candidate labels', () => {
    expect(nextCandidateLabel(candidates(['A', 'Plan B', 'C']))).toBe('B')
  })

  it('uses spreadsheet-style labels after Z', () => {
    expect(nextCandidateLabel(candidates('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')))).toBe('AA')
  })
})
