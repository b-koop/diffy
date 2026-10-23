export async function copyTextToClipboard(
  text: string,
  clipboard?: Pick<Clipboard, 'writeText'>,
): Promise<boolean> {
  try {
    const target = clipboard ?? navigator.clipboard
    if (!target) return false
    await target.writeText(text)
    return true
  } catch {
    return false
  }
}
