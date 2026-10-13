// Sync client: pushes and pulls encrypted records. The server may import only ./protocol.
import {
  maxPushChanges,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  recordBody,
  type RecordBody,
} from '@repo/api'
import { decryptRecord, encryptRecord } from '@repo/crypto'

export interface SyncTransport {
  pull(after: number): Promise<PullResponse>
  // Either every change was saved, or none was and these records changed elsewhere.
  push(
    changes: PushRequest['changes'],
  ): Promise<{ revisions: PushResponse['revisions'] } | { conflicts: string[] }>
}

export interface SyncedRecord {
  id: string
  // The server's revision of this version; 0 while it has never been saved there.
  revision: number
  body: RecordBody
}

// A version another device saved that this device's save replaced: the losing side of
// last-write-wins, kept so the app can say what was overwritten.
export interface Overwritten {
  id: string
  body: RecordBody
}

export class RecordsAltered extends Error {
  constructor(readonly recordId: string) {
    super(`Record ${recordId} could not be decrypted: it was altered on the server`)
    this.name = 'RecordsAltered'
  }
}

// How many times a save pulls and tries again when another device keeps saving the
// same records in between.
const maxAttempts = 3

// Keeps this device's copy of a user's records in step with the server. Records are
// encrypted here, before they leave, and decrypted here as they arrive (SEC-01); the
// server only orders them and refuses edits based on a stale revision.
export class RecordSync {
  readonly #records = new Map<string, SyncedRecord>()
  #cursor = 0

  constructor(
    private readonly transport: SyncTransport,
    private readonly accountKey: CryptoKey,
    private readonly userId: string,
  ) {}

  get(id: string) {
    return this.#records.get(id)
  }

  all() {
    return [...this.#records.values()]
  }

  // Fetches and decrypts every change since the last pull. Returns the changed ids.
  async pull() {
    const changed: string[] = []
    for (;;) {
      const page = await this.transport.pull(this.#cursor)
      for (const change of page.changes) {
        const body = await this.#open(change.id, change.ciphertext)
        this.#records.set(change.id, { id: change.id, revision: change.revision, body })
        this.#cursor = Math.max(this.#cursor, change.revision)
        changed.push(change.id)
      }
      if (!page.more || page.changes.length === 0) return changed
    }
  }

  // Encrypts and saves the records, all or none (NFR-08). When another device changed
  // one of them first, this save still wins (last write wins) and the version it
  // replaced is returned, so the app can tell the person.
  async save(records: { id: string; body: RecordBody }[]): Promise<Overwritten[]> {
    if (records.length > maxPushChanges) throw new Error(`Save at most ${maxPushChanges} records`)
    const overwritten: Overwritten[] = []
    for (let attempt = 1; ; attempt += 1) {
      const changes = await Promise.all(
        records.map(async ({ id, body }) => ({
          id,
          baseRevision: this.#records.get(id)?.revision ?? 0,
          ciphertext: await encryptRecord(
            this.accountKey,
            { userId: this.userId, recordId: id },
            body,
          ),
        })),
      )
      const result = await this.transport.push(changes)
      if ('revisions' in result) {
        for (const { id, body } of records) {
          const revision = result.revisions[id]
          if (revision === undefined) throw new Error(`The server did not save record ${id}`)
          this.#records.set(id, { id, revision, body })
          this.#cursor = Math.max(this.#cursor, revision)
        }
        return overwritten
      }
      if (attempt >= maxAttempts) throw new Error('Records kept changing on other devices')
      await this.pull()
      for (const id of result.conflicts) {
        const theirs = this.#records.get(id)
        if (theirs) overwritten.push({ id, body: theirs.body })
      }
    }
  }

  async #open(id: string, ciphertext: string) {
    try {
      const plaintext = await decryptRecord(
        this.accountKey,
        { userId: this.userId, recordId: id },
        ciphertext,
      )
      return recordBody.parse(plaintext)
    } catch {
      // Altered or moved ciphertext, or a body that doesn't match its schema.
      throw new RecordsAltered(id)
    }
  }
}
