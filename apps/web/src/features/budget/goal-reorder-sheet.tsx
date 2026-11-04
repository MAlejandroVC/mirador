import type { GoalRecord } from '@repo/api'
import { useTranslation } from 'react-i18next'
import { ReorderSheet } from '../../components/ui/reorder-sheet'
import { type RecordChange, useLedger, useSaveRecords } from '../wallets/use-ledger'
import { GoalTile } from './parts'
import { goalChange } from './records'

// BUD-24: the goals' order is their priority: the first is funded first. Holding a
// grip and dragging is all it takes, as in iOS (Alejandro's call, 2026-10-20).
export function GoalReorderSheet({
  open,
  goals,
  onClose,
}: {
  open: boolean
  goals: readonly (Pick<GoalRecord, 'name' | 'kind'> & { id: string })[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { data: ledger } = useLedger()
  const save = useSaveRecords()
  return (
    <ReorderSheet
      open={open}
      title={t('budget.goals.orderTitle')}
      intro={t('budget.goals.orderIntro')}
      items={goals.map((goal) => ({
        id: goal.id,
        name: goal.name,
        leading: <GoalTile kind={goal.kind} />,
      }))}
      pending={save.isPending}
      failed={save.isError}
      onSave={(ids, done) => {
        const records = new Map((ledger?.goals ?? []).map((goal) => [goal.id, goal]))
        // Only the goals whose place changed are saved.
        const changes: RecordChange[] = ids.flatMap((id, order) => {
          const goal = records.get(id)
          if (!goal || goal.order === order) return []
          const { id: goalId, ...record } = goal
          return [goalChange(goalId, { ...record, order })]
        })
        if (changes.length === 0) onClose()
        else save.mutate(changes, { onSuccess: done })
      }}
      onClose={onClose}
    />
  )
}
