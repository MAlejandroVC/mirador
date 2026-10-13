import { defineConfig } from 'drizzle-kit'

// `pnpm server:db:generate` writes a migration after a change to src/store/schema.ts.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/store/schema.ts',
  out: './drizzle',
})
