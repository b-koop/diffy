export interface ScalarWasmInitOptions {
  bytes: ArrayBuffer
  encoding: 'none' | 'brotli'
}

export async function readScalarWasm(url: string): Promise<ScalarWasmInitOptions> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not load formatter WASM: HTTP ${response.status}`)
  return {
    bytes: await response.arrayBuffer(),
    encoding: response.headers.has('content-encoding') ? 'none' : 'brotli',
  }
}

export function initializeBrowserScalarWasm(
  url: string,
  init: (options: ScalarWasmInitOptions) => Promise<unknown>,
): Promise<void> {
  if (typeof window === 'undefined' && (typeof self === 'undefined' || typeof self.postMessage !== 'function')) return Promise.resolve()
  return readScalarWasm(url).then(init).then(() => undefined)
}
