import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHoverWordDelay } from './hoverWordDelay'

describe('diff word highlighting', () => {
  afterEach(() => vi.useRealTimers())

  it('highlights a word only after the pointer stays on it for five seconds', () => {
    vi.useFakeTimers()
    const onHoverWord = vi.fn()
    const { setHoveredWord } = createHoverWordDelay(onHoverWord)

    setHoveredWord('review')
    vi.advanceTimersByTime(4999)
    expect(onHoverWord).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onHoverWord).toHaveBeenLastCalledWith('review')
  })

  it('restarts the delay when the pointer moves to another word', () => {
    vi.useFakeTimers()
    const onHoverWord = vi.fn()
    const { setHoveredWord } = createHoverWordDelay(onHoverWord)

    setHoveredWord('first')
    vi.advanceTimersByTime(3000)
    setHoveredWord('second')
    vi.advanceTimersByTime(4999)
    expect(onHoverWord).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onHoverWord).toHaveBeenLastCalledWith('second')
  })

  it('cancels pending highlighting when the pointer leaves the diff', () => {
    vi.useFakeTimers()
    const onHoverWord = vi.fn()
    const { setHoveredWord } = createHoverWordDelay(onHoverWord)

    setHoveredWord('review')
    vi.advanceTimersByTime(3000)
    setHoveredWord(undefined)
    vi.advanceTimersByTime(5000)

    expect(onHoverWord).not.toHaveBeenCalled()
  })
})
