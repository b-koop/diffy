import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AskPanel } from './AskPanel'

describe('original request reading', () => {
  it('offers Markdown rendering enabled by default while displaying the request', { tags: ['reporting'] }, () => {
    const markup = renderToStaticMarkup(createElement(AskPanel, { problem: {
      id: 'request-1', title: 'Review', askMarkdown: '## Requirements\n\nKeep **all** details.', candidates: [],
    } }))

    expect(markup).toContain('type="checkbox"')
    expect(markup).toContain('checked=""')
    expect(markup).toContain('Render Markdown')
    expect(markup).toContain('<h2>Requirements</h2>')
    expect(markup).toContain('<strong>all</strong>')
  })
})
