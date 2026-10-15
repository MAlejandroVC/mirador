import { GearSixIcon, PlusIcon } from '../ui/icons'
import { Link, useMatchRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useQuickAdd } from '../../features/quick-add'
import { places, scrollToTop } from './places'
import { AppIcon } from '../ui/app-icon'

// DL-LAY-06: from 1024 px a sidebar on the left replaces the tab bar, with the same
// places in the same order and quick-add at its top as a filled New button.
export function Sidebar() {
  const { t } = useTranslation()
  const matchRoute = useMatchRoute()
  const quickAdd = useQuickAdd()
  const settingsCurrent = Boolean(matchRoute({ to: '/settings', fuzzy: true }))

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col gap-4 border-r-[0.5px] border-separator bg-surface px-3 pt-5 pb-4 lg:flex">
      <div className="flex items-center gap-2.5 px-2">
        <AppIcon className="size-8 rounded-lg" />
        <span className="text-[1.0625rem] font-semibold text-text">{t('app.name')}</span>
      </div>
      {/* DL-CMP-05: the screen's one filled button. */}
      <button
        type="button"
        onClick={quickAdd.open}
        className="flex min-h-11 items-center justify-center gap-1.5 rounded-[0.875rem] bg-brand px-4 text-[0.9375rem] font-semibold text-on-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <PlusIcon aria-hidden className="size-5" />
        {t('nav.new')}
      </button>
      <nav aria-label={t('nav.label')} className="flex flex-1 flex-col gap-0.5">
        {places.map(({ to, label, icon }) => {
          const current = Boolean(matchRoute({ to }))
          return <SidebarLink key={to} to={to} icon={icon} label={t(label)} current={current} />
        })}
      </nav>
      <SidebarLink
        to="/settings"
        icon={GearSixIcon}
        label={t('nav.settings')}
        current={settingsCurrent}
      />
    </aside>
  )
}

function SidebarLink({
  to,
  icon: Icon,
  label,
  current,
}: {
  to: string
  icon: (typeof places)[number]['icon']
  label: string
  current: boolean
}) {
  return (
    <Link
      to={to}
      aria-current={current ? 'page' : undefined}
      onClick={current ? scrollToTop : undefined}
      // Selected as in iPadOS: a tinted row with the brand color (DL-COL-03).
      className={`flex min-h-11 items-center gap-3 rounded-[0.625rem] px-3 text-[0.9375rem] focus-visible:outline-2 focus-visible:outline-brand ${
        current
          ? 'bg-[color-mix(in_srgb,var(--color-brand)_14%,var(--color-surface))] font-semibold text-brand'
          : 'text-text hover:bg-fill'
      }`}
    >
      <Icon
        aria-hidden
        weight={current ? 'fill' : 'regular'}
        className={`size-[1.375rem] ${current ? '' : 'text-text-muted'}`}
      />
      {label}
    </Link>
  )
}
