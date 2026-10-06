# Mirador: notes for AI coding assistants

Mirador is a self-hosted, open source personal finance app: a phone-first React web app (PWA) and a self-hosted TypeScript server with PostgreSQL, shipped as one Docker image. License: AGPL-3.0.

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing anything; it is the full guide. The essentials:

## Where things are

- What to build: the Functional Requirements Specification (linked from README.md). Every requirement has an ID such as `BUD-35`; each one is a GitHub issue titled `<ID> <summary>`.
- `apps/web`: React 19, Vite, TanStack Router and Query, Tailwind 4, shadcn/ui.
- `apps/server`: Node 24, Hono, Better Auth, pg-boss jobs.
- `packages/core`: pure logic (money, periods, ledger, analysis, budget). No React, no database, no files.
- `packages/api`: Zod schemas for every request and response. API changes start here.
- `packages/db`: Drizzle schema, migrations, repositories with access checks.
- `packages/import`, `packages/archive`, `packages/i18n`, `packages/config`.
- `apps/web` may import only `core`, `api` and `i18n`.

## Rules

- Money is integer minor units plus a currency code, through the Money helpers in `@repo/core`. Never floats.
- Dates are `YYYY-MM-DD` calendar dates; period math goes through `@repo/core/periods`.
- No network calls to anything but the app's own server; the server makes no outbound connections. No analytics, no remote AI, no third-party scripts or fonts.
- No user-visible text in components: add keys to both `packages/i18n/en` and `packages/i18n/es`.
- No hard-coded categories or tags; system categories use their `system_key`.
- Writes go through `@repo/db` repositories inside a transaction, with the current user's access check.
- Analysis and budget functions are pure; the caller passes "today".
- Use the spec's words: wallet (never account), category group (never super-category).
- Phone first: check every screen at 375 px wide, 44 px touch targets, no hover-only behaviour.
- Tests sit next to the code and their names start with the requirement ID: `it('BUD-35: ...')`.
- Comments explain why, and cite the requirement ID when implementing a spec rule.

## Workflow

- Branch `<type>/<ID or issue>-<few-words>`, Conventional Commit messages with `Refs: <ID>` and a DCO sign-off (`git commit -s`), one issue per pull request, squash merge.
- Run `pnpm lint`, `pnpm typecheck` and `pnpm test` before opening a pull request.
- Never use real financial data; use `fixtures/` and `pnpm seed`.
