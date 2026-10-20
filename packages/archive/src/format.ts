import {
  budgetPlanRecord,
  budgetSnapshotRecord,
  categoryGroupRecord,
  categoryRecord,
  exchangeRateRecord,
  goalContributionRecord,
  goalRecord,
  importBatchRecord,
  importProfileRecord,
  payeeRecord,
  preferencesRecord,
  profileRecord,
  type RecordBody,
  recordId,
  recurringRecord,
  scenarioRecord,
  tagRecord,
  transactionRecord,
  walletRecord,
} from '@repo/api'
import { z } from 'zod'

// DAT-01, DAT-06, DAT-08: the Mirador backup. One JSON file holding every record the
// way the app stores it (type, schema version and data), made on the device from the
// decrypted records, so the server never sees it (SEC-01). docs/archive-format.md
// describes it for other tools.

export const archiveFormat = 'mirador-records'
/** DAT-06: bumped when the file's shape changes; older files are upgraded on import. */
export const archiveVersion = 1

export interface ArchiveRecord {
  id: string
  type: string
  schema: number
  data: unknown
}

export interface Archive {
  format: typeof archiveFormat
  version: number
  exportedAt: string
  username: string
  records: ArchiveRecord[]
}

export function archiveFile(
  records: readonly { id: string; body: RecordBody }[],
  username: string,
  exportedAt: Date,
) {
  const kept = records.flatMap(({ id, body }) =>
    body.deleted ? [] : [{ id, type: body.type, schema: body.schema, data: body.data }],
  )
  kept.sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id))
  return JSON.stringify(
    {
      format: archiveFormat,
      version: archiveVersion,
      exportedAt: exportedAt.toISOString(),
      username,
      records: kept,
    },
    null,
    2,
  )
}

export function archiveFileName(username: string, date: string) {
  return `mirador-backup-${username}-${date}.json`
}

/** The schema of each record type the app makes, at the version it writes (schema 1). */
export const recordSchemas: Record<string, z.ZodType> = {
  wallet: walletRecord,
  transaction: transactionRecord,
  exchangeRate: exchangeRateRecord,
  categoryGroup: categoryGroupRecord,
  category: categoryRecord,
  tag: tagRecord,
  payee: payeeRecord,
  recurring: recurringRecord,
  preferences: preferencesRecord,
  profile: profileRecord,
  importBatch: importBatchRecord,
  importProfile: importProfileRecord,
  budgetPlan: budgetPlanRecord,
  goal: goalRecord,
  goalContribution: goalContributionRecord,
  scenario: scenarioRecord,
  budgetSnapshot: budgetSnapshotRecord,
}

/** DAT-07: one thing wrong with a file, and where. */
export interface ArchiveError {
  /** Such as "records[12] (transaction)", or "" for the file as a whole. */
  location: string
  message: string
}

export type ArchiveResult = { ok: true; archive: Archive } | { ok: false; errors: ArchiveError[] }

const envelope = z.object({
  format: z.literal(archiveFormat),
  version: z.int().positive(),
  exportedAt: z.iso.datetime(),
  username: z.string(),
  records: z.array(z.unknown()),
})

const recordShape = z.object({
  id: recordId,
  type: z.string().min(1),
  schema: z.int().positive(),
  data: z.unknown(),
})

// DAT-06: each step takes a file one version up. There are none yet: version 1 is the
// first. A step would go here as `1: (file) => ({ ...file, version: 2, ... })`.
const upgrades: Record<number, (file: Archive) => Archive> = {}

/**
 * DAT-06, DAT-07: reads a backup, upgrading an older one, and checks every record
 * against its schema. Any problem is reported with where it is, and nothing is read.
 */
export function readArchive(text: string): ArchiveResult {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, errors: [{ location: '', message: 'notJson' }] }
  }
  const parsed = envelope.safeParse(json)
  if (!parsed.success)
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({
        location: issue.path.join('.'),
        message: issue.path[0] === 'format' ? 'notMirador' : issue.message,
      })),
    }
  if (parsed.data.version > archiveVersion)
    return { ok: false, errors: [{ location: 'version', message: 'newerVersion' }] }

  const errors: ArchiveError[] = []
  const records: ArchiveRecord[] = []
  const seen = new Set<string>()
  for (const [index, raw] of parsed.data.records.entries()) {
    const record = recordShape.safeParse(raw)
    if (!record.success) {
      errors.push({
        location: `records[${String(index)}]`,
        message: record.error.issues[0]?.message ?? '',
      })
      continue
    }
    const { id, type, schema, data } = record.data
    const location = `records[${String(index)}] (${type})`
    const check = recordSchemas[type]
    if (!check) {
      errors.push({ location, message: 'unknownType' })
      continue
    }
    if (schema !== 1) {
      errors.push({ location, message: 'unknownSchema' })
      continue
    }
    if (seen.has(id)) {
      errors.push({ location, message: 'repeatedId' })
      continue
    }
    seen.add(id)
    const checked = check.safeParse(data)
    if (!checked.success) {
      const issue = checked.error.issues[0]
      errors.push({
        location: issue && issue.path.length > 0 ? `${location}.${issue.path.join('.')}` : location,
        message: issue?.message ?? '',
      })
      continue
    }
    records.push({ id, type, schema, data: checked.data })
  }
  if (errors.length > 0) return { ok: false, errors }

  let archive: Archive = { ...parsed.data, format: archiveFormat, records }
  while (archive.version < archiveVersion) {
    const step = upgrades[archive.version]
    if (!step) return { ok: false, errors: [{ location: 'version', message: 'unknownVersion' }] }
    archive = step(archive)
  }
  return { ok: true, archive }
}

/** What a backup holds, counted for the restore sheet. */
export function archiveCounts(archive: Archive) {
  const counts = new Map<string, number>()
  for (const record of archive.records) counts.set(record.type, (counts.get(record.type) ?? 0) + 1)
  return counts
}
