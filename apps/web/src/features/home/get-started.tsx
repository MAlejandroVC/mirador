import type { LinkProps } from '@tanstack/react-router'
import { CheckCircleIcon, CircleIcon } from '../../components/ui/icons'
import { ListLinkRow, ListRow } from '../../components/ui/list'
import type { BudgetWords } from '../budget/budget-words'
import { ProgressBar } from '../budget/parts'
import type { Home, SetupStep } from './use-home'

/** DSH-08: where each step is done. */
const places: Record<SetupStep, LinkProps['to']> = {
  wallets: '/wallets',
  history: '/settings/data',
  categories: '/settings/needs-and-wants',
  budget: '/budget',
  goal: '/budget',
}

/**
 * DSH-09: until setup is done, Home opens with its steps, each opening the screen
 * where it is done, and how many are done as a bar in `brand`, the app's own color
 * (DL-COL-13). A step done stays, checked, so the list doesn't jump.
 */
export function GetStarted({ home, words }: { home: Home; words: BudgetWords }) {
  const { t } = words
  if (!home.setup) return null
  const done = home.setup.filter((item) => item.done).length
  const wallets = home.budget.ledger.wallets.length
  return (
    <section
      aria-labelledby="get-started"
      className="flex flex-col overflow-hidden rounded-2xl bg-surface"
    >
      <div className="flex flex-col gap-2 border-b-[0.5px] border-separator px-4 pt-3.5 pb-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="get-started" className="text-[1.0625rem] font-semibold text-text">
            {t('home.setup.title')}
          </h2>
          <span className="text-[0.8125rem] text-text-muted tabular-nums">
            {t('home.setup.count', { done, count: home.setup.length })}
          </span>
        </div>
        <ProgressBar value={done / home.setup.length} color="brand" />
      </div>
      <ul>
        {home.setup.map(({ step, done: finished }) =>
          finished ? (
            <ListRow
              key={step}
              leading={
                <span className="grid w-[2.125rem] shrink-0 place-items-center">
                  <CheckCircleIcon aria-hidden weight="fill" className="size-6 text-brand" />
                </span>
              }
              title={<span className="text-text-muted">{t(`home.setup.${step}.title`)}</span>}
              subtitle={
                step === 'wallets'
                  ? t('home.setup.wallets.done', { count: wallets })
                  : t('home.setup.done')
              }
            />
          ) : (
            <ListLinkRow
              key={step}
              to={places[step]}
              leading={
                <span className="grid w-[2.125rem] shrink-0 place-items-center">
                  <CircleIcon aria-hidden className="size-6 text-text-faint" />
                </span>
              }
              title={t(`home.setup.${step}.title`)}
              subtitle={t(`home.setup.${step}.body`)}
            />
          ),
        )}
      </ul>
    </section>
  )
}
