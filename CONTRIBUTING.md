# Contributing to Mirador

This guide is how we build Mirador: the tools, where code goes, and how work moves from an issue to a release. It is written so a contributor with a few free hours can pick up an issue and ship it without asking. This file is the source of truth; change it with a pull request like any other file.

Mirador is **end-to-end encrypted**. The browser holds the keys and does all the work on the data; the server only stores and syncs ciphertext. Most of the rules below follow from that.

| What | Where |
| --- | --- |
| Repository | [github.com/MAlejandroVC/mirador](https://github.com/MAlejandroVC/mirador) |
| Project board | The **Mirador** board under the repository's **Projects** tab |
| What to build | [Functional Requirements Specification](https://claude.ai/code/artifact/41bcf9b8-1440-4e64-a8fa-c47b2f2444bb) |
| What we build it with | [Technology Stack](https://claude.ai/code/artifact/c3cfc88d-022c-4712-9068-ffa7c25aa1bb) |
| Questions and ideas | [GitHub Discussions](https://github.com/MAlejandroVC/mirador/discussions) |

## The tools we use

All of them are free; there is no Jira, Slack or other tracker.

| Tool | Used for |
| --- | --- |
| GitHub repo | Code, reviews, releases |
| GitHub Issues and Projects | Every piece of work, from epics to bugs, on one board |
| GitHub Actions | Lint, tests, builds and releases on every pull request |
| GitHub Container Registry | The released Docker images |
| GitHub Discussions | Questions, proposals, announcements |
| VS Code (recommended, not required) | Editing, with the settings and extensions committed to the repo |
| Node.js 24 LTS and pnpm | Running and installing everything |
| Docker (Docker Desktop, OrbStack or Podman) | PostgreSQL for development and tests, and building the release image |
| A phone on the same Wi-Fi | Trying the app on a real phone during development |

## Set up your machine

> The app code is not scaffolded yet; these steps describe the setup once it is.

Everything runs on macOS, Linux or Windows (with WSL 2). No Mac or Xcode is needed.

1. Install Node.js 24 LTS (the version is pinned in `.nvmrc`; `nvm use` or `fnm use` picks it up).
2. Enable pnpm through Corepack: `corepack enable`. The pnpm version is pinned in `package.json`.
3. Install Docker. Development uses it only for PostgreSQL.
4. Clone, install and start:

```bash
git clone https://github.com/MAlejandroVC/mirador.git
cd mirador
pnpm install
cp .env.example .env          # local settings; never commit .env
pnpm db:up                    # starts PostgreSQL in Docker
pnpm db:migrate && pnpm seed  # creates tables and a demo account with encrypted fake data
pnpm dev                      # web app and server together
```

| Command | Does |
| --- | --- |
| `pnpm dev` | Web app at localhost:5173 and the API at localhost:3000, both reloading on save |
| `pnpm dev --host` | Same, reachable from a phone on your Wi-Fi at your computer's address |
| `pnpm test` | All unit, component and server tests (server tests start their own PostgreSQL) |
| `pnpm test:watch` | Re-runs tests as you edit |
| `pnpm lint` / `pnpm typecheck` | The same checks CI runs |
| `pnpm e2e` | Playwright on phone and desktop sizes |
| `pnpm db:generate` | Creates a local-data migration after a schema change |
| `pnpm server:db:generate` | Creates a migration for the server's own tables |
| `pnpm db:studio` | Drizzle Studio on the dev server database (you will see only ciphertext, which is the point) |
| `pnpm docker:build` | Builds the release image locally |

Open the app on your phone while you work, not just in a narrow desktop window: most people will use it there. **Never use your own bank statements or real financial data while developing.** `pnpm seed` and the files in `fixtures/` are there for that.

### Editor

Any editor works; VS Code is the one the repo is set up for. Opening the repo offers the recommended extensions, and `.vscode/settings.json` turns on format on save and the ESLint fixes.

| Extension | Why |
| --- | --- |
| ESLint | Lint errors as you type |
| Prettier | Formatting on save |
| Tailwind CSS IntelliSense | Class name completion |
| Vitest | Run and debug a single test from the editor |
| Playwright Test | Run end-to-end tests, including phone sizes |
| Docker | See and restart the dev PostgreSQL container |
| Code Spell Checker with the Spanish dictionary | Catches typos in code and in both languages' text |
| EditorConfig | Same indentation and line endings everywhere |

The repo's `.editorconfig` sets 2-space indentation, LF line endings and UTF-8, so other editors (WebStorm, Neovim, Zed) behave the same.

## Repository layout

One pnpm workspace with Turborepo: two apps in `apps/` (the web app and the server), shared code in `packages/`. Business rules live in packages that run in the browser, never in screens and never on the server, which can't read the data.

```text
mirador/
├── apps/
│   ├── web/                      React web app (Vite, phone first, PWA)
│   │   └── src/
│   │       ├── routes/           TanStack Router routes (one file per screen)
│   │       ├── features/         UI by epic: wallets, transactions, import,
│   │       │                     categories, analysis, budget, dashboard,
│   │       │                     quick-add, data, settings, security
│   │       ├── components/ui/    shadcn/ui components, owned by us
│   │       ├── worker/           Web Worker: keys, local SQLite, sync (Comlink)
│   │       ├── offline/          Service worker setup and the encrypted quick-add queue
│   │       └── lib/              API client, i18n setup, helpers
│   └── server/                   Hono API server: stores ciphertext, never decrypts
│       └── src/
│           ├── routes/           auth, keys, sync, files, ocr, push, admin
│           ├── auth/             Better Auth setup, invites, recovery
│           ├── store/            Drizzle schema and migrations for PostgreSQL
│           ├── ocr/              In-memory OCR worker; model files (Git LFS)
│           └── tasks/            Scheduled backups, purges, push sends (Croner)
├── packages/
│   ├── core/                     Pure logic: money, periods, ledger, analysis, budget
│   ├── crypto/                   Key derivation, wrapping, record and file encryption
│   ├── db/                       Local SQLite schema (Drizzle), migrations, queries
│   ├── sync/                     Sync client and the shared sync protocol types
│   ├── api/                      Zod schemas for every request and response; OpenAPI
│   ├── import/                   CSV, OFX, PDF parsing, OCR result parsing, matching, rules
│   ├── archive/                  Export and import format, JSON Schema, version upgrades
│   ├── i18n/                     en/ and es/ translation files
│   └── config/                   Shared ESLint, TypeScript and Prettier config
├── docker/                       Dockerfile, docker-compose.yml, Caddyfile
├── fixtures/                     Fake statements, receipts and datasets for tests
├── e2e/                          Playwright flows (phone and desktop)
├── docs/                         Architecture decisions (adr/), admin and hosting guide, archive schema
└── .github/                      Workflows, issue and PR templates, CODEOWNERS
```

**Dependency direction.** `apps/web` may use every package. `apps/server` may use `api`, `sync` (protocol types only) and `i18n`, never `core`, `db`, `import`, `archive` or `crypto`: it has no keys and no business logic. `db`, `import`, `archive` and `sync` may use `core` and `crypto`. `core` and `crypto` use nothing but small pure libraries (decimal.js, date-fns, hash-wasm): no React, no network, no storage. A lint rule enforces this.

Inside a feature folder (`apps/web/src/features/budget/`): `components/`, `hooks/`, `screens/`, and an `index.ts` that is the only thing other features import.

### Naming

| Thing | Convention | Example |
| --- | --- | --- |
| Files and folders | kebab-case | `period-close.tsx`, `match-duplicates.ts` |
| React components | PascalCase | `PeriodCloseReview` |
| Functions, variables | camelCase | `computeBaseline` |
| Types | PascalCase, no `I` prefix | `Transaction`, `BudgetPeriod` |
| API paths | plural nouns, kebab-case | `/api/import-batches/:id` |
| Database tables and columns | snake_case, tables plural | `import_batches.file_fingerprint` |
| Translation keys | feature.screen.element | `budget.close.surplusTitle` |
| Tests | next to the code, `.test.ts` | `baseline.test.ts` |
| Packages | `@repo/<name>` | `@repo/core` |

Use the glossary words from the spec everywhere: code, UI and database say **wallet**, never account; **category group**, never super-category.

## Code rules

TypeScript runs in strict mode, Prettier decides formatting, and ESLint enforces most of the rules below, so reviews can focus on behaviour. These are the rules a linter cannot fully check.

- **Phone first.** Build and check every screen at 375 pixels wide before the desktop layout. Touch targets at least 44 by 44 pixels, nothing that only works on hover, and forms that open the right phone keyboard (`inputmode="decimal"` for amounts).
- **Nothing readable leaves the browser.** Every record and file is encrypted through `@repo/crypto` before it is stored or sent. The only plaintext the server ever receives is an image or scanned PDF sent for OCR, which it keeps in memory only (SEC-01, SEC-05).
- **All cryptography goes through `@repo/crypto`.** No other package calls WebCrypto or hash-wasm, no custom algorithms, no keys in localStorage, IndexedDB or logs. Keys stay non-extractable in the worker (SEC-13).
- **Plaintext never touches the device's disk.** Decrypted data lives in the worker's in-memory SQLite; IndexedDB holds only ciphertext. Locking clears both keys and data (SEC-11, SEC-12).
- **The server stays dumb.** It stores, syncs and authenticates; it never parses a record, adds business rules or needs a key. If a feature seems to need the server to read data, open a decision issue.
- **Money is never a float.** Amounts are integers in minor units with a currency code, created and combined only through the Money helpers in `@repo/core`. Rates and interest go through decimal.js and round once, half to even (NFR-03).
- **Dates are calendar dates.** A transaction date is a `YYYY-MM-DD` string with an optional local time. Period math goes through `@repo/core/periods`, never hand-rolled `new Date()` arithmetic.
- **The browser talks only to its own server, and the server talks to no one except push services.** No third-party scripts, fonts, analytics, crash reporting or remote services, and no dependency that adds them (NFR-05).
- **No text in components.** Every string the user sees comes from `packages/i18n`, in English and Spanish, in the same pull request (SYS-10).
- **No hard-coded categories or tags.** Logic never checks for a category by name; system categories are referenced by their fixed `system_key` (CAT-05, CAT-10).
- **All local writes go through `@repo/db`**, inside one SQLite transaction, and reach the server only through `@repo/sync` (NFR-08).
- **Every API change starts in `@repo/api`.** Change the Zod schema first; the server, the typed client and the OpenAPI file follow from it.
- **Same input, same output.** Analysis and budget functions are pure: no clock, no randomness; the caller passes "today" in (NFR-11).
- **Accessible by default.** Every control has an accessible name and role, text scales with the browser's font size, and color is never the only signal (NFR-07).
- **New dependencies need a reason.** Say why in the pull request, check its license against the policy in the stack document, and weigh its size: every kilobyte loads on a phone.
- **Comments explain why, not what.** Link the requirement ID when code implements a rule from the spec: `// BUD-02: spread irregular costs evenly`.

Bigger design choices (a new library, a new table, a change to the archive format) get a short architecture decision record in [`docs/adr/`](docs/adr/), numbered, with context, decision and consequences.

## Planning on the GitHub board

All work is a GitHub issue, and all issues live on one GitHub Projects board. The spec maps onto it directly: each epic is a parent issue, each requirement ID is a sub-issue, and each open question is a decision issue.

### Issue kinds

The kind is a `type:` label, set by the issue form you pick.

| Kind | One per | Title | Example |
| --- | --- | --- | --- |
| Epic (`type:epic`) | Spec epic (10), plus one for NFR | `[Epic] <AREA> <name>` | `[Epic] BUD Habit-driven, goal-oriented budget` |
| Story (`type:story`) | Requirement ID | `<ID> <short summary>` | `BUD-35 Propose cuts to close the gap` |
| Decision (`type:decision`) | Open question | `[Decision] <question>` | `[Decision] Shared data and wallets in V1?` |
| Bug (`type:bug`) | Defect | Plain description | `Import merges rows from different wallets` |
| Chore (`type:chore`) | Tooling, refactors, docs | Plain description | `Upgrade to Node.js 26` |

Stories are sub-issues of their epic, so the epic shows progress. A story's body copies the requirement sentence and its acceptance example from the spec and links back to it; the spec stays the source of truth, and a change to a requirement is made in the spec first.

### Labels

- `area:wal`, `area:txn`, `area:imp`, `area:cat`, `area:ana`, `area:bud`, `area:dsh`, `area:wid`, `area:dat`, `area:sys`, `area:nfr`, plus `area:tooling` and `area:hosting`
- `priority:must`, `priority:should`, `priority:could` (the spec's MoSCoW)
- `layer:web`, `layer:server` when an issue touches only one side
- `type:epic`, `type:story`, `type:decision`, `type:bug`, `type:chore`
- `good first issue`, `help wanted`, `blocked`, `needs-translation`

**Milestones:** *MVP* holds every Must; *v1.0* holds the Shoulds; Coulds stay without a milestone until picked.

### Board columns

| Column | Means | Who moves it |
| --- | --- | --- |
| Backlog | Known, not ready | Anyone |
| Ready | Clear enough to start; acceptance criteria written | Maintainer |
| In progress | Someone is assigned and working | The assignee |
| In review | Pull request open | Automatic when a PR links the issue |
| Done | Merged | Automatic when the PR merges |

To pick up work, comment on a Ready issue and assign yourself (or ask to be assigned). Keep at most two issues In progress at a time so nothing stalls half-done. The board also has a **Size** field (S, M, L) for rough planning; anything L is split before it starts.

## Branches, commits and pull requests

We work trunk-based: `main` is always releasable, every change arrives through a short-lived branch and a pull request, and nobody pushes to `main` directly.

Branches are named `<type>/<issue or ID>-<few-words>`:

```text
feat/BUD-35-close-the-gap
fix/142-duplicate-merge-wallet
chore/node-26
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org/), because release-please builds the changelog and the version number from them.

```text
<type>(<scope>): <summary in the imperative, lower case, no period>

<optional body: why, not what>

Refs: BUD-35
Closes #87
Signed-off-by: Your Name <you@example.com>
```

| Part | Values |
| --- | --- |
| type | `feat` (new behaviour), `fix` (bug), `perf`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`, `revert` |
| scope | The package or epic touched: `core`, `db`, `import`, `archive`, `i18n`, `app`, or an area such as `bud`, `txn` |
| `!` after the scope | Breaking change, for example to the archive format: `feat(archive)!: ...` |
| Refs | The requirement IDs the commit implements |
| Signed-off-by | Required on every commit: `git commit -s` adds it. It is the [Developer Certificate of Origin](https://developercertificate.org/), your statement that you have the right to contribute the code |

Example: `feat(bud): cap suggested cuts at the proven level` with `Refs: BUD-35`.

### Pull requests

- One issue per pull request, small enough to review in 15 minutes. Split big work behind a feature flag rather than opening a huge PR.
- The title is a Conventional Commit line, because PRs are squash-merged and the title becomes the commit on `main`.
- The description follows the template: what changed, which issue and requirement IDs, how it was tested, and phone and desktop screenshots when the UI changes.
- Open it as a draft early if you want feedback; mark it ready when CI is green.
- To merge: CI green, one approving review (the maintainer, for now), every conversation resolved, branch up to date with `main`.
- Reviewers comment on behaviour, the requirement and the rules above; formatting is the tools' job. Prefix optional remarks with `nit:`.
- The branch is deleted automatically after merge.

## Tests

A story is done when its requirement has a passing test whose name starts with the ID (NFR-13), so anyone can search the repo for `BUD-35` and find both the code and the proof.

```ts
describe('BUD-35 close the gap', () => {
  it('BUD-35: never cuts a category below its proven level', () => { ... })
  it('BUD-35: caps each cut at the maximum step', () => { ... })
})
```

| Test kind | Where | Runner |
| --- | --- | --- |
| Logic | Next to the code in `packages/*`, `*.test.ts` | Vitest |
| Crypto | `packages/crypto`: known-answer vectors, wrap and unwrap, recovery, tampered records rejected | Vitest |
| Sync | `packages/sync` and `apps/server`: revisions, batches, conflicts, retries | Vitest with Testcontainers |
| Server routes and isolation | `apps/server`, against a real PostgreSQL | Vitest with Testcontainers |
| Zero knowledge | Seeds marker strings, then scans the database, files, backups and logs for them | Vitest and Playwright |
| Components and screens | Next to the component, `*.test.tsx` | Vitest with React Testing Library |
| Import accuracy | `packages/import`, reading `fixtures/statements/` | Vitest; fails under the spec's accuracy targets |
| End to end | `e2e/`, on iPhone-sized, Android-sized and desktop viewports | Playwright (WebKit, Chromium, Firefox) |

- Every feature that stores or sends data gets two checks: a second user is refused (SEC-09), and the zero-knowledge test finds none of its plaintext on the server (SEC-04).
- Acceptance examples in the spec (WAL-20, IMP-21, BUD-35, BUD-61 to BUD-63, DAT-04) become tests with the same numbers.
- Fixtures are fake or fully anonymized. A donated statement has names, account numbers and addresses replaced before it is committed, and the pull request says so.
- Bug fixes start with a failing test that reproduces the bug.

## Database changes

There are two databases, and most changes touch only the first.

1. **Local data** (wallets, transactions, budgets and so on): edit the SQLite schema in `packages/db/src/schema/` and the Zod record schema in `packages/api`. Run `pnpm db:generate` and commit the migration. It runs in the browser after unlock.
2. **Server tables** (accounts, keys, records, files, push, invites): edit `apps/server/src/store/schema/`, run `pnpm server:db:generate`, and commit. It runs at server start after a backup (DAT-10). The server never gets a column for something inside a record.
3. Never edit a released migration; add a new one.
4. A change to a record's shape bumps its schema version, and the client upgrades old records as it decrypts them.
5. If the change affects exported data, bump the archive schema version in `packages/archive`, add an upgrader, and extend the round-trip test (DAT-04, DAT-06).
6. Ids are UUIDv7 made in the browser; tables and columns are snake_case.

## Translations

- Add every new key to both `packages/i18n/en/` and `packages/i18n/es/` in the same pull request; CI fails if a key is missing in either.
- Keys are grouped by feature (`budget.json`, `import.json`); use i18next's plural and interpolation features, never string concatenation.
- Write Spanish as neutral Latin American Spanish unless a decision says otherwise. If you cannot write one of the languages, add the key with your best attempt and the `needs-translation` label; a reviewer fixes it.

## CI and releases

| Workflow (`.github/workflows/`) | Runs on | Does |
| --- | --- | --- |
| `ci.yml` | Every pull request and push to `main` | Lint, typecheck, all Vitest suites (with PostgreSQL), license and dependency checks, web build, Playwright on phone and desktop sizes, Docker image build |
| `release-please.yml` | Push to `main` | Keeps a release PR open with the next version and changelog |
| `release.yml` | Merging the release PR | Tags the version, builds the Docker image for Intel and ARM, signs it and publishes it to GitHub Container Registry |
| `codeql.yml`, Dependabot | Weekly and on PRs | Security scanning and dependency updates |

Versions follow SemVer (`1.4.0`): `feat` bumps the minor, `fix` the patch, a `!` the major. While below 1.0, breaking changes bump the minor. The image is tagged with the exact version, the minor (`1.4`) and `latest`.

Releasing is merging the release PR. The release notes say whether the upgrade runs a migration and anything an admin must do. Before tagging, a maintainer checks the release build on a real iPhone and Android phone.

## AI coding assistants

Using Claude Code, Copilot or similar tools is welcome; the author of the pull request is responsible for every line in it.

- The repo's [CLAUDE.md](CLAUDE.md) (and [AGENTS.md](AGENTS.md) for other tools) gives assistants the layout, the code rules and the commands, so their output follows this guide.
- Review and run what an assistant writes before you open the PR; say in the PR description if a large part was generated.
- Never paste real financial data, statements or user files into an assistant. Use the fixtures.
- The app itself never uses remote AI (NFR-05). An assistant helping write code is fine; code that calls an AI service is not.

## Security and privacy

- Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md), never in a public issue.
- Changes to `packages/crypto`, the sync protocol or sign-in need a second reviewer once there is one, and a note in the PR on what an attacker with the server's database could learn.
- No secrets in the repo. Local settings live in `.env` (ignored by Git, with `.env.example` committed); the release workflow uses only GitHub's built-in token.
- The server never logs request bodies, and the browser never logs decrypted data or keys, even in debug builds.
- Treat the server as untrusted: the browser checks every response against its Zod schema, and the server checks access on every request (SEC-09).
- Keep what the server can see in line with SEC-10. A change that adds metadata (a new plaintext column, a new header, a new log field) needs a decision issue.

## Getting help

Ask in [GitHub Discussions](https://github.com/MAlejandroVC/mirador/discussions), or comment on the issue you are working on. Reply times depend on the maintainer's free time, so a clear question with what you tried gets answered fastest.
