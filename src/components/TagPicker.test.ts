import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TagPicker } from './TagPicker'

describe('tag selection controls', () => {
  it('keeps tag removal accessible when rendered as an icon button', () => {
    const markup = renderToStaticMarkup(createElement(TagPicker, { value: ['unclear_code'], onChange: () => {} }))

    expect(markup).toMatch(/<button type="button" aria-label="Remove [^"]+"><svg/)
  })
})
