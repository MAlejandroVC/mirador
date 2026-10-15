# Mirador: notes for AI coding assistants

Mirador is a self-hosted, open source personal finance app: a phone-first React web app (PWA) and a self-hosted TypeScript server with PostgreSQL, shipped as one Docker image. License: AGPL-3.0.

All user data is **end-to-end encrypted**. The browser holds the keys, keeps the data in an in-memory SQLite database and runs every calculation. The server stores and syncs ciphertext, handles sign-in, and reads images for OCR in memory only. It can never decrypt anything.

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing anything; it is the full guide. The essentials:

## Where things are

- What to build: the Functional Requirements Specification, [docs/requirements.md](docs/requirements.md). Every requirement has an ID such as `BUD-35`; each one is a GitHub issue titled `<ID> <summary>`.
- How it looks and behaves: [docs/design-language.md](docs/design-language.md). Every rule has an ID such as `DL-COL-05`; its colors are the tokens in `apps/web/src/index.css`.
- `apps/web`: React 19, Vite, TanStack Router and Query, Tailwind 4, shadcn/ui. `src/worker/` holds the keys, the local SQLite database and sync.
- `apps/server`: Node 24, Hono, Drizzle on PostgreSQL, its own small sign-in (`src/auth`). Stores encrypted records and files, runs OCR in memory, sends generic push.
- `packages/core`: pure logic (money, periods, ledger, analysis, budget). No React, no network, no storage.
- `packages/crypto`: Argon2id (hash-wasm), HKDF and AES-256-GCM (WebCrypto), key wrapping, recovery key. The only place that touches crypto.
- `packages/db`: local SQLite schema (Drizzle), migrations and queries, running in the browser.
- `packages/sync`: pushes and pulls encrypted records; shared protocol types.
- `packages/api`: Zod schemas for every request, response and record. API changes start here.
- `packages/import` (runs in the browser), `packages/archive`, `packages/i18n`, `packages/config`.
- `apps/server` may import only `api`, `sync` protocol types and `i18n`; never `core`, `db`, `import`, `archive` or `crypto`.

## Rules

- Money is integer minor units plus a currency code, through the Money helpers in `@repo/core`. Never floats.
- Dates are `YYYY-MM-DD` calendar dates; period math goes through `@repo/core/periods`.
- Never send or store plaintext user data. Encrypt every record and file with `@repo/crypto` first. The only exception is an image or scanned PDF sent for OCR, which the server must keep in memory only: never write it to disk, the database or logs.
- All cryptography goes through `@repo/crypto`: standard algorithms only, keys non-extractable, never in localStorage, IndexedDB or logs. The one exception is the server's sign-in: hashing and session tokens in `apps/server/src/auth/secrets.ts`, and passkey checks in `apps/server/src/auth/webauthn.ts`; the server holds no keys.
- Decrypted data lives only in memory (the worker's SQLite); IndexedDB holds ciphertext only.
- Never add business logic to the server or a server column for data inside a record. If something seems to need it, stop and ask.
- No network calls to anything but the app's own server; the server's only outbound calls are push deliveries. No analytics, no remote AI, no third-party scripts or fonts.
- No user-visible text in components: add keys to both `packages/i18n/en` and `packages/i18n/es`.
- No hard-coded categories or tags; system categories use their `system_key`.
- Local writes go through `@repo/db` inside one SQLite transaction and reach the server only through `@repo/sync`. The server scopes every query to the signed-in user.
- Analysis and budget functions are pure; the caller passes "today".
- Use the spec's words: wallet (never account), category group (never super-category).
- Phone first: check every screen at 375 px wide, 44 px touch targets, no hover-only behaviour.
- Every screen follows the design language. Use its color tokens (`bg-surface`, `text-text-muted`, `text-warning`), never Tailwind's built-in palette or a hex value, and cite the `DL-` rule in comments where a choice follows one.
- Tests sit next to the code and their names start with the requirement ID: `it('BUD-35: ...')`. Anything that stores or sends data also needs the zero-knowledge check (no plaintext reaches the server).
- Comments explain why, and cite the requirement ID when implementing a spec rule.

## Workflow

- Branch `<type>/<ID or issue>-<few-words>`, Conventional Commit messages with `Refs: <ID>` and a DCO sign-off (`git commit -s`), one issue per pull request, squash merge.
- Commits an AI assistant makes for a person use that person's git identity, so they are both author and committer, and credit the assistant with a `Co-authored-by:` trailer. Use their GitHub noreply address so GitHub links the commit to their account. Before the first commit in a cloud session, set it in the repository (for the maintainer: `git config user.name "Alejandro Villalobos"` and `git config user.email "77853523+MAlejandroVC@users.noreply.github.com"`), then commit with `git commit -s` as usual and end the message with `Co-authored-by: Claude <noreply@anthropic.com>`. A local Claude Code session already uses the person's own git identity.
- Open the pull request as a draft as soon as there is something to try: each push to it updates its preview at `pr-<number>.<preview domain>` a few minutes later, where the maintainer uses it on a phone. Mention that link when asking for feedback.
- Run `pnpm lint`, `pnpm typecheck` and `pnpm test` before opening a pull request.
- Before opening or updating a pull request that changes the UI, look at every screen it touches (screenshots at 375 px and desktop, light and dark) and check each one against [docs/design-language.md](docs/design-language.md) rule by rule: layout and spacing, navigation (DL-CMP-06), colors, icons and text. Fix what doesn't match before asking for review.
- Never put Claude artifacts or links to them (`claude.ai/...artifact...`) in code, docs, commits or pull requests. Anything worth keeping from an artifact becomes a file in the repository, such as an HTML page in `docs/`, and screenshots show that committed file.
- Never link to a Claude conversation, project thread or Claude Code session (`claude.ai/...`) in code, docs, commits or pull requests, including in attribution lines and commit trailers such as `Claude-Session:`. Credit the assistant only with the `Co-authored-by:` trailer and a plain sentence in the pull request.
- Never use real financial data; use `fixtures/` and `pnpm seed`.
