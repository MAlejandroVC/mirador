import { useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ProfilePicture, useProfilePicture } from '../../features/profile'
import { sessionQuery } from '../../features/security'

// Settings is not a place, so it isn't a tab (DL-LAY-01). On phones and tablets it opens
// from the profile picture beside each tab's large title, as in the App Store
// (DL-CMP-06); from 1024 px it sits at the bottom of the sidebar instead (DL-LAY-06).
export function AccountButton() {
  const { t } = useTranslation()
  const { data: session } = useSuspenseQuery(sessionQuery)
  const picture = useProfilePicture()

  return (
    <Link
      to="/settings"
      aria-label={t('nav.settings')}
      // DL-A11Y-05: the 40 px picture is the whole 44 px target.
      className="grid size-11 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-brand lg:hidden"
    >
      <ProfilePicture picture={picture} username={session?.user.username ?? ''} size={2.5} />
    </Link>
  )
}
