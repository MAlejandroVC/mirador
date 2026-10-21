import { Link } from '@tanstack/react-router'
import { HeroCard } from '../../components/ui/hero-card'
import type { BudgetWords } from '../budget/budget-words'
import { Over } from '../budget/parts'
import { sentence } from './text'
import type { Home } from './use-home'

const linkClass =
  'block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

/**
 * DSH-01, DSH-02: this month in one glance: the hero says what is left to spend and
 * what that makes a day, the card under it what came in, what went out and what is
 * left over, then how the month is heading against its budget. Both open Budget
 * (DSH-08). A month without a budget yet compares its spending with the usual month.
 */
export function MonthCard({ home, words }: { home: Home; words: BudgetWords }) {
  const { t } = words
  const { budget, glance } = home
  const { month } = budget
  const name = words.monthName(month.period)
  const leftOver = month.earned - month.spent

  return (
    <>
      <Link to="/budget" className={linkClass}>
        {glance ? (
          <HeroCard
            label={
              glance.left < 0
                ? t('budget.hero.over', { month: name })
                : t('budget.hero.left', { month: name })
            }
            amount={words.hero(Math.abs(glance.left))}
            context={[
              t('budget.hero.days', { count: glance.daysLeft }),
              ...(glance.perDay === null
                ? []
                : [t('home.month.perDay', { amount: words.text(glance.perDay) })]),
            ].join(' · ')}
          />
        ) : (
          <HeroCard
            label={t('home.month.spent', { month: name })}
            amount={words.hero(home.usual.current)}
            context={usualLine(home, words)}
          />
        )}
      </Link>

      <Link to="/budget" className={`${linkClass} bg-surface`}>
        <dl className="grid grid-cols-3 gap-2 px-4 pt-3.5 pb-3">
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-text-muted">{t('home.month.income')}</dt>
            <dd>{words.amount(month.earned, 'moss')}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-text-muted">{t('home.month.spentShort')}</dt>
            <dd>{words.amount(month.spent)}</dd>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <dt className="text-xs text-text-muted">{t('home.month.leftOver')}</dt>
            <dd>{words.amount(leftOver)}</dd>
          </div>
        </dl>
        {glance && (
          <div className="flex flex-col gap-2 px-4 pb-3.5">
            {/* DL-VIZ-01: progress is a bar and a sentence. The mark is where an even
                pace through the month would be today, as the budget's straight line
                (BUD-78). */}
            <div className="relative pt-4" aria-hidden>
              <span
                className="absolute top-0 -translate-x-1/2 text-[0.6875rem] text-text-muted"
                style={{ left: `${String(glance.todayShare * 100)}%` }}
              >
                {t('home.month.today')}
              </span>
              <span className="block h-2 overflow-hidden rounded-full bg-fill">
                <span
                  className="block h-full rounded-full bg-[color-mix(in_srgb,var(--color-brand)_var(--mirador-bar-mix),var(--color-surface))]"
                  style={{ width: `${String(Math.min(1, glance.spentShare) * 100)}%` }}
                />
              </span>
              <span
                className="absolute top-[0.8125rem] h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-text"
                style={{ left: `${String(glance.todayShare * 100)}%` }}
              />
            </div>
            <p className="text-[0.8125rem] text-text-muted">
              {t('home.month.of', {
                spent: words.text(month.spent),
                target: words.text(month.target),
              })}{' '}
              {glance.finish >= 0
                ? t('home.month.under', { amount: words.text(glance.finish) })
                : // BUD-42: "At this pace, $480 over by Oct 31."
                  sentence((values) => t('home.month.pace', values), {
                    amount: (
                      <Over>{t('budget.lines.over', { amount: words.text(-glance.finish) })}</Over>
                    ),
                    date: words.day(month.period.end),
                  })}
            </p>
          </div>
        )}
      </Link>
    </>
  )
}

/** ANA-12: "About the same as usual by Oct 20", for a month without a budget. */
function usualLine(home: Home, words: BudgetWords) {
  const { t } = words
  const { current, usual } = home.usual
  if (usual === null) return t('analysis.hero.noHistory')
  const versus = words.versusUsual(current, usual)
  const date = words.date(home.budget.today)
  if (versus?.text === t('analysis.usual.same') || current === usual)
    return t('analysis.hero.sameSoFar', { date })
  return t(`analysis.hero.${current < usual ? 'less' : 'more'}SoFar`, {
    amount: words.text(Math.abs(current - usual)),
    date,
  })
}
