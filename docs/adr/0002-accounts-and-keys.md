# 0002. Accounts and keys

- Status: accepted
- Date: 2026-10-12

## Context

Every account's data is end-to-end encrypted (SEC-01 to SEC-14): the server stores and syncs only what it can't read, yet it still has to sign people in (SYS-06) and must not hand an account to whoever finds a fresh server's address (SYS-13). A forgotten password is recovered with a recovery key shown once at sign-up (SEC-07). The Technology Stack document describes the key design; this records how it is built.

## Decision

- **Keys, in the browser** (`packages/crypto`). Argon2id (hash-wasm, 64 MiB, 3 passes, per-user salt) turns the password into a master secret. HKDF-SHA-256 splits it into a **login secret**, which is all the server ever gets, and a **key-encryption key**. A random AES-256-GCM **account key** encrypts the data; the server stores it only wrapped (AES-KW) by the key-encryption key and by a key HKDF derives from the 256-bit **recovery key**. The browser refuses Argon2id settings below its default, so a hostile server can't weaken them.
- **The keys live in a Web Worker** (`apps/web/src/worker`, Comlink), only in memory and non-extractable. Reloading or locking drops them; the password unlocks again. Being signed in (a session cookie) and being unlocked (keys in memory) are separate states.
- **Sign-in is Better Auth** with the login secret as its password, which it hashes again (scrypt). Better Auth's own sign-up route is closed; `POST /api/accounts` creates the account and its key material together.
- **Key material** (salt, Argon2id cost, both wrapped keys, a hash of the recovery secret) has its own table, `key_material`. `POST /api/accounts/prelogin` hands out the salt and cost, with steady made-up values for unknown emails.
- **The first account needs a setup code** printed in the server's log at start while no account exists. After that, sign-up is closed unless the operator sets `MIRADOR_OPEN_SIGNUP=true`; invites come with the rest of SYS-13.
- **Nothing to configure.** The cookie-signing secret is made on first start and kept in `server_settings` (or set with `BETTER_AUTH_SECRET`), and the public address comes from the HTTPS proxy's forwarded headers (or `MIRADOR_URL`).
- **Server tests run PostgreSQL in memory** with PGlite and the real migrations, so they need no Docker.

## Consequences

- The server, its database and its backups can't decrypt anything; a wrong password or an altered wrapped key fails to unwrap instead of producing garbage.
- Changing the password or the recovery key only re-wraps the account key (SEC-08); no data is re-encrypted.
- Argon2id takes about a second on a phone at sign-up, sign-in and unlock.
- Whoever runs the server can't reset a password. Losing both the password and the recovery key loses the data, and the app says so when the key is shown.
- The login secret's derivation is pinned by a known-answer test: changing it would lock every existing account out.
