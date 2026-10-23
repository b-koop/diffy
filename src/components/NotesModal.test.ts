import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Problem } from '../store'
import { NotesModal } from './NotesModal'

describe('output notes dialog', () => {
  it('exposes an accessible close control', () => {
    const problem: Problem = { id: 'review-1', title: 'Review', askMarkdown: '', candidates: [] }
    const markup = renderToStaticMarkup(createElement(NotesModal, { problem, onClose: () => {} }))

    expect(markup).toContain('aria-label="Close output notes"')
  })
})
