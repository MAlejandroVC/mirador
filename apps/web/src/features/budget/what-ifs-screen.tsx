import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBack } from '../../components/shell/back'
import { Button } from '../../components/ui/button'
import { ChoiceRow } from '../../components/ui/choice-row'
import { EmptyState } from '../../components/ui/empty-state'
import { FieldNote } from '../../components/ui/field-row'
import { IconTile } from '../../components/ui/icon-tile'
import { ColumnsIcon, FlaskIcon } from '../../components/ui/icons'
import { List, ListLinkRow } from '../../components/ui/list'
import { Page } from '../../components/ui/page'
import { Sheet } from '../../components/ui/sheet'
import { SubmitButton } from '../../components/ui/submit-button'
import { useSubmit } from '../../components/ui/use-submit'
import { type BudgetWords, useBudgetWords } from './budget-words'
import { newestFirst, scenarioOf, tryScenario } from './scenario-math'
import { type Budget, useBudget } from './use-budget'

// BUD-38: the what-ifs saved for later, newest first, each with what it leaves over
// and does to the goals; two or three of them open side by side.

/** BUD-38: at most this many what-ifs side by side, so they fit a phone. */
const most = 3

type Saved = Budget['ledger']['scenarios'][number]

export function WhatIfsScreen() {
  const budget = useBudget()
  const back = useBack()
  if (!budget) return <Page title="" back={back} />
  return <SavedPage budget={budget} back={back} />
}

function SavedPage({ budget, back }: { budget: Budget; back: ReturnType<typeof useBack> }) {
  const words = useBudgetWords(budget.context.currency, budget.today)
  const { t } = words
  const navigate = useNavigate()
  const [picking, setPicking] = useState(false)
  const saved = newestFirst(budget.ledger.scenarios)

  return (
    <Page
      title={t('budget.saved.title')}
      back={back}
      card={{
        icon: <IconTile icon={ColumnsIcon} size="large" />,
        description: t('budget.saved.description'),
      }}
    >
      {saved.length === 0 ? (
        // DL-PAT-03: never a blank screen.
        <EmptyState
          icon={FlaskIcon}
          title={t('budget.saved.empty')}
          action={
            <Button
              className="mt-1 px-6"
              onClick={() => {
                void navigate({ to: '/budget/what-if' })
              }}
            >
              {t('budget.saved.emptyAction')}
            </Button>
          }
        >
          {t('budget.saved.emptyHint')}
        </EmptyState>
      ) : (
        <List>
          {saved.map((record) => (
            <ListLinkRow
              key={record.id}
              to="/budget/what-if"
              search={{ id: record.id }}
              leading={<IconTile icon={FlaskIcon} />}
              title={record.name}
              subtitle={summary(budget, record, words)}
            />
          ))}
        </List>
      )}
      {saved.length > 1 && (
        <Button
          variant="secondary"
          onClick={() => {
            setPicking(true)
          }}
        >
          {t('budget.saved.compare')}
        </Button>
      )}

      <Sheet
        open={picking}
        title={t('budget.saved.pickTitle')}
        cancelLabel={t('nav.cancel')}
        onClose={() => {
          setPicking(false)
        }}
      >
        {picking && (
          <PickForm
            saved={saved}
            onCompare={(ids) => {
              void navigate({ to: '/budget/compare', search: { ids } })
            }}
            onClose={() => {
              setPicking(false)
            }}
          />
        )}
      </Sheet>
    </Page>
  )
}

/** "Your plan · $2,500.00 left over · every goal funded". */
function summary(budget: Budget, record: Saved, words: BudgetWords) {
  const { t } = words
  const tried = tryScenario(budget, scenarioOf(record))
  const parts = [t('budget.saved.leftOver', { amount: words.text(tried.leftOver) })]
  if (tried.funding.need > 0)
    parts.push(
      tried.funding.gap > 0
        ? t('budget.saved.short', { amount: words.text(tried.funding.gap) })
        : t('budget.saved.funded'),
    )
  if (budget.ledger.plan?.scenarioId === record.id) parts.unshift(t('budget.saved.inUse'))
  return parts.join(' · ')
}

function PickForm({
  saved,
  onCompare,
  onClose,
}: {
  saved: readonly Saved[]
  onCompare: (ids: string[]) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const form = useSubmit()
  const [picked, setPicked] = useState<string[]>(() => saved.slice(0, 2).map((item) => item.id))
  const valid = picked.length >= 2
  return (
    <>
      <FieldNote>{t('budget.saved.pickHint')}</FieldNote>
      <List inset>
        {saved.map((record) => (
          <ChoiceRow
            key={record.id}
            title={record.name}
            checked={picked.includes(record.id)}
            onToggle={() => {
              // A fourth pick lets go of the first, so a tap always does something.
              setPicked(
                picked.includes(record.id)
                  ? picked.filter((id) => id !== record.id)
                  : [...picked, record.id].slice(-most),
              )
            }}
          />
        ))}
      </List>
      {form.tried && !valid && <FieldNote error>{t('budget.saved.pickMissing')}</FieldNote>}
      <SubmitButton
        button={form.button}
        done={form.done}
        pending={false}
        onClick={() => {
          form.submit(valid, () => {
            onClose()
            onCompare(picked)
          })
        }}
      >
        {t('budget.saved.compare')}
      </SubmitButton>
    </>
  )
}
