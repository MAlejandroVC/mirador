import {
  amountInput,
  type Flexibility,
  fractionDigits,
  parseAmount,
  pickableCategories,
} from '@repo/core'
import { useState } from 'react'
import { useBack } from '../../components/shell/back'
import { FieldNote, MoneyRow } from '../../components/ui/field-row'
import { IconTile } from '../../components/ui/icon-tile'
import { PencilIcon } from '../../components/ui/icons'
import { Page } from '../../components/ui/page'
import { useMoney } from '../../lib/format'
import { useSaveRecords } from '../wallets/use-ledger'
import { useBudgetWords } from './budget-words'
import { currentPlan, planChange } from './records'
import { type Budget, useBudget } from './use-budget'

// The bills known by heart first, then what moves from month to month.
const types: readonly Flexibility[] = ['locked', 'fixed', 'flexible']

// BUD-06: with less than a month of history, the person can enter about what a usual
// month brings in and costs, category by category, so the plan works from the first
// day. Each amount stands in only until its category has a month of its own.
export function UsualScreen() {
  const budget = useBudget()
  const back = useBack()
  if (!budget) return <Page title="" back={back} />
  return <UsualForm budget={budget} back={back} />
}

function UsualForm({ budget, back }: { budget: Budget; back: ReturnType<typeof useBack> }) {
  const currency = budget.context.currency
  const { t } = useBudgetWords(currency, budget.today)
  const money = useMoney(currency)
  const save = useSaveRecords()
  const plan = currentPlan(budget.ledger)
  const decimals = fractionDigits(currency)
  const text = (minor: number | undefined) =>
    minor === undefined || minor === 0 ? '' : amountInput(minor, currency, money.locale)
  const categories = pickableCategories(
    budget.ledger.categories,
    budget.ledger.groups,
    'expense',
  ).filter((category) => category.systemKey === undefined)
  const [income, setIncome] = useState(() => text(plan.income))
  const [amounts, setAmounts] = useState(
    () =>
      new Map(
        categories.map((category) => [
          category.id,
          text(plan.estimates?.find((item) => item.line === category.id)?.amount),
        ]),
      ),
  )

  const submit = () => {
    const estimates = [...amounts]
      .map(([line, value]) => ({ line, amount: parseAmount(value, currency, money.locale) ?? 0 }))
      .filter((item) => item.amount > 0)
    // Estimates for categories no longer offered, such as an archived one, stay as they were.
    const others = (plan.estimates ?? []).filter((item) => !amounts.has(item.line))
    const expected = parseAmount(income, currency, money.locale)
    save.mutate(
      [
        planChange(budget.ledger, {
          estimates: [...others, ...estimates],
          income: expected !== null && expected > 0 ? expected : undefined,
        }),
      ],
      { onSuccess: () => back?.onClick() },
    )
  }

  return (
    <Page
      title={t('budget.usual.title')}
      back={back}
      actions={
        <button
          type="button"
          onClick={submit}
          aria-disabled={save.isPending || undefined}
          className="min-h-11 rounded-xl px-2 text-[1.0625rem] font-semibold text-brand focus-visible:outline-2 focus-visible:outline-brand"
        >
          {t('budget.usual.save')}
        </button>
      }
      card={{
        icon: <IconTile icon={PencilIcon} size="large" />,
        description: t('budget.usual.description'),
      }}
    >
      {/* DL-LAY-05: on a page the fields sit on `surface`, not a sheet's `inset`. */}
      <div className="flex flex-col gap-1.5">
        <ul className="rounded-2xl bg-surface">
          <MoneyRow
            label={t('budget.usual.income')}
            value={income}
            onChange={setIncome}
            locale={money.locale}
            decimals={decimals}
          />
        </ul>
        <FieldNote>{t('budget.usual.incomeHint')}</FieldNote>
      </div>

      {/* BUD-10: Commitments, Needs and Wants, as the plan groups them. */}
      {types.map((type) => {
        const shown = categories.filter((category) => category.flexibility === type)
        if (shown.length === 0) return null
        return (
          <section key={type} className="flex flex-col gap-1.5">
            <h2 className="px-4 text-xs tracking-[0.04em] text-text-muted uppercase">
              {t(`categories.flexibility.${type}Plural`)}
            </h2>
            <ul className="rounded-2xl bg-surface">
              {shown.map((category) => (
                <MoneyRow
                  key={category.id}
                  label={category.name}
                  value={amounts.get(category.id) ?? ''}
                  onChange={(value) => {
                    setAmounts(new Map(amounts).set(category.id, value))
                  }}
                  locale={money.locale}
                  decimals={decimals}
                />
              ))}
            </ul>
          </section>
        )
      })}

      {save.isError ? (
        <FieldNote error>{t('wallets.saveFailed')}</FieldNote>
      ) : (
        <FieldNote>{t('budget.usual.hint')}</FieldNote>
      )}
    </Page>
  )
}
