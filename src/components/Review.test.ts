import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore, type Store } from '../store'
import { Review } from './Review'

// Server rendering otherwise reads the store's original, empty hydration snapshot.
vi.mock('../store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../store')>()
  return { ...actual, useStore: Object.assign((select: (state: Store) => unknown) => select(actual.useStore.getState()), actual.useStore) }
})

beforeEach(() => useStore.setState({ problems: [], comments: [], customTags: [] }))

describe('review code visibility', () => {
  it('offers individual and bulk code controls while leaving body-only comments readable', { tags: ['reporting'] }, () => {
    const store = useStore.getState()
    const problem = store.addProblem({ title: 'Review' })
    const candidate = store.addCandidate(problem.id, { label: 'A', rawDiff: '' })
    store.addComment({ candidateId: candidate.id, file: 'a.ts', side: 'new', lineNumber: 1, snippet: '+const value = 1', tags: ['unclear_code'], body: 'Explain this choice.' })
    store.addComment({ candidateId: candidate.id, file: 'b.ts', tags: ['unclear_code'], body: 'A file-level concern.' })

    const markup = renderToStaticMarkup(createElement(Review, { id: problem.id }))

    expect(markup).toContain('Hide all code')
    expect(markup).toContain('Show all code')
    expect(markup.match(/>Hide code<\/button>/g)).toHaveLength(1)
    expect(markup).toContain('aria-expanded="true"')
    expect(markup).toContain('+const value = 1')
    expect(markup).toContain('Explain this choice.')
    expect(markup).toContain('A file-level concern.')
  })
})
