import { budgeted } from '@repo/core'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AccountButton } from '../../components/shell'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { ChartPieSliceIcon, FunnelIcon } from '../../components/ui/icons'
import { viewOf } from '../budget/month-view'
import { PlanView } from '../budget/plan-view'
import { type Budget, monthOf, periodOf, planFor, useBudget } from '../budget/use-budget'
import { Page } from '../../components/ui/page'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { ToolbarButton } from '../../components/ui/toolbar-button'
import { useQuickAdd } from '../quick-add'
import { FilterSheet } from '../transactions/filter-sheet'
import { analysisFilters, setAnalysisState } from './analysis-state'
import { PeriodHeader } from './period-header'
import { SpendingView } from './spending-view'
import { type Analysis, useAnalysis } from './use-analysis'
import { useWords } from './use-words'
import { useBack } from '../../components/shell/back'

export interface BudgetSearch {
  view?: 'spending'
  /** BUD-57, BUD-70: the month Plan shows, by its first day; this month when left out. */
  month?: string
  /** BUD-72: that month's budget open for editing. */
  edit?: true
  /** BUD-35: Find money open on that month. */
  find?: true
}

// Epic 5 and Epic 6 share the Budget tab, as two sides of one coin: Plan, the budget
// and its goals (BUD), and Spending, what the money did (ANA). A segmented control
// switches between them (DL-CMP-11), and the choice is kept in the address so going
// back returns to the same side. Budget opens on Plan (Alejandro's call, 2026-10-20).
export function BudgetScreen({ search }: { search: BudgetSearch }) {
  const view = search.view === 'spending' ? 'spending' : 'plan'
  const { t } = useTranslation()
  // DL-CMP-06: opened from another screen, a tab's page can pop back to it too.
  const back = useBack()
  const navigate = useNavigate()
  const analysis = useAnalysis()
  const budget = useBudget()
  const [filtering, setFiltering] = useState(false)
  const filters = analysis ? analysisFilters(analysis.state.filter) : 0
  const month = budget ? viewOf(budget, search) : null
  // BUD-72: a month with a budget, this one or one ahead, opens again with Edit, as a
  // list does in iOS; Done closes it, each amount already saved.
  const editing = view === 'plan' && month?.mode === 'edit'
  const editable = view === 'plan' && (month?.mode === 'track' || month?.mode === 'ahead')
  const setEditing = (edit: boolean) => {
    void navigate({
      to: '/budget',
      search: {
        ...(month && budget && month.start !== budget.view.period.start
          ? { month: month.start }
          : {}),
        ...(edit ? { edit: true as const } : {}),
      },
      replace: true,
    })
  }

  const actions = (
    <>
      {(editing || editable) && (
        <button
          type="button"
          onClick={() => {
            setEditing(!editing)
          }}
          className={`min-h-11 rounded-xl px-2 text-[1.0625rem] text-brand focus-visible:outline-2 focus-visible:outline-brand ${editing ? 'font-semibold' : ''}`}
        >
          {editing ? t('nav.done') : t('budget.edit')}
        </button>
      )}
      {view === 'spending' && analysis && (
        <ToolbarButton
          icon={FunnelIcon}
          label={filters > 0 ? t('filters.titleCount', { count: filters }) : t('filters.title')}
          active={filters > 0}
          onClick={() => {
            setFiltering(true)
          }}
        />
      )}
      <AccountButton />
    </>
  )

  return (
    <Page title={t('nav.budget')} back={back} actions={actions}>
      <SegmentedControl
        label={t('analysis.sides.label')}
        options={[
          { value: 'plan', label: t('analysis.sides.plan') },
          { value: 'spending', label: t('analysis.sides.spending') },
        ]}
        value={view}
        onChange={(side) => {
          void navigate({
            to: '/budget',
            search: side === 'spending' ? { view: 'spending' } : {},
            replace: true,
          })
        }}
      />
      {view === 'plan'
        ? budget && month && <PlanView budget={budget} view={month} find={search.find === true} />
        : analysis && <Spending analysis={analysis} budget={budget} filters={filters} />}
      {analysis && (
        <>
          <FilterSheet
            analysis
            open={filtering}
            ledger={analysis.ledger}
            value={analysis.state.filter}
            onChange={(filter) => {
              setAnalysisState({ filter })
            }}
            onClose={() => {
              setFiltering(false)
            }}
          />
        </>
      )}
    </Page>
  )
}

function Spending({
  analysis,
  budget,
  filters,
}: {
  analysis: Analysis
  budget: Budget | null
  filters: number
}) {
  const { t } = useTranslation()
  const quickAdd = useQuickAdd()
  const words = useWords(analysis.context.currency, analysis.today)
  // BUD-41, BUD-42: a month with a budget shows the budget's pace on its chart too; not
  // with filters on, since the budget counts the whole month.
  const start = analysis.view.scope === 'month' ? analysis.view.period.start : null
  const target = useMemo(() => {
    if (!budget || start === null || filters > 0) return null
    if (!budgeted(monthOf(budget, start))) return null
    return planFor(budget, periodOf(budget, start)).target
  }, [budget, start, filters])

  if (analysis.all.length === 0)
    return (
      // DL-CMP-14: what will appear here, and the button that starts it.
      <EmptyState
        icon={ChartPieSliceIcon}
        title={t('analysis.empty.title')}
        action={
          <Button className="mt-1 px-6" onClick={quickAdd.open}>
            {t('transactions.empty.action')}
          </Button>
        }
      >
        {t('analysis.empty.body')}
      </EmptyState>
    )

  return (
    <>
      <PeriodHeader analysis={analysis} />
      <SpendingView analysis={analysis} words={words} budget={target} />
    </>
  )
}
