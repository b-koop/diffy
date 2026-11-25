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

describe('candidate names in browser review tools', () => {
  it('reads files and filtered comments through a unique trimmed label', { tags: ['important', 'reporting'] }, async () => {
    const { run, state } = setup()
    expect(await run('list_files', { candidateId: ' Option 1 ' })).toMatchObject([{ candidateId: 'candidate-1', path: 'src/a.ts' }])
    expect(await run('get_file_diff', { candidateId: 'Option 1', file: 'src/a.ts' })).toMatchObject({ path: 'src/a.ts' })
    expect(await run('list_comments', { candidateId: 'Option 1', reviewId: 'review-1', file: 'src/a.ts', status: 'approved' })).toEqual(state.comments)
    expect(await run('list_comments', { candidateId: 'Option 1', reviewId: 'other-review' })).toEqual([])
    expect(await run('list_comments', { candidateId: 'Option 1', file: 'other.ts' })).toEqual([])
    expect(await run('list_comments', { candidateId: 'Option 1', status: 'denied' })).toEqual([])
  })

  it.each([{}, { side: 'new', lineNumber: 1 }])('saves comments under the candidate ID when addressed by label: %j', { tags: ['important', 'persistence'] }, async (anchor) => {
    const { run, addComment } = setup()
    const comment = await run('add_comment', { candidateId: 'Option 1', file: 'src/a.ts', tags: ['bug'], body: 'Check this.', ...anchor })
    expect(addComment).toHaveBeenCalledWith(expect.objectContaining({ candidateId: 'candidate-1', ...anchor }))
    expect(comment).toMatchObject({ candidateId: 'candidate-1' })
  })

  it('prefers an exact candidate ID over another candidate label', { tags: ['validation'] }, async () => {
    const { run, state } = setup()
    state.problems[0].candidates.push({ id: 'candidate-2', label: 'candidate-1', rawDiff })
    expect(await run('list_files', { candidateId: 'candidate-1' })).toMatchObject([{ candidateId: 'candidate-1', candidateLabel: 'Option 1' }])
    expect(await run('list_comments', { candidateId: 'candidate-1' })).toEqual(state.comments)
  })

  it.each(['same review', 'another review'])('rejects labels shared by candidates in %s without writing', { tags: ['validation'] }, async (location) => {
    const { run, state, addComment } = setup()
    const duplicate = { id: 'candidate-2', label: 'Option 1', rawDiff }
    if (location === 'same review') state.problems[0].candidates.push(duplicate)
    else state.problems.push({ id: 'review-2', title: 'Review two', askMarkdown: '', candidates: [duplicate] })
    const inputs = [
      ['list_files', {}],
      ['get_file_diff', { file: 'src/a.ts' }],
      ['list_comments', { reviewId: 'review-1' }],
      ['add_comment', { file: 'src/a.ts', tags: ['bug'], body: 'Check this.' }],
      ['get_review_comments', {}],
    ] as const
    for (const [name, input] of inputs) {
      await expect(run(name, { candidateId: 'Option 1', ...input })).rejects.toThrow(/ambiguous/i)
      await expect(run(name, { candidateId: 'Option 1', ...input })).rejects.toThrow(/candidate-1/)
      await expect(run(name, { candidateId: 'Option 1', ...input })).rejects.toThrow(/candidate-2/)
      await expect(run(name, { candidateId: 'Option 1', ...input })).rejects.toThrow(/review-1/)
      if (location === 'another review') await expect(run(name, { candidateId: 'Option 1', ...input })).rejects.toThrow(/review-2/)
    }
    expect(addComment).not.toHaveBeenCalled()
  })

  it.each(['missing', 'option 1'])('rejects an unknown or differently cased candidate name: %s', { tags: ['validation'] }, async (candidateId) => {
    const { run, addComment } = setup()
    for (const [name, input] of [
      ['list_files', {}],
      ['get_file_diff', { file: 'src/a.ts' }],
      ['list_comments', {}],
      ['add_comment', { file: 'src/a.ts', tags: ['bug'], body: 'Check this.' }],
      ['get_review_comments', {}],
    ] as const) {
      await expect(run(name, { candidateId, ...input })).rejects.toThrow(/not found/i)
    }
    expect(addComment).not.toHaveBeenCalled()
  })
})

