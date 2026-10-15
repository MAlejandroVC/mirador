import { z } from 'zod'
import { currencyCode } from './wallets.ts'

// Epic 10 settings that follow the person to every device, in one encrypted record.
// Appearance stays per device (SYS-16, SYS-17).
export const preferencesRecordType = 'preferences'

export const preferencesRecord = z.object({
  // SYS-01: new wallets start with it and every total is shown in it.
  defaultCurrency: currencyCode,
})
export type PreferencesRecord = z.infer<typeof preferencesRecord>
