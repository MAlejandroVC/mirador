import { z } from 'zod'
import { recordId } from './records.ts'
import { calendarDate } from './wallets.ts'

// Epic 6, the budget: the plan, goals, what-ifs and each closed month. Like every
// other record they are encrypted on the device (SEC-01); the server never sees a
// target, a goal or an amount, and every figure is worked out in the browser.

const minor = z.int().min(-1_000_000_000_000).max(1_000_000_000_000)
const amount = z.int().nonnegative().max(1_000_000_000_000)
/** A plan line: a category's id, or a category's and a tag's joined by "~" (BUD-08). */
export const planLine = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[^~]+(~[^~]+)?$/)
const flexibility = z.enum(['locked', 'fixed', 'flexible'])

/** SYS-02, SYS-09: the budget's settings, kept with the other synced preferences. */
export const budgetSettings = z.object({
  startDay: z.int().min(1).max(31),
  lookback: z.union([z.literal(3), z.literal(6), z.literal(12)]),
  /** BUD-35: a share, such as 0.15. */
  maxCut: z.number().min(0.05).max(0.5),
  /** BUD-43: a share, such as 0.1. */
  atRisk: z.number().min(0).max(0.5),
})
export type BudgetSettingsRecord = z.infer<typeof budgetSettings>

export const exclusions = z.object({
  periods: z.array(calendarDate).max(200),
  linePeriods: z.array(z.object({ line: planLine, start: calendarDate })).max(2000),
  transactionIds: z.array(recordId).max(5000),
})

/** BUD-04, BUD-05, BUD-08, BUD-37, BUD-39: the plan, one record per person. */
export const budgetPlanRecordType = 'budgetPlan'

export const budgetPlanRecord = z.object({
  targets: z.array(z.object({ line: planLine, amount, byHand: z.boolean().optional() })).max(2000),
  income: amount.optional(),
  incomeByPeriod: z
    .array(z.object({ start: calendarDate, amount }))
    .max(500)
    .optional(),
  adjustments: z
    .array(
      z.object({
        line: planLine,
        change: minor,
        steps: z.int().min(1).max(12),
        from: calendarDate,
      }),
    )
    .max(2000),
  exclusions,
  tagLines: z.array(z.object({ categoryId: recordId, tagId: recordId })).max(500),
  /** BUD-06: rough amounts per line, entered before there is a month of history. */
  estimates: z
    .array(z.object({ line: planLine, amount }))
    .max(2000)
    .optional(),
  /** BUD-39: the what-if last used as the plan, and from which month. */
  scenarioId: recordId.optional(),
  updatedAt: z.iso.datetime().optional(),
})
export type BudgetPlanRecord = z.infer<typeof budgetPlanRecord>

/** BUD-20: a goal. */
export const goalRecordType = 'goal'

export const goalKinds = ['save', 'debt', 'invest', 'emergency', 'afford'] as const

export const goalRecord = z
  .object({
    name: z.string().trim().min(1).max(80),
    kind: z.enum(goalKinds),
    target: amount.optional(),
    by: calendarDate.optional(),
    perMonth: amount.optional(),
    saved: minor,
    walletIds: z.array(recordId).max(20),
    start: calendarDate,
    order: z.int().nonnegative(),
    paused: z.boolean().optional(),
    done: calendarDate.optional(),
    months: z.int().min(1).max(36).optional(),
    purchase: z
      .object({
        date: calendarDate,
        buffer: amount,
        bufferMonths: z.int().min(1).max(36).optional(),
        rate: z.int().min(0).max(20_000).optional(),
        payments: z.int().min(1).max(600).optional(),
      })
      .optional(),
    createdAt: z.iso.datetime().optional(),
    updatedAt: z.iso.datetime().optional(),
  })
  .superRefine((goal, context) => {
    const issue = (message: string) => {
      context.addIssue({ code: 'custom', message })
    }
    if (goal.by !== undefined && goal.perMonth !== undefined)
      issue('A goal has a date or an amount each month, not both')
    if (goal.kind === 'afford' && goal.purchase === undefined) issue('A purchase needs its date')
    if (goal.kind === 'debt' && goal.walletIds.length !== 1) issue('A debt follows one wallet')
  })
export type GoalRecord = z.infer<typeof goalRecord>

/** BUD-26: money added to a goal by hand, from its own screen (never a transaction field). */
export const goalContributionRecordType = 'goalContribution'

export const goalContributionRecord = z.object({
  goalId: recordId,
  amount: minor,
  date: calendarDate,
})
export type GoalContributionRecord = z.infer<typeof goalContributionRecord>

/** BUD-30, BUD-31, BUD-38: a saved what-if. */
export const scenarioRecordType = 'scenario'

export const scenarioRecord = z.object({
  name: z.string().trim().min(1).max(80),
  changes: z
    .array(
      z.object({
        line: planLine,
        kind: z.enum(['percent', 'amount', 'target']),
        value: z.number().min(-1_000_000_000_000).max(1_000_000_000_000),
      }),
    )
    .max(500),
  income: minor.optional(),
  goals: z
    .array(
      z.object({
        goalId: recordId,
        target: amount.optional(),
        by: calendarDate.optional(),
        perMonth: amount.optional(),
      }),
    )
    .max(100),
  unlocked: z.array(planLine).max(500),
  flexibility: z.array(z.object({ categoryId: recordId, flexibility })).max(500),
  steps: z.int().min(1).max(12),
  createdAt: z.iso.datetime().optional(),
  updatedAt: z.iso.datetime().optional(),
})
export type ScenarioRecord = z.infer<typeof scenarioRecord>

/** BUD-50 to BUD-57: a closed month, kept as it was (BUD-56). */
export const budgetSnapshotRecordType = 'budgetSnapshot'

export const budgetSnapshotRecord = z.object({
  start: calendarDate,
  end: calendarDate,
  lines: z.array(z.object({ line: planLine, flexibility, target: amount, spent: minor })).max(2000),
  income: z.object({ planned: amount, actual: minor }),
  leftOver: z.object({ planned: minor, actual: minor }),
  goals: z
    .array(
      z.object({
        goalId: recordId,
        name: z.string().max(80),
        progress: minor,
        target: amount.optional(),
        contributed: minor,
        need: amount,
        projected: calendarDate.optional(),
      }),
    )
    .max(100),
  /** BUD-51: where the extra went. */
  surplus: z.array(z.object({ goalId: recordId, amount })).max(100),
  /** BUD-52: what each line carries into the next month. */
  carry: z.array(z.object({ line: planLine, amount: minor })).max(2000),
  /** BUD-55: whether the targets were kept or moved to the new usual month. */
  targets: z.enum(['kept', 'updated']),
  closedAt: z.iso.datetime(),
})
export type BudgetSnapshotRecord = z.infer<typeof budgetSnapshotRecord>
