import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useSettingsBack } from '../../../components/shell/settings-back'
import { Page } from '../../../components/ui/page'
import {
  PicturePicker,
  ProfilePicture,
  useProfilePicture,
  useSaveProfilePicture,
} from '../../../features/profile'
import { ChangeUsername, DeleteAccount, Section, sessionQuery } from '../../../features/security'
import { Alert } from '../../../components/ui/alert'

export const Route = createFileRoute('/_app/settings/account')({
  component: Account,
})

// Settings > Account: who you are here. The profile picture (SYS-18), the username
// and deleting the account (SYS-06).
function Account() {
  const { t } = useTranslation()
  const back = useSettingsBack()
  const { data: session } = useSuspenseQuery(sessionQuery)
  const username = session?.user.username ?? ''
  const picture = useProfilePicture()
  const save = useSaveProfilePicture()
  // Shown at once, before the save comes back, so the choice feels immediate (DL-CMP-10).
  const shown = save.isPending ? save.variables : picture

  return (
    <Page title={t('settings.account.title')} back={back}>
      <div className="flex flex-col items-center gap-2 pb-2">
        <ProfilePicture picture={shown} username={username} size={5.5} />
        <p className="text-[1.0625rem] font-semibold text-text">{username}</p>
      </div>
      <Section title={t('profile.picture')} intro={t('profile.pictureIntro')}>
        <PicturePicker
          value={shown}
          username={username}
          onChange={(next) => {
            save.mutate(next)
          }}
        />
        {save.isError && <Alert>{t('security.errors.unknown')}</Alert>}
      </Section>
      <ChangeUsername username={username} />
      <DeleteAccount username={username} operator={session?.user.operator ?? false} />
    </Page>
  )
}
