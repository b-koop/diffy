declare module 'refractor/core' {
  export interface Refractor {
    highlight(code: string, language: string): import('react-diff-view').TokenNode[]
    register(grammar: RefractorLanguage): void
  }
  export interface RefractorLanguage {
    (refractor: Refractor): void
    displayName: string
  }
  const refractor: Refractor
  export default refractor
}

declare module 'refractor/lang/*' {
  import type { RefractorLanguage } from 'refractor/core'
  const language: RefractorLanguage
  export default language
}
