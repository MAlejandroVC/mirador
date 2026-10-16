import type { RecordBody } from '@repo/api'

// SYS-23: everything a removed account entered, as one file made on this device from
// the decrypted records. The server never sees what is in it. It keeps each record
// as the app stores it (type, schema version and data), so the full archive
// (DAT-01, DAT-04) can read it back later.
export const exportFormat = 'mirador-records'
export const exportVersion = 1

export function exportFile(
  records: { id: string; body: RecordBody }[],
  username: string,
  exportedAt: Date,
) {
  const kept = records.flatMap(({ id, body }) =>
    body.deleted ? [] : [{ id, type: body.type, schema: body.schema, data: body.data }],
  )
  kept.sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id))
  return JSON.stringify(
    {
      format: exportFormat,
      version: exportVersion,
      exportedAt: exportedAt.toISOString(),
      username,
      records: kept,
    },
    null,
    2,
  )
}

export function exportFileName(username: string, date: string) {
  return `mirador-${username}-${date}.json`
}

// Hands the file to the browser to save, without it leaving the device.
export function saveFile(contents: string, name: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 1000)
}
