# What the server can see

Mirador encrypts your data in your browser before anything is sent, so the server stores it without being able to read it. Even so, a server always learns something: who signs in, when, and how much they store. This page lists all of it (SEC-10). It is written for the people who use a Mirador server and for whoever runs one.

It covers everything that exists in this version. Whenever the server starts storing something new, this page changes in the same pull request; a test fails if a database table or column is missing from it.

## In short

**The server can never read:** your wallets, transactions, amounts, categories, tags, budgets, goals or notes. It also can't tell what kind of thing each record is or whether you deleted it. It never receives your password, your recovery key, the secret a passkey gives your browser, or the key that encrypts your data.

**The server can see:**

- your username, and whether you run the server
- when you created your account, signed in, and changed your password or recovery key
- how many encrypted records you have, how big each one is, when each one was created and when it last changed
- how many passkeys you have, when each was added and last used, and how each one connects (built into the device, USB, Bluetooth and so on)
- the invites the operator made, and who used them
- for each request while it is being handled: your IP address, the time, the address requested and your browser's name and version

## What the database stores

Every table and column the server keeps, from `apps/server/src/store/schema.ts`. Backups hold the same tables.

### `users`

One row per account.

| Column              | What it is                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `id`                | A random id.                                                                                                                |
| `username`          | The name you sign in with. No email or real name is asked for or kept.                                                      |
| `login_secret_hash` | A hash of the login secret your browser derives from your password. Neither can be turned back into your password.          |
| `record_revision`   | A counter that goes up each time one of your records is saved, so it shows roughly how often you save.                      |
| `operator`          | Whether this account runs the server and can invite people (SYS-13).                                                        |
| `created_at`        | When the account was created.                                                                                               |
| `updated_at`        | When the account last changed, such as a new password.                                                                      |

### `sessions`

One row per signed-in device.

| Column       | What it is                                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `id`         | A hash of the token in that device's cookie, so this table can't be used to sign in.                                                      |
| `user_id`    | Whose session it is.                                                                                                                      |
| `expires_at` | When it ends: 60 days after the device was last used, moved forward at most once a day. So it shows, to the day, when each device was last used. |
| `created_at` | When you signed in on that device.                                                                                                        |

### `key_material`

What your browser needs to rebuild your keys. None of it can open your data without your password or recovery key.

| Column                 | What it is                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `user_id`              | Whose keys these are.                                                                              |
| `kdf_algorithm`        | The password-stretching method (Argon2id). Public by design.                                       |
| `kdf_salt`             | Random bytes that make your password's derived keys unique to you. Public by design.               |
| `kdf_memory_kib`       | How much memory stretching the password takes. Public by design.                                   |
| `kdf_iterations`       | How many rounds it takes. Public by design.                                                        |
| `kdf_parallelism`      | How many threads it uses. Public by design.                                                        |
| `wrapped_key_password` | Your data's key, encrypted with a key derived from your password.                                  |
| `wrapped_key_recovery` | The same key, encrypted with a key derived from your recovery key.                                 |
| `recovery_secret_hash` | A hash of the secret derived from your recovery key, used to check it during recovery.             |
| `created_at`           | When the keys were made, at sign-up.                                                               |
| `updated_at`           | When your password or recovery key last changed.                                                   |

### `records`

Your data, one row per record, all ciphertext.

| Column       | What it is                                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `user_id`    | Whose record it is.                                                                                                                 |
| `id`         | An id your device makes (UUIDv7). It starts with the time the record was created, to the millisecond.                               |
| `revision`   | Which save of yours last changed it.                                                                                                |
| `ciphertext` | The encrypted record. The server can see its size, but not what's in it: not its type, its contents, or whether it is deleted (SEC-04). |
| `updated_at` | When it last changed.                                                                                                               |

### `passkeys`

One row per passkey you added (SYS-06).

| Column                | What it is                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------- |
| `id`                  | The passkey's id, made by your device.                                                                          |
| `user_id`             | Whose passkey it is.                                                                                            |
| `public_key`          | The public half of the passkey, used to check sign-ins. It can't sign in or open anything by itself.            |
| `counter`             | A number some passkeys raise on each use, to spot a copied passkey.                                             |
| `transports`          | How the passkey said it connects, such as `internal` (built into the device), `usb`, `nfc` or `hybrid` (a phone nearby). |
| `wrapped_account_key` | Your data's key, encrypted with a secret only this passkey can produce in your browser.                         |
| `last_used_at`        | When it was last used to sign in or unlock.                                                                     |
| `created_at`          | When it was added.                                                                                              |

### `invites`

Invites the operator made (SYS-13).

| Column       | What it is                                                                          |
| ------------ | ----------------------------------------------------------------------------------- |
| `id`         | A random id.                                                                        |
| `code_hash`  | A hash of the invite code, so this table can't be used to sign up.                  |
| `created_by` | Which account made it.                                                              |
| `expires_at` | When it stops working, 7 days after it was made.                                    |
| `used_by`    | Which account signed up with it.                                                    |
| `used_at`    | When it was used.                                                                   |
| `created_at` | When it was made.                                                                   |

### `server_settings`

The server's own settings. Nothing about any user.

| Column       | What it is                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------- |
| `key`        | The setting's name. Today there is one: the random secret the server makes on first start.        |
| `value`      | Its value.                                                                                        |
| `created_at` | When it was made.                                                                                 |

## What it sees but doesn't keep

- **Each request,** while it is handled: your IP address, the time, the address requested (such as `/api/records`), its size and your browser's User-Agent. Mirador doesn't write a request log, and the Caddy setup in `docker/host` doesn't either. A proxy or hosting provider in front of the server may log these on its own.
- **Attempt limits** count sign-in attempts per IP address and per username, in memory only, for 1 to 15 minutes. A restart forgets them.
- **Passkey challenges** are kept in memory for up to 5 minutes, until they are used.
- **Login and recovery secrets** arrive with each sign-in, recovery or password change, are checked against their hash, and are never written anywhere. They are derived from your password or recovery key and can't be turned back into either.

## Logs

The server prints only two things when it starts: the setup code while the server has no accounts yet, and the port it listens on.

## Backups

The nightly backup (`docker/host/backup.sh`) is a copy of the whole database, so it holds exactly what the tables above hold. Your records stay encrypted in it. The usernames, dates and sizes are readable, so treat backups as private.

## Not built yet

These come with later features, and this page will change with them:

- **Notifications (SEC-14):** the server will know when it sends each one. Their content is generic, never your data.
- **Reading receipts and statements (IMP-11, SEC-05):** the server will see each image while it reads it, in memory only, and never store it.
- **Encrypted files (SEC-06):** the server will see each file's size and when it was added.

## What someone who controls the server could do

End-to-end encryption protects your data from the server, its database and its backups. It has limits worth knowing:

- **The app itself comes from the server.** Someone who takes over the server could change the app it sends your browser, so that it captures your password the next time you type it. Encryption can't stop a server that changes the code it serves; keeping the server safe and up to date can.
- **It could hide or roll back changes.** It can't alter a record without the change being detected, but it could leave out recent changes or send an older version of a record (see [ADR 0003](adr/0003-encrypted-records-and-sync.md)).
- **It could stop serving you,** or delete your data. Backups are the defence against losing it.
