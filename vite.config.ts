import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    tags: [
      { name: 'important', description: 'Primary review workflows required for ordinary use.' },
      { name: 'reporting', description: 'Comment locations, snippets, and generated review notes.' },
      { name: 'persistence', description: 'Review data retained through storage and transfer.' },
      { name: 'imports', description: 'Review file parsing and imported data.' },
      { name: 'exports', description: 'Review file serialization and exported data.' },
      { name: 'validation', description: 'Invalid comment and review data boundaries.' },
    ],
  },
})
