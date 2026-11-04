import { formatSource } from './formatters'

interface FormatRequest {
  id: number
  filePath: string
  source: string
}

self.addEventListener('message', (event: MessageEvent<FormatRequest>) => {
  const { id, filePath, source } = event.data
  void formatSource(filePath, source).then(
    (formatted) => self.postMessage({ id, formatted }),
    (error: unknown) => self.postMessage({ id, error: error instanceof Error ? error.message : String(error) }),
  )
})
