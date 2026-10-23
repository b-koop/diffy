import { describe, expect, it, vi } from 'vitest'
import { copyTextToClipboard } from './clipboard'

describe('clipboard copying', () => {
  it('copies the complete file path', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)

    const copied = await copyTextToClipboard('src/components/FileDiff.tsx', { writeText })

    expect(writeText).toHaveBeenCalledWith('src/components/FileDiff.tsx')
    expect(copied).toBe(true)
  })

  it('reports when the browser denies clipboard access', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Clipboard access denied'))

    const copied = await copyTextToClipboard('src/components/FileDiff.tsx', { writeText })

    expect(copied).toBe(false)
  })
})
