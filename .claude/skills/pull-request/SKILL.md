---
name: pull-request
description: Write or update a Mirador pull request (title, description, screenshots). Use every time a pull request is opened or its description changes.
---

# Writing a Mirador pull request

A reviewer should understand what the pull request does in under a minute, and see every changed screen once. Clarity and consistency come first: every pull request has the same sections in the same order, written the same way.

## Title

A Conventional Commit line, because it becomes the squash commit on `main`: `feat(wallets): add wallets and net worth`. Lowercase after the colon, no period, under 72 characters, and it names the change, not the process ("add", never "round 4" or "address feedback").

## Description

Use `.github/pull_request_template.md` and keep its sections in order. Write for someone who has not followed the work: plain sentences, the spec's words (wallet, category group), no internal names unless the reviewer needs them to find the code.

### What changed

1. **Before / After.** Two short paragraphs, one or two sentences each, about what a person using Mirador sees. They answer "why does this exist?"
2. **Up to six bullets**, one per area a reviewer would look at, each one sentence or two, with the requirement IDs in parentheses at the end. Describe what the change does, not how it got there.
3. **How**, two or three sentences at most: where the code lives and any decision a reviewer must know about (a new record type, a new dependency, something left for later).

Describe the pull request as it stands now, as if it were written in one go:

- Never write "fixed" for a bug that never reached `main`. A problem found and solved inside the same pull request is not news to the reviewer.
- No history of review rounds, feedback or attempts. When a later push changes the pull request, rewrite the description so it matches the new state; don't append to it.
- No implementation diary: no lists of components, hooks, CSS classes or test names.

### Issue and requirements

Keep it short and scannable:

```markdown
Wallets epic (#7). Requirements: WAL-01 to WAL-24, SYS-01, SYS-04, SYS-05. Design rules: DL-PAT-02, DL-MOT-06, DL-MOT-07.

<details><summary>Issues closed (24)</summary>

Closes #21, closes #22, closes #23
</details>
```

- One line that names the epic and the requirement IDs, grouped by prefix, with ranges where they are consecutive.
- GitHub needs a "Closes #N" for each issue to close it, so the full list goes inside a folded `<details>` block. Only one issue? Write `Closes #N` on its own line with no fold.

### How it was tested

Three bullets at most:

- the checks that passed (`pnpm lint`, `pnpm typecheck`, `pnpm test`), with the number of new tests;
- what the new tests cover, in one sentence, by area (for example, "the interest, loan and exchange-rate math, and every wallet sheet");
- the zero-knowledge check when the change stores or sends data, and how the screens were checked (phone width, against `docs/design-language.md`).

No list of every test, no story of what was tried.

### Screenshots

Only when the UI changes. The rules:

- **One setting.** Phone (375 px wide), English, light, default palette (Sage Grove). No desktop, Spanish, dark or other palettes; the author checks those before opening the pull request, but the description doesn't show them. Add a desktop screenshot only when the change is about the desktop layout itself.
- **Every changed screen, once.** One screenshot per screen or state the pull request changes. Leave out near-duplicates, such as two scroll positions of the same sheet that show nothing new or two wallets whose pages look the same.
- **Rows of three.** Put up to three phone screenshots side by side in one image (transparent gaps, rounded corners), so the description stays short and reads the same on any screen. Above each row, one plain line says what it shows, left to right.
- **Committed, current and few.** Save the row images in `docs/screenshots/<feature>/` and link them by commit, so they don't change later: `![Wallets, a credit card and a loan](https://raw.githubusercontent.com/MAlejandroVC/mirador/<commit SHA>/docs/screenshots/wallets/wallets-and-pages.png)`. When the screens change, replace the images and delete the old ones in the same push; don't keep earlier versions next to them.
- **Check they show.** After saving the description, open the pull request in a browser, or read its `body_html` through the API, and confirm every image loads. A link wrapped in backticks or escaped as text shows nothing.

### Checklist

Keep the template's checklist and tick only what is true. Credit an AI assistant there in one plain sentence.

## Length

Aim for a description that fits on two phone screens before the screenshots: about 30 lines. If it runs longer, cut detail rather than squeezing it into fragments.

## Things that never go in

- Links to Claude conversations, project threads, sessions or artifacts (`claude.ai/...`), including a "Claude-Session" trailer or a session link in the footer.
- Real financial data, in text or screenshots.
- Instructions to reviewers about how CI works beyond one line; the checks explain themselves in CONTRIBUTING.md.

## Example

```markdown
## What changed

Before: the Wallets tab showed a placeholder.

After: you can add wallets, see each balance and see your net worth, split into what you have and what you owe.

- **Wallets screen.** Net worth as the big number, money available now, and your wallets grouped by what you have and what you owe, by wallet or by type (WAL-20 to WAL-22).
- **Adding and editing.** Only a name is needed; the type sets the icon, color and the features that usually apply. Save points out a missing name with a shake (WAL-01, WAL-02, DL-PAT-02).
- ...

How: the math is pure functions in `packages/core`; wallets, transactions and exchange rates are new encrypted record types, so the server sees only ciphertext.

## Issue and requirements
...
```
