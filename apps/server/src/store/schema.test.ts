import { readFile } from 'node:fs/promises'
import { is } from 'drizzle-orm'
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import * as schema from './schema.ts'

// SEC-10: docs/what-the-server-sees.md must list exactly what the server stores, so a
// new table or column can't go in without saying so there.
const page = new URL('../../../../docs/what-the-server-sees.md', import.meta.url)

const tables = Object.values(schema)
  .filter((value) => is(value, PgTable))
  .map((table) => {
    const config = getTableConfig(table)
    return { name: config.name, columns: config.columns.map((column) => column.name).sort() }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

// Each table is a "### `name`" heading followed by a table whose first cell is the column.
function documented(markdown: string) {
  const sections = markdown.split(/^### /m).slice(1)
  return sections
    .map((section) => {
      const name = /^`([a-z_]+)`/.exec(section)?.[1] ?? ''
      const columns = [...section.matchAll(/^\| `([a-z_]+)`/gm)].map((match) => match[1] ?? '')
      return { name, columns: columns.sort() }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

describe('what the server can see', () => {
  it('SEC-10: the page lists every table and column the server stores, and nothing else', async () => {
    const markdown = await readFile(page, 'utf8')

    expect(tables.length).toBeGreaterThan(0)
    expect(documented(markdown)).toEqual(tables)
  })
})
