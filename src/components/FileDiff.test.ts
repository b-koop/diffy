import { describe, expect, it } from 'vitest'
import { tokenize, type HunkData } from 'react-diff-view'
import refractor from 'refractor/core'
import './FileDiff'

describe('JavaScript diff highlighting', () => {
  it('tokenizes JSX files without an unknown-language failure', () => {
    const hunks = [{ changes: [{ type: 'insert', lineNumber: 1, content: '+const node = <div />' }] }] as unknown as HunkData[]

    expect(() => tokenize(hunks, { highlight: true, refractor, language: 'jsx' })).not.toThrow()
  })
})
