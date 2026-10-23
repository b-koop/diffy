export function createHoverWordDelay(onHoverWord: (word?: string) => void, delay = 5000) {
  let pendingWord: string | undefined
  let activeWord: string | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  const setHoveredWord = (word?: string) => {
    if (word === pendingWord) return
    pendingWord = word
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined

    if (activeWord) {
      activeWord = undefined
      onHoverWord(undefined)
    }
    if (!word) return

    timer = setTimeout(() => {
      if (pendingWord !== word) return
      activeWord = word
      onHoverWord(word)
    }, delay)
  }

  const dispose = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    pendingWord = undefined
  }

  return { setHoveredWord, dispose }
}