describe('review comments grouped with changed files', () => {
  it.each(['candidate-1', ' Option 1 '])('returns every changed file and complete comments for one candidate: %s', { tags: ['important', 'reporting'] }, async (candidateId) => {
    const { run, state, addComment, setCommentStatus } = setup()
    state.problems[0].candidates[0].note = 'Overall note.'
    state.problems[0].candidates[0].rawDiff = rawDiff + '\n' + rawDiff.replaceAll('src/a.ts', 'src/b.ts')
    state.problems[0].candidates.push({ id: 'candidate-2', label: 'Other option', rawDiff })
    state.comments.push(
      { id: 'comment-2', candidateId: 'candidate-1', file: 'src/a.ts', side: 'new', lineNumber: 2, end: { side: 'new', lineNumber: 1 }, snippet: '+const second = 2\n+const first = 1', tags: ['bug'], body: 'Range note.', createdAt: 2, status: 'denied' },
      { id: 'comment-3', candidateId: 'candidate-1', file: 'src/a.ts', side: 'new', lineNumber: 1, lines: [{ side: 'new', lineNumber: 1 }, { side: 'new', lineNumber: 2 }], snippet: '+const first = 1\n+const second = 2', tags: ['other'], body: 'Linked note.', createdAt: 3, status: 'approved' },
      { id: 'other-comment', candidateId: 'candidate-2', file: 'src/a.ts', tags: ['bug'], body: 'Other candidate.', createdAt: 4 },
    )
    const before = structuredClone({ problems: state.problems, comments: state.comments })
    expect(await run('get_review_comments', { candidateId })).toEqual([{
      reviewId: 'review-1',
      reviewTitle: 'Review one',
      candidateId: 'candidate-1',
      candidateLabel: 'Option 1',
      note: 'Overall note.',
      files: [{ file: 'src/a.ts', comments: state.comments.slice(0, 3) }, { file: 'src/b.ts', comments: [] }],
    }])
    expect({ problems: state.problems, comments: state.comments }).toEqual(before)
    expect(addComment).not.toHaveBeenCalled()
    expect(setCommentStatus).not.toHaveBeenCalled()
  })

  it('includes uncommented candidates from every review in source order when no candidate is supplied', { tags: ['reporting'] }, async () => {
    const { run, state } = setup()
    state.problems[0].candidates.push({ id: 'candidate-2', label: 'Other option', rawDiff })
    state.problems.push({ id: 'review-2', title: 'Review two', askMarkdown: '', candidates: [{ id: 'candidate-3', label: 'Option 1', rawDiff }] })
    expect(await run('get_review_comments')).toEqual([
      { reviewId: 'review-1', reviewTitle: 'Review one', candidateId: 'candidate-1', candidateLabel: 'Option 1', files: [{ file: 'src/a.ts', comments: state.comments }] },
      { reviewId: 'review-1', reviewTitle: 'Review one', candidateId: 'candidate-2', candidateLabel: 'Other option', files: [{ file: 'src/a.ts', comments: [] }] },
      { reviewId: 'review-2', reviewTitle: 'Review two', candidateId: 'candidate-3', candidateLabel: 'Option 1', files: [{ file: 'src/a.ts', comments: [] }] },
    ])
    state.problems = []
    state.comments = []
    expect(await run('get_review_comments')).toEqual([])
  })

  it('reports malformed candidate diffs using the existing diff error behavior', { tags: ['validation'] }, async () => {
    const { run, state } = setup()
    state.problems[0].candidates[0].rawDiff = 'not a diff'
    await expect(run('get_review_comments', { candidateId: 'candidate-1' })).rejects.toThrow('Could not parse candidate diff:')
  })

  it('exposes review comment retrieval as a read-only registered tool with an optional candidate', { tags: ['reporting'] }, async () => {
    const { tools, state } = setup()
    const commentTool = tools.find((tool) => tool.name === 'get_review_comments')
    expect(commentTool).toBeDefined()
    expect(commentTool?.annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true })
    expect(commentTool?.inputSchema.properties).toHaveProperty('candidateId')
    expect(commentTool?.inputSchema.required ?? []).not.toContain('candidateId')
    const registered: string[] = []
    await registerReviewTools({ registerTool: vi.fn(async (tool) => { registered.push(tool.name) }) }, { getState: () => state }, new AbortController().signal)
    expect(registered).toContain('get_review_comments')
  })
})
