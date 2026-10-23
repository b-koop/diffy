import { describe, expect, it, vi } from 'vitest'
import { createReviewTools, registerReviewTools } from './webmcp'
import type { Store } from '../store'

const rawDiff = [
  'diff --git a/src/a.ts b/src/a.ts',
  'index 1111111..2222222 100644',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,0 +1,2 @@',
  '+const first = 1',
  '+const second = 2',
].join('\n')

function setup() {
  const addComment = vi.fn((input) => ({ ...input, id: 'comment-1', createdAt: 1 }))
  const setCommentStatus = vi.fn()
  const state = {
    problems: [{
      id: 'review-1',
      title: 'Review one',
      askMarkdown: 'Check the change.',
      candidates: [{ id: 'candidate-1', label: 'Option 1', rawDiff }],
    }],
    comments: [{ id: 'comment-1', candidateId: 'candidate-1', file: 'src/a.ts', tags: ['bug'], body: 'Existing note.', createdAt: 1 }],
    customTags: [],
    addComment,
    setCommentStatus,
  } as unknown as Store
  const tools = createReviewTools({ getState: () => state })
  const run = (name: string, input: Record<string, unknown> = {}) => {
    const tool = tools.find((entry) => entry.name === name)
    if (!tool) throw new Error(`Missing tool: ${name}`)
    return tool.execute(input, { signal: new AbortController().signal })
  }
  return { state, tools, run, addComment, setCommentStatus }
}

describe('browser review tools', () => {
  it('lists reviews and candidate files without changing review data', async () => {
    const { run } = setup()

    const reviews = await run('list_reviews')
    const files = await run('list_files', { candidateId: 'candidate-1' })

    expect(reviews).toMatchObject([{ id: 'review-1', title: 'Review one' }])
    expect(files).toMatchObject([{ path: 'src/a.ts', additions: 2, deletions: 0 }])
  })

  it('returns matching diff lines with review and file context', async () => {
    const { run } = setup()

    const matches = await run('search_diffs', { query: 'second = 2' })

    expect(matches).toMatchObject([{
      reviewId: 'review-1',
      candidateId: 'candidate-1',
      file: 'src/a.ts',
      side: 'new',
      lineNumber: 2,
      content: 'const second = 2',
    }])
  })

  it('adds a multiline comment with an exact diff range snippet', async () => {
    const { run, addComment } = setup()

    await run('add_comment', {
      candidateId: 'candidate-1',
      file: 'src/a.ts',
      side: 'new',
      lineNumber: 1,
      end: { side: 'new', lineNumber: 2 },
      tags: ['bug'],
      body: 'Please keep these declarations together.',
    })

    expect(addComment).toHaveBeenCalledWith(expect.objectContaining({
      side: 'new',
      lineNumber: 1,
      end: { side: 'new', lineNumber: 2 },
      snippet: '+const first = 1\n+const second = 2',
    }))
  })

  it('rejects a multiline comment whose end is outside the same diff hunk', async () => {
    const { run, addComment } = setup()

    await expect(run('add_comment', {
      candidateId: 'candidate-1',
      file: 'src/a.ts',
      side: 'new',
      lineNumber: 1,
      end: { side: 'new', lineNumber: 9 },
      tags: ['bug'],
      body: 'This range is invalid.',
    })).rejects.toThrow()

    expect(addComment).not.toHaveBeenCalled()
  })

  it('registers all review tools and unregisters them with the page lifetime signal', async () => {
    const { tools } = setup()
    const registered: string[] = []
    const modelContext = {
      registerTool: vi.fn(async (tool, { signal }) => {
        registered.push(tool.name)
        expect(signal).toBeDefined()
      }),
    }
    const controller = new AbortController()

    await registerReviewTools(modelContext, { getState: () => setup().state }, controller.signal)

    expect(registered).toEqual(tools.map((tool) => tool.name))
    expect(registered).toContain('add_comment')
    expect(registered).toContain('search_diffs')
  })

  it('updates comment status through the existing review store', async () => {
    const { run, setCommentStatus } = setup()

    await run('set_comment_status', { commentId: 'comment-1', status: 'denied' })

    expect(setCommentStatus).toHaveBeenCalledWith('comment-1', 'denied')
  })
})
