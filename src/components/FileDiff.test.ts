import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { parseDiff } from '../lib/parseDiff'
import { FileDiff } from './FileDiff'

const highlightingCases = [
  ...['c', 'h'].map((extension) => ({ extension, source: 'const char *message = "hello";', keyword: 'const', literal: '&quot;hello&quot;', token: 'string' })),
  ...['cpp', 'cc', 'cxx', 'hpp', 'hh', 'hxx'].map((extension) => ({ extension, source: 'constexpr auto message = "hello";', keyword: 'constexpr', literal: '&quot;hello&quot;', token: 'string' })),
  { extension: 'java', source: 'public class Demo { String message = "hello"; }', keyword: 'public', literal: '&quot;hello&quot;', token: 'string' },
  { extension: 'swift', source: 'let message = "hello"', keyword: 'let', literal: '&quot;hello&quot;', token: 'string' },
  ...['js', 'jsx', 'mjs', 'mjx'].map((extension) => ({ extension, source: 'export const node = <div title="hello" />;', keyword: 'export', literal: 'hello', token: 'attr-value' })),
  ...['ts', 'tsx'].map((extension) => ({ extension, source: 'const message: string = "hello";', keyword: 'const', literal: '&quot;hello&quot;', token: 'string' })),
]

function renderFile(path: string, source: string, viewType: 'unified' | 'split') {
  const parsed = parseDiff(`diff --git a/${path} b/${path}
--- a/${path}
+++ b/${path}
@@ -1 +1 @@
-before
+${source}
`)
  if (!parsed.ok) throw new Error(parsed.error)
  return renderToStaticMarkup(createElement(FileDiff, {
    file: parsed.files[0],
    candidateId: 'candidate-1',
    comments: [],
    viewType,
    openAll: { open: true, version: 1 },
    query: '',
    onHoverWord: () => {},
  }))
}

describe('diff file controls and highlighting', () => {
  it.each(highlightingCases)('highlights .$extension source in unified and split views', ({ extension, source, keyword, literal, token }) => {
    for (const viewType of ['unified', 'split'] as const) {
      const markup = renderFile(`Demo.${extension}`, source, viewType)
      expect(markup).toMatch(new RegExp(`<span class="[^"]*token keyword[^"]*">${keyword}</span>`))
      expect(markup).toContain(`<span class="token ${token}`)
      expect(markup).toContain(literal)
    }
  })

  it('recognizes extensions case-insensitively and leaves unsupported files plain', () => {
    const source = 'let message = "hello"'
    const swift = renderFile('Demo.SwIfT', source, 'unified')
    expect(swift).toMatch(/<span class="[^"]*token keyword[^"]*">let<\/span>/)
    expect(swift).toContain('<span class="token string">')

    const plain = renderFile('Demo.txt', source, 'unified')
    expect(plain).toContain('let message')
    expect(plain).toContain('&quot;hello&quot;')
    expect(plain).not.toContain('token keyword')
    expect(plain).not.toContain('token string')
  })

  it('places a labeled path-copy button beside the file toggle without nesting buttons', () => {
    const markup = renderFile('src/a.ts', 'const newValue = 1', 'unified')
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
