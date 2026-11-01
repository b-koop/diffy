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


it("offers separate keyboard controls to select a line and start its comment", { tags: ["important", "reporting"] }, () => {
  const parsed = parseDiff(`diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-old
+new
`)
  if (!parsed.ok) throw new Error(parsed.error)
  const markup = renderToStaticMarkup(createElement(FileDiff, { file: parsed.files[0], candidateId: "candidate", comments: [], viewType: "unified", openAll: { open: true, version: 1 }, query: "", onHoverWord: () => {} }))
  expect(markup).toContain("Select new line 1")
  expect(markup).toContain("Add comment on new line 1")
  expect(markup).toContain("Add comment on old line 1")
})

it('distinguishes the old and new addresses of unchanged code in split comment controls', { tags: ['reporting'] }, () => {
  const parsed = parseDiff(`diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -14,3 +23,3 @@
 context
-before
+after
 tail
`)
  if (!parsed.ok) throw new Error(parsed.error)
  const markup = renderToStaticMarkup(createElement(FileDiff, { file: parsed.files[0], candidateId: 'candidate', comments: [], viewType: 'split', openAll: { open: true, version: 1 }, query: '', onHoverWord: () => {} }))
  expect(markup).toContain('Add comment on old line 14')
  expect(markup).toContain('Add comment on new line 23')
  expect(markup).toContain('Add comment on old line 15')
  expect(markup).toContain('Add comment on new line 24')
})

it('keeps one comment action beside the code for every unified row, including removed lines', { tags: ['important', 'reporting'] }, () => {
  const parsed = parseDiff(`diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -14,3 +23,3 @@
 context
-before
+after
 tail
`)
  if (!parsed.ok) throw new Error(parsed.error)
  const markup = renderToStaticMarkup(createElement(FileDiff, { file: parsed.files[0], candidateId: 'candidate', comments: [], viewType: 'unified', openAll: { open: true, version: 1 }, query: '', onHoverWord: () => {} }))
  const rows = [...markup.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((match) => [...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => cell[1]))
  expect(rows).toHaveLength(4)
  for (const cells of rows) {
    expect(cells[0]).not.toContain('Add comment on')
    expect(cells[1].match(/aria-label="Add comment on/g)).toHaveLength(1)
  }
  expect(rows[1][0]).toContain('Select old line 15')
  expect(rows[1][1]).toContain('Add comment on old line 15')
  expect(rows[1][1]).not.toContain('Select new line')
  expect(rows[0][1]).toContain('Add comment on new line 23')
})
