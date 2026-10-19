import { describe, expect, it } from 'vitest'
import { exportFile, exportFileName } from './export'

describe('export', () => {
  it('SYS-23: keeps every record a removed person entered and leaves deleted ones out', () => {
    const file = JSON.parse(
      exportFile(
        [
          {
            id: 'b',
            body: { deleted: false, type: 'wallet', schema: 1, data: { name: 'Checking' } },
          },
          { id: 'c', body: { deleted: true, type: 'wallet' } },
          {
            id: 'a',
            body: { deleted: false, type: 'transaction', schema: 2, data: { amount: 1250 } },
          },
        ],
        'ben',
        new Date('2026-10-16T12:00:00Z'),
      ),
    ) as unknown

    expect(file).toEqual({
      format: 'mirador-records',
      version: 1,
      exportedAt: '2026-10-16T12:00:00.000Z',
      username: 'ben',
      records: [
        { id: 'a', type: 'transaction', schema: 2, data: { amount: 1250 } },
        { id: 'b', type: 'wallet', schema: 1, data: { name: 'Checking' } },
      ],
    })
    expect(exportFileName('ben', '2026-10-16')).toBe('mirador-backup-ben-2026-10-16.json')
  })
})
