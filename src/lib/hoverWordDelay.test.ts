import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHoverWordDelay } from './hoverWordDelay'

describe('diff word highlighting', () => {
  afterEach(() => vi.useRealTimers())

  it('highlights a word only after the pointer stays on it for two seconds', () => {
    vi.useFakeTimers()
    const onHoverWord = vi.fn()
    const { setHoveredWord } = createHoverWordDelay(onHoverWord)

    setHoveredWord('review')
    vi.advanceTimersByTime(1999)
    expect(onHoverWord).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onHoverWord).toHaveBeenLastCalledWith('review')
  })

  it('restarts the delay when the pointer moves to another word', () => {
    vi.useFakeTimers()
    const onHoverWord = vi.fn()
    const { setHoveredWord } = createHoverWordDelay(onHoverWord)

    setHoveredWord('first')
    vi.advanceTimersByTime(1000)
    setHoveredWord('second')
    vi.advanceTimersByTime(1999)
    expect(onHoverWord).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onHoverWord).toHaveBeenLastCalledWith('second')
  })

  it('cancels pending highlighting when the pointer leaves the diff', () => {
    vi.useFakeTimers()
    const onHoverWord = vi.fn()
    const { setHoveredWord } = createHoverWordDelay(onHoverWord)

    setHoveredWord('review')
    vi.advanceTimersByTime(1000)
    setHoveredWord(undefined)
    vi.advanceTimersByTime(2000)

    expect(onHoverWord).not.toHaveBeenCalled()
  })
})
