import init, { format } from '@wasm-fmt/shfmt/vite'

let initialized: Promise<void> | undefined

export async function formatSource(source: string, filePath: string): Promise<string> {
  initialized ??= init()
  await initialized
  return format(source, filePath)
}
