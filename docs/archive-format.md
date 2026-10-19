# Mirador backup file

This page describes the file that **Settings › Your data › Download a backup** makes (DAT-01), so other tools can read and write it (DAT-08). The app makes it on the device from the decrypted records. The server never sees it.

## The file

A backup is one UTF-8 JSON file named `mirador-backup-<username>-<YYYY-MM-DD>.json`:

```json
{
  "format": "mirador-records",
  "version": 1,
  "exportedAt": "2026-10-19T15:04:05.000Z",
  "username": "ana",
  "records": [
    {
      "id": "6c1f0e2a-…",
      "type": "wallet",
      "schema": 1,
      "data": { "name": "Checking", "preset": "checking", "currency": "MXN", … }
    }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `format` | Always `mirador-records`. |
| `version` | The version of this file's shape. Mirador upgrades older versions when it reads them and refuses newer ones (DAT-06). |
| `exportedAt` | When the file was made, ISO 8601 in UTC. |
| `username` | The account the file came from. Restoring into another account is allowed. |
| `records` | Every record of the account that isn't deleted, sorted by `type` and then `id`. |

Each record has:

- `id`: a UUID. Records point at each other by id, for example a transaction's `walletId`.
- `type`: which kind of record it is (see below).
- `schema`: the version of that type's fields. Every type is at schema 1.
- `data`: the record's fields.

## Record types

The fields of each type are the Zod schemas in [`packages/api/src`](../packages/api/src). Those schemas are the source of truth, and a file that doesn't match them is not restored.

| `type` | Schema | What it is |
| --- | --- | --- |
| `wallet` | `walletRecord` in `wallets.ts` | A wallet: name, preset, currency, look and features. |
| `exchangeRate` | `exchangeRateRecord` in `wallets.ts` | A rate the person entered, with its date. |
| `transaction` | `transactionRecord` in `transactions.ts` | Every expense, income, transfer, opening balance, adjustment, interest, fee and valuation. |
| `recurring` | `recurringRecord` in `recurring.ts` | A recurring transaction. |
| `categoryGroup` | `categoryGroupRecord` in `categories.ts` | A category group. |
| `category` | `categoryRecord` in `categories.ts` | A category and the group it belongs to. |
| `tag` | `tagRecord` in `categories.ts` | A tag. |
| `payee` | `payeeRecord` in `categories.ts` | A payee. |
| `preferences` | `preferencesRecord` in `preferences.ts` | Settings such as the default currency. One per account. |
| `profile` | `profileRecord` in `profile.ts` | The profile picture. One per account. |
| `importBatch` | `importBatchRecord` in `imports.ts` | One import: its file, counts, the rows left out and what it created, so it can be undone (IMP-34, IMP-35). |
| `importProfile` | `importProfileRecord` in `imports.ts` | The column settings remembered for files with the same header (IMP-03). |

The rules that apply to every type:

- Money is an integer in the currency's minor units, such as cents: `-12550` is 125.50 taken out of the wallet. It is never a decimal number.
- Dates are calendar dates written `YYYY-MM-DD`. Times are ISO 8601 in UTC.
- An amount is signed from the wallet's side. An expense or a transfer is negative and income is positive.
- A transfer's `toAmount` is what arrived in `toWalletId`, in that wallet's currency. An exchange `rate` is in millionths, so 18.45 is `18450000`.
- System categories, such as Uncategorized, have a `systemKey`. Their names can be changed, so tools should look for the key, not the name.

## Restoring

**Settings › Your data › Import a file** accepts a backup. Before changing anything, Mirador checks the whole file. If any record is wrong, the app lists each problem with where it is, such as `records[12] (transaction).amount`, and changes nothing (DAT-07).

Into an empty account, the restored account is exactly what the backup holds (DAT-04). Into an account that already has data, the person picks one of two ways:

- **Add what's missing** (the default, DAT-05) keeps everything already there. It skips records whose `id` is already in the account. A group, category, tag or payee with the same name as one already there is treated as the same thing, and the backup's transactions point at the existing one.
- **Replace everything** makes the account exactly what the backup holds and deletes everything else.

## When the format changes

Adding an optional field to a record type doesn't change any version. A change that older files don't fit raises `version` and adds a step to `upgrades` in [`packages/archive/src/format.ts`](../packages/archive/src/format.ts) that takes a file from the previous version to the new one. Files from every earlier version keep restoring.
