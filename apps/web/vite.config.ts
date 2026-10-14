import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    // Must run before the React plugin so route files are code-split first.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  server: {
    // The browser talks only to its own server (NFR-05); in development that is the API on :3000.
    proxy: { '/api': 'http://localhost:3000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    // design-tokens.test.ts reads index.css as text; Vitest otherwise blanks CSS imports.
    css: { include: [/index\.css/] },
    // The vault tests derive keys with the real Argon2id cost, which can take seconds
    // each when every package's tests run at once.
    testTimeout: 30_000,
  },
})
