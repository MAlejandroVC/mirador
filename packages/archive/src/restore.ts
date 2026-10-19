import type { RecordBody } from '@repo/api'
import type { Archive, ArchiveRecord } from './format.ts'

// DAT-04, DAT-05: putting a backup back. "Replace" makes the account exactly what the
// backup holds. "Add what's missing" keeps everything already there and adds the rest:
// a record whose id is already here is skipped, and a group, category, tag or payee
// with the same name as one here is the same thing, so the backup's transactions are
// pointed at the one here instead of adding a second of it.

export interface CurrentRecord {
  id: string
  body: RecordBody
}

export interface RecordChange {
  id: string
  body: RecordBody
}

export type RestoreMode = 'merge' | 'replace'

const key = (name: unknown) =>
  typeof name === 'string'
    ? name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
    : ''

// Settings the account has only one of.
const singletons = new Set(['preferences', 'profile'])
// The fields that point at another record, by record type.
const references = ['walletId', 'toWalletId', 'categoryId', 'payeeId', 'groupId'] as const

export function restoreChanges(
  archive: Archive,
  current: readonly CurrentRecord[],
  mode: RestoreMode,
): { changes: RecordChange[]; added: number; skipped: number } {
  const live = current.filter((record) => !record.body.deleted)
  const body = (record: ArchiveRecord): RecordBody => ({
    deleted: false,
    type: record.type,
    schema: record.schema,
    data: record.data,
  })

  if (mode === 'replace') {
    const keep = new Set(archive.records.map((record) => record.id))
    const changes: RecordChange[] = [
      ...live
        .filter((record) => !keep.has(record.id))
        .map((record) => ({
          id: record.id,
          body: { deleted: true as const, type: record.body.type },
        })),
      ...archive.records.map((record) => ({ id: record.id, body: body(record) })),
    ]
    return { changes, added: archive.records.length, skipped: 0 }
  }

  const here = new Map(live.map((record) => [record.id, record]))
  const data = (record: CurrentRecord) =>
    (record.body.deleted ? {} : record.body.data) as Record<string, unknown>
  const typesHere = new Set(live.map((record) => record.body.type))
  // The backup's id → the matching record's id here.
  const same = new Map<string, string>()
  const byName = (type: string, extra: (d: Record<string, unknown>) => string = () => '') => {
    const found = new Map<string, string>()
    for (const record of live)
      if (record.body.type === type)
        found.set(`${key(data(record).name)}|${extra(data(record))}`, record.id)
    return found
  }
  const groupsHere = byName('categoryGroup')
  const tagsHere = byName('tag')
  const payeesHere = byName('payee')
  const groupNameHere = new Map(
    live.filter((r) => r.body.type === 'categoryGroup').map((r) => [r.id, key(data(r).name)]),
  )
  const systemHere = new Map<string, string>()
  for (const record of live)
    if (record.body.type === 'category' && typeof data(record).systemKey === 'string')
      systemHere.set(data(record).systemKey as string, record.id)
  const categoriesHere = byName('category', (d) => groupNameHere.get(d.groupId as string) ?? '')
  const archiveGroupNames = new Map(
    archive.records
      .filter((r) => r.type === 'categoryGroup')
      .map((r) => [r.id, key((r.data as { name?: unknown }).name)]),
  )

  for (const record of archive.records) {
    if (here.has(record.id)) continue
    const d = record.data as Record<string, unknown>
    let match: string | undefined
    if (record.type === 'categoryGroup') match = groupsHere.get(`${key(d.name)}|`)
    else if (record.type === 'tag') match = tagsHere.get(`${key(d.name)}|`)
    else if (record.type === 'payee') match = payeesHere.get(`${key(d.name)}|`)
    else if (record.type === 'category')
      match =
        (typeof d.systemKey === 'string' ? systemHere.get(d.systemKey) : undefined) ??
        categoriesHere.get(`${key(d.name)}|${archiveGroupNames.get(d.groupId as string) ?? ''}`)
    if (match) same.set(record.id, match)
  }

  const point = (value: unknown) => (typeof value === 'string' ? (same.get(value) ?? value) : value)
  const changes: RecordChange[] = []
  let skipped = 0
  for (const record of archive.records) {
    if (
      here.has(record.id) ||
      same.has(record.id) ||
      (singletons.has(record.type) && typesHere.has(record.type))
    ) {
      skipped += 1
      continue
    }
    const d = { ...(record.data as Record<string, unknown>) }
    for (const field of references) if (field in d) d[field] = point(d[field])
    if (Array.isArray(d.tagIds)) d.tagIds = [...new Set((d.tagIds as unknown[]).map(point))]
    changes.push({ id: record.id, body: body({ ...record, data: d }) })
  }
  return { changes, added: changes.length, skipped }
}
