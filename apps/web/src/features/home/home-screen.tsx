import type { HomeCard } from '@repo/api'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AccountButton } from '../../components/shell'
import { useBack } from '../../components/shell/back'
import { Button } from '../../components/ui/button'
import { Page } from '../../components/ui/page'
import { useLocale } from '../../lib/format'
import { type BudgetWords, useBudgetWords } from '../budget/budget-words'
import { AttentionList } from './attention-list'
import { GoalsCard, HighlightsCard, LatestCard, WorthCard } from './cards'
import { ComingList } from './coming-list'
import { EditHomeSheet } from './edit-home-sheet'
import { GetStarted } from './get-started'
import { MonthCard } from './month-card'
import { type Home, useHome } from './use-home'

// Epic 7: Home answers what the person needs to know now: how this month is going,
// what needs them, what is coming, how their goals and net worth are doing, and what
// changed. Every card opens the screen that has it in full (DSH-08).

const cards: Record<HomeCard, (props: { home: Home; words: BudgetWords }) => ReactNode> = {
  attention: AttentionList,
  coming: ComingList,
  goals: GoalsCard,
  netWorth: WorthCard,
  highlights: HighlightsCard,
  latest: LatestCard,
}

export function HomeScreen() {
  const { t } = useTranslation()
  const locale = useLocale()
  // DL-CMP-06: opened from another screen, a tab's page can pop back to it too.
  const back = useBack()
  const home = useHome()
  const [editing, setEditing] = useState(false)
  const today = home?.budget.today
  // DL-CMP-06: today's date over the title, as in Apple's Fitness and News.
  const date =
    today &&
    new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${today}T00:00:00Z`))

  return (
    <Page
      title={t('nav.home')}
      back={back}
      actions={<AccountButton />}
      wide
      {...(date ? { date } : {})}
    >
      {home && (
        <HomeCards
          home={home}
          onEdit={() => {
            setEditing(true)
          }}
        />
      )}
      <EditHomeSheet
        open={editing}
        onClose={() => {
          setEditing(false)
        }}
      />
    </Page>
  )
}

function HomeCards({ home, onEdit }: { home: Home; onEdit: () => void }) {
  const words = useBudgetWords(home.budget.context.currency, home.budget.today)
  // DL-LAY-06: one column on a phone; from 1024 px, two, filled down the first and
  // then the second, so the person's order still reads top to bottom.
  const place = 'lg:mb-3 lg:break-inside-avoid'
  return (
    <div className="flex flex-col gap-3 lg:block lg:columns-2 lg:gap-6">
      {/* DSH-01, DSH-02: this month always comes first. */}
      <div className={`flex flex-col gap-3 ${place}`}>
        <MonthCard home={home} words={words} />
      </div>
      {home.setup && (
        <div className={place}>
          <GetStarted home={home} words={words} />
        </div>
      )}
      {home.cards.map((card) => {
        const Card = cards[card]
        return (
          <div key={card} className={`empty:hidden ${place}`}>
            <Card home={home} words={words} />
          </div>
        )
      })}
      {/* DSH-10, DL-CMP-05: a plain action, set apart under the cards. */}
      <div className={`flex justify-center ${place}`}>
        <Button variant="ghost" onClick={onEdit}>
          {words.t('home.edit.title')}
        </Button>
      </div>
    </div>
  )
}
