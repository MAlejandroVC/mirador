import { defineConfig } from 'vitest/config'

// Each test file starts PostgreSQL in memory (PGlite) and runs the migrations, which
// can take several seconds on a busy CI runner.
export default defineConfig({
  test: { testTimeout: 30_000, hookTimeout: 30_000 },
})
