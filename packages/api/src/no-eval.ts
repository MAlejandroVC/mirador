import { z } from 'zod'

// The web app's Content-Security-Policy allows no eval (see apps/server/src/app.ts).
// Zod would otherwise try it once, when the first schema is made, to parse objects a
// little faster; the browser refuses and reports it. Imported first, before any schema.
z.config({ jitless: true })
