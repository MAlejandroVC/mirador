import { useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { sessionQuery } from '../../features/security'

// Settings is not a place, so it isn't a tab (DL-LAY-01). On phones and tablets it opens
// from a round button with the person's initial at the top right of each tab, as in the
// App Store; from 1024 px it sits at the bottom of the sidebar instead (DL-LAY-06).
export function AccountButton() {
  const { t } = useTranslation()
  const { data: session } = useSuspenseQuery(sessionQuery)
  const initial = session?.user.username.charAt(0).toUpperCase() ?? ''

  return (
    <Link
      to="/settings"
      aria-label={t('nav.settings')}
      // DL-A11Y-05: a 44 px target around a 32 px circle.
      className="grid size-11 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-brand lg:hidden"
    >
      <span
        aria-hidden
        className="grid size-8 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-brand)_14%,var(--color-surface))] text-[0.9375rem] font-semibold text-brand"
      >
        {initial}
      </span>
    </Link>
  )
}
