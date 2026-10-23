import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { tokenize, type HunkData } from 'react-diff-view'
import refractor from 'refractor/core'
import { parseDiff } from '../lib/parseDiff'
import { FileDiff } from './FileDiff'

describe('diff file controls and highlighting', () => {
  it('tokenizes JSX files without an unknown-language failure', () => {
    const hunks = [{ changes: [{ type: 'insert', lineNumber: 1, content: '+const node = <div />' }] }] as unknown as HunkData[]

    expect(() => tokenize(hunks, { highlight: true, refractor, language: 'jsx' })).not.toThrow()
  })

  it('places a labeled path-copy button beside the file toggle without nesting buttons', () => {
    const parsed = parseDiff([
      'diff --git a/src/a.ts b/src/a.ts',
      'index 1111111..2222222 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1 +1 @@',
      '-const oldValue = 1',
      '+const newValue = 1',
    ].join('\n'))
    if (!parsed.ok) throw new Error(parsed.error)

    const markup = renderToStaticMarkup(createElement(FileDiff, {
      file: parsed.files[0],
      candidateId: 'candidate-1',
      comments: [],
      viewType: 'unified',
      openAll: { open: false, version: 0 },
      query: '',
      onHoverWord: () => {},
    }))

    expect(markup).toMatch(/<div class="file-path-controls"><button[^>]*class="file-head"[^>]*>[\s\S]*?<\/button><button[^>]*aria-label="Copy file path"/)
  })
})
