import init, { format } from '@wasm-fmt/gofmt/vite'

let initialized: Promise<void> | undefined

export async function formatSource(source: string, _filePath: string): Promise<string> {
  initialized ??= init()
  await initialized
  return format(source)
}
