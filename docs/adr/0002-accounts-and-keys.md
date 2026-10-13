# 0002. Accounts and keys

- Status: accepted
- Date: 2026-10-12

## Context

Every account's data is end-to-end encrypted (SEC-01 to SEC-14): the server stores and syncs only what it can't read, yet it still has to sign people in (SYS-06) and must not hand an account to whoever finds a fresh server's address (SYS-13). A forgotten password is recovered with a recovery key shown once at sign-up (SEC-07). The Technology Stack document describes the key design; this records how it is built.

## Decision

- **Keys, in the browser** (`packages/crypto`). Argon2id (hash-wasm, 64 MiB, 3 passes, per-user salt) turns the password into a master secret. HKDF-SHA-256 splits it into a **login secret**, which is all the server ever gets, and a **key-encryption key**. A random AES-256-GCM **account key** encrypts the data; the server stores it only wrapped (AES-KW) by the key-encryption key and by a key HKDF derives from the 256-bit **recovery key**. The browser refuses Argon2id settings below its default, so a hostile server can't weaken them.
- **The keys live in a Web Worker** (`apps/web/src/worker`, Comlink), only in memory and non-extractable. Reloading or locking drops them; the password unlocks again. Being signed in (a session cookie) and being unlocked (keys in memory) are separate states.
- **People sign in with a username, not an email.** The server sends no mail and can't reset a password, so an email would only be personal data on the server and in its backups. Usernames are 3 to 32 lower-case letters, digits, dots, dashes or underscores.
- **Sign-in is our own, not a library** (`apps/server/src/auth`). Because the browser derives a random 256-bit login secret, the server only checks a hash (scrypt), keeps sessions and limits attempts. Better Auth was tried first: it required an email and a name we would have had to make up, its sign-up and email sign-in routes had to be closed, and recovery, password change (SEC-07, SEC-08) and passkey unlock (which needs the PRF extension to release keys) must re-wrap keys, so they would have bypassed it anyway.
  - `POST /api/accounts` creates the account and its key material in one transaction and signs it in. `POST /api/session` signs in, `GET /api/session` says who is signed in, `DELETE /api/session` signs out.
  - A session is a random 256-bit token in an `HttpOnly`, `SameSite=Strict` cookie (`Secure` behind HTTPS); the database keeps only its SHA-256 hash. It lasts 60 days and each day of use extends it.
  - Requests that change something are refused when the browser says they come from another site (`Origin`), and bodies must be JSON.
  - An unknown username takes as long and gets the same answer as a wrong secret. Each address gets 30 attempts a minute, each username 10 wrong ones per 15 minutes.
- **Key material** (salt, Argon2id cost, both wrapped keys, a hash of the recovery secret) has its own table, `key_material`. `POST /api/accounts/prelogin` hands out the salt and cost, with steady made-up values for unknown usernames.
- **The first account needs a setup code** printed in the server's log at start while no account exists. After that, sign-up is closed unless the operator sets `MIRADOR_OPEN_SIGNUP=true`; invites come with the rest of SYS-13.
- **Nothing to configure.** The server's own secret (for prelogin's made-up salts) is made on first start and kept in `server_settings`, or set with `MIRADOR_SECRET`.
- **Server tests run PostgreSQL in memory** with PGlite and the real migrations, so they need no Docker.

## Consequences

- The server, its database and its backups can't decrypt anything; a wrong password or an altered wrapped key fails to unwrap instead of producing garbage.
- Changing the password or the recovery key only re-wraps the account key (SEC-08); no data is re-encrypted.
- Argon2id takes about a second on a phone at sign-up, sign-in and unlock.
- Whoever runs the server can't reset a password. Losing both the password and the recovery key loses the data, and the app says so when the key is shown.
- The login secret's derivation is pinned by a known-answer test: changing it would lock every existing account out.
- Session handling is our code to keep right, so its tests cover cookie flags, expiry, sign-out, hashed tokens, attempt limits and cross-site requests.
