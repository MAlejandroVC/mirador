# 0003. Encrypted records and sync

- Status: accepted
- Date: 2026-10-13

## Context

Every piece of a user's data is encrypted in the browser before it is sent (SEC-01), and anyone holding the server, its database or its backups must see only ciphertext (SEC-04). Each user's records must stay theirs (SEC-09), every device must show the same data (NFR-05), and a save must never be half done (NFR-08) or done twice when retried (WID-10). The Technology Stack document sketches this; this records how it is built and the gaps it fills.

## Decision

- **A record is one AES-256-GCM ciphertext under the account key** (`@repo/crypto`, `encryptRecord`). A random 96-bit nonce per encryption. The associated data is the user id and record id, so the server can't move a record to another id or another account: either fails to decrypt (`TamperedRecordError`) instead of showing the wrong data. Stored as `v1.<base64url(nonce ‖ ciphertext)>`.
- **Everything about a record is inside the ciphertext:** its type, its schema version, its data, and whether it was deleted (`recordBody` in `@repo/api`). A deletion is saved as an encrypted tombstone that keeps only the type, so other devices learn it is gone and the server can't tell a deletion from an edit. The server knows only each record's id, revision, size and when it changed (SEC-10).
- **Record ids are UUIDv7 made on the device** (`newRecordId`), so a retried upload can't duplicate a record.
- **Revisions are one counter per user, bumped by the server for each record it saves.** A device keeps the highest revision it has seen and pulls everything after it (`GET /api/records?after=`, 500 per page). Every saved record gets its own revision, so a page never splits a save.
- **A save is one batch, accepted or refused whole** (`POST /api/records`, up to 500 records). Each change carries the revision it was based on. If another device saved one of those records first, nothing is saved and the server answers 409 with their ids. A change whose ciphertext is already stored is a retried upload: it keeps its revision and isn't counted as a conflict (WID-10).
- **Last write wins, on the device.** After a 409, `RecordSync` pulls, keeps the other device's version aside, and saves again on top of it. It returns what it replaced so the app can tell the person. It gives up after three tries in a row.
- **The server takes each push under a row lock on the user,** so revisions follow the order saves happened, and every query names the signed-in user's id; the records table's key is (user id, record id), so the same id from two users is two rows (SEC-09).
- **Decrypted records live only in the worker's memory** (`RecordSync`, held by the vault). Locking or signing out drops them; unlocking pulls and decrypts them again. A record that fails to decrypt stops the app with the "server isn't safe" message rather than showing partial data (NFR-14).

## Consequences

- An attacker with the database sees how many records a user has, their sizes and when they change. Not what they are, not which are deleted.
- **The server can still withhold or roll back.** It could leave out new changes or serve an older ciphertext of a record. Both decrypt fine. Detecting this needs signed history and is not in V1.
- Every unlock downloads and decrypts every record. That is fine at personal scale. The encrypted IndexedDB cache from the stack document can make it one download later.
- Not in this change, and coming with the features that need them:
  - the in-memory SQLite database, with the first record type (wallets)
  - the offline quick-add queue (WID-09, SEC-11)
  - encrypted files (SEC-06)
  - purging old tombstones
