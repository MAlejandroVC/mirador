import { PlusIcon } from '../ui/icons'
import { Link, useMatchRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useQuickAdd } from '../../features/quick-add'
import { places, scrollToTop } from './places'

// DL-LAY-01, DL-LAY-02: on phones and tablets, a floating tab bar at the bottom with the
// round quick-add button beside it, on the thumb's side. Hidden from 1024 px, where the
// sidebar takes over (DL-LAY-06).
export function TabBar() {
  const { t } = useTranslation()
  const matchRoute = useMatchRoute()
  const quickAdd = useQuickAdd()

  return (
    <div className="fixed inset-x-3 bottom-[max(0.75rem,calc(env(safe-area-inset-bottom)-0.75rem))] z-20 mx-auto flex max-w-[30rem] items-center gap-2.5 lg:hidden">
      {/* DL-SHP-02, DL-SHP-03: fully rounded, solid surface, a hairline outline. */}
      <nav
        aria-label={t('nav.label')}
        className="flex h-[3.375rem] flex-1 items-center justify-around rounded-full border-[0.5px] border-separator bg-surface"
      >
        {places.map(({ to, label, icon: Icon }) => {
          // A wallet's own screen still belongs to Wallets.
          const current = Boolean(matchRoute({ to, fuzzy: to !== '/' }))
          return (
            <Link
              key={to}
              to={to}
              state={{ root: true }}
              aria-current={current ? 'page' : undefined}
              onClick={current ? scrollToTop : undefined}
              // DL-A11Y-05: each tab is a full-height target, well over 44 px.
              className={`flex h-full min-w-11 flex-1 flex-col items-center justify-center gap-px rounded-full focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-brand ${
                current ? 'text-brand' : 'text-text-muted'
              }`}
            >
              {/* DL-ICO-03, DL-ICO-04: 23 px, Fill for the selected tab, Regular for the rest. */}
              <Icon
                aria-hidden
                weight={current ? 'fill' : 'regular'}
                className="size-[1.4375rem]"
              />
              {/* DL-TYP-03: tab label, 10 px medium. */}
              <span className="text-[0.625rem] leading-tight font-medium">{t(label)}</span>
            </Link>
          )
        })}
      </nav>
      {/* DL-CMP-04: a 54 px brand circle with a plus, lifted by a soft shadow. */}
      <button
        type="button"
        aria-label={t('quickAdd.title')}
        onClick={quickAdd.open}
        className="grid size-[3.375rem] shrink-0 place-items-center rounded-full bg-brand text-on-brand shadow-[0_4px_14px_rgb(0_0_0/18%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <PlusIcon aria-hidden className="size-[1.625rem]" />
      </button>
    </div>
  )
}
