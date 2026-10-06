# Mirador

**A free, self-hosted, open source personal finance app that shows you where your money goes and steers it toward your goals in minutes a week, not hours.**

A *mirador* is a lookout: the spot on a trail where you stop and see the whole picture. Mirador does that for your money. It starts from how you actually spend, not from an ideal budget, and suggests changes you have already shown you can live with.

> **Status: planning.** There is no working app yet. The requirements and the stack are decided, and the work is tracked as issues on the [project board](https://github.com/users/MAlejandroVC/projects). Contributions are welcome; start with [CONTRIBUTING.md](CONTRIBUTING.md).

## What it will do

- **Wallets, net worth and net debt.** Cash, cards, savings, investments and loans in one place, with interest, fees and credit limits where they apply.
- **Transactions** in one sortable, filterable table, with one category and any number of tags each.
- **Statement and image import.** Upload a CSV, PDF, screenshot or a photo of a ticket; the app extracts the transactions on your own server and only asks about the rows it is unsure of.
- **Your own categories.** Category groups, categories and tags you define; nothing is hard-coded.
- **Spending analysis** that answers where, when and why the money goes, and where cutting back would be easiest.
- **A habit-driven, goal-oriented budget.** It starts from your real typical month, adds your goals, and closes the gap with cuts no deeper than levels you have already reached.
- **A dashboard** that tells you in one glance whether you are on track this period.
- **Quick add** on every screen, that also works offline and syncs later.
- **Full export and import** in documented, open formats.

## Principles

- **Private by default.** Your data lives on a server you control, and the app talks to nothing else: no bank credentials, no telemetry, no remote AI.
- **Habits before targets.** Every budget number starts from observed behaviour.
- **Capture must be near-free.** Import does the bulk; manual entry covers the gaps in seconds.
- **You own the taxonomy and the data.** Everything goes in and out in open formats.

## How it runs

Mirador is a phone-first web app (installable as a PWA) talking to a server you host yourself: a TypeScript server with PostgreSQL, shipped as one Docker image. Run it on a cheap web host, a VPS or a home machine; every device you sign in from shows the same data. Native apps may follow later if there is interest.

Installation instructions will arrive with the first release.

## Documentation

| Document | What it covers |
| --- | --- |
| [Functional Requirements Specification](https://claude.ai/code/artifact/41bcf9b8-1440-4e64-a8fa-c47b2f2444bb) | What to build: every requirement, with its ID and priority |
| [Technology Stack](https://claude.ai/code/artifact/c3cfc88d-022c-4712-9068-ffa7c25aa1bb) | What we build it with, and why |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How we work: setup, layout, code rules, issues, branches, commits, tests, releases |
| [docs/](docs/) | Architecture decision records, and later the hosting guide and archive schema |

## Contributing

Pick an issue labelled `good first issue` or any issue in the **Ready** column of the board, comment that you are taking it, and follow [CONTRIBUTING.md](CONTRIBUTING.md). Questions and ideas go in [Discussions](https://github.com/MAlejandroVC/mirador/discussions). Please read the [Code of Conduct](CODE_OF_CONDUCT.md), and report security problems as described in [SECURITY.md](SECURITY.md).

## License

Mirador is free software under the [GNU Affero General Public License v3.0](LICENSE). If you run a modified version for other people, you must offer them its source code.
