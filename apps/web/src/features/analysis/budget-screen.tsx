import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AccountButton } from '../../components/shell'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { ChartPieSliceIcon, FunnelIcon } from '../../components/ui/icons'
import { PlanView } from '../budget/plan-view'
import { useBudget } from '../budget/use-budget'
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

// Epic 5 and Epic 6 share the Budget tab, as two sides of one coin: Plan, the budget
// and its goals (BUD), and Spending, what the money did (ANA). A segmented control
// switches between them (DL-CMP-11), and the choice is kept in the address so going
// back returns to the same side. Budget opens on Plan (Alejandro's call, 2026-10-20).
export function BudgetScreen({ view }: { view: 'plan' | 'spending' }) {
  const { t } = useTranslation()
  // DL-CMP-06: opened from another screen, a tab's page can pop back to it too.
  const back = useBack()
  const navigate = useNavigate()
  const analysis = useAnalysis()
  const budget = useBudget()
  const [filtering, setFiltering] = useState(false)
  const filters = analysis ? analysisFilters(analysis.state.filter) : 0

  const actions = (
    <>
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
        ? budget && <PlanView budget={budget} />
        : analysis && <Spending analysis={analysis} />}
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

function Spending({ analysis }: { analysis: Analysis }) {
  const { t } = useTranslation()
  const quickAdd = useQuickAdd()
  const words = useWords(analysis.context.currency, analysis.today)

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
      <SpendingView analysis={analysis} words={words} />
    </>
  )
}
