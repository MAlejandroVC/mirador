import { z } from 'zod'

// Encrypted records (SEC-01). The server sees only these envelopes: an id the browser
// made, the revision it assigned, and ciphertext. Record types, contents and even
// whether a record was deleted are all inside the ciphertext (SEC-04, SEC-10).

export const recordId = z.uuid({ version: 'v7' })

// "v1." then base64url. 1 MiB is far above any record; files are stored separately.
export const recordCiphertext = z
  .string()
  .max(1024 * 1024)
  .regex(/^v\d+\.[A-Za-z0-9_-]+$/)

// A per-user counter the server bumps for every record it saves. A device keeps the
// highest one it has seen and asks for everything after it.
export const revision = z.int().nonnegative()

export const maxPushChanges = 500
export const maxPullChanges = 500

// POST /api/records. A batch is saved whole or not at all (NFR-08).
export const pushRequest = z.object({
  changes: z
    .array(
      z.object({
        id: recordId,
        // The revision this edit was based on: 0 for a new record.
        baseRevision: revision,
        ciphertext: recordCiphertext,
      }),
    )
    .min(1)
    .max(maxPushChanges),
})
export type PushRequest = z.infer<typeof pushRequest>

// The revision each record got. A record already saved with the same ciphertext (a
// retried upload, WID-10) keeps the revision it has.
export const pushResponse = z.object({
  revisions: z.record(z.string(), revision),
})
export type PushResponse = z.infer<typeof pushResponse>

// 409: another device changed these records since the edit was based on them. Nothing
// in the batch was saved; the device pulls and pushes again.
export const pushConflict = z.object({
  error: z.literal('conflict'),
  conflicts: z.array(recordId),
})
export type PushConflict = z.infer<typeof pushConflict>

// GET /api/records?after=<revision>. Changes in revision order.
export const pullResponse = z.object({
  changes: z.array(z.object({ id: recordId, revision, ciphertext: recordCiphertext })),
  // True when there is more after the last change returned.
  more: z.boolean(),
})
export type PullResponse = z.infer<typeof pullResponse>

// What is inside a record's ciphertext. Each type has its own schema and version
// (record types come with the features that use them); a deleted record keeps only
// its type, so other devices learn it is gone.
export const recordBody = z.discriminatedUnion('deleted', [
  z.object({
    deleted: z.literal(false),
    type: z.string().min(1),
    schema: z.int().positive(),
    data: z.unknown(),
  }),
  z.object({ deleted: z.literal(true), type: z.string().min(1) }),
])
export type RecordBody = z.infer<typeof recordBody>
