import {
  type BudgetPlanRecord,
  budgetPlanRecord,
  budgetPlanRecordType,
  type BudgetSettingsRecord,
  type BudgetSnapshotRecord,
  budgetSnapshotRecord,
  budgetSnapshotRecordType,
  type GoalContributionRecord,
  goalContributionRecord,
  goalContributionRecordType,
  type GoalRecord,
  goalRecord,
  goalRecordType,
  type ScenarioRecord,
  scenarioRecord,
  scenarioRecordType,
} from '@repo/api'
import { defaultBudgetSettings } from '@repo/core'
import {
  type Ledger,
  newId,
  preferencesChange,
  type RecordChange,
  recordBody,
} from '../wallets/use-ledger'

// Epic 6's records, ready to save. Each is checked against its schema here and
// encrypted in the worker before it leaves the device (SEC-01).

type Patch<T> = { [K in keyof T]?: T[K] | undefined }

/** Drops the keys set to undefined, so clearing a setting leaves it out of the record. */
function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}

const emptyPlanRecord: BudgetPlanRecord = {
  targets: [],
  adjustments: [],
  exclusions: { periods: [], linePeriods: [], transactionIds: [] },
  tagLines: [],
}

/** The plan record with some fields changed; there is one per person (BUD-04). */
export function planChange(ledger: Pick<Ledger, 'plan'>, patch: Patch<BudgetPlanRecord>) {
  const { id, ...current } = ledger.plan ?? { id: newId(), ...emptyPlanRecord }
  const data = budgetPlanRecord.parse(
    defined({ ...current, ...patch, updatedAt: new Date().toISOString() }),
  )
  return { id, body: recordBody(budgetPlanRecordType, data) } satisfies RecordChange
}

/** The plan record as it is now, for building a change from. */
export function currentPlan(ledger: Pick<Ledger, 'plan'>): BudgetPlanRecord {
  // Parsing drops the record's id.
  return ledger.plan ? budgetPlanRecord.parse(ledger.plan) : emptyPlanRecord
}

/** SYS-02, SYS-09: the budget settings with some changed, in the synced preferences. */
export function budgetSettingsChange(ledger: Ledger, patch: Partial<BudgetSettingsRecord>) {
  return preferencesChange(ledger, {
    budget: { ...defaultBudgetSettings, ...ledger.preferences?.budget, ...patch },
  })
}

export function goalChange(id: string, goal: Patch<GoalRecord>): RecordChange {
  const data = goalRecord.parse(defined({ ...goal, updatedAt: new Date().toISOString() }))
  return { id, body: recordBody(goalRecordType, data) }
}

export function contributionChange(id: string, data: GoalContributionRecord): RecordChange {
  return { id, body: recordBody(goalContributionRecordType, goalContributionRecord.parse(data)) }
}

export function scenarioChange(id: string, scenario: Patch<ScenarioRecord>): RecordChange {
  const data = scenarioRecord.parse(defined({ ...scenario, updatedAt: new Date().toISOString() }))
  return { id, body: recordBody(scenarioRecordType, data) }
}

export function snapshotChange(id: string, data: BudgetSnapshotRecord): RecordChange {
  return { id, body: recordBody(budgetSnapshotRecordType, budgetSnapshotRecord.parse(data)) }
}

/** A record removed; the server keeps only that it is gone (SEC-01). */
export function deletion(id: string, type: string): RecordChange {
  return { id, body: { deleted: true, type } }
}
