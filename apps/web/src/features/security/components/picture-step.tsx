import type { ProfilePicture } from '@repo/api'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { PicturePicker, useSaveProfilePicture } from '../../profile'
import { AuthLayout } from './auth-layout'

// SYS-18: the last step of sign-up. The initial is already chosen, so Continue works
// without picking anything; the choice can change any time in Settings > Account.
export function PictureStep({
  username,
  onDone,
}: {
  username: string
  onDone: () => Promise<void>
}) {
  const { t } = useTranslation()
  const [picture, setPicture] = useState<ProfilePicture>('initial')
  const save = useSaveProfilePicture()

  async function finish() {
    // The initial needs no record: it is what an account without one shows.
    if (picture !== 'initial') await save.mutateAsync(picture)
    await onDone()
  }

  return (
    <AuthLayout title={t('profile.signUp.title')} intro={t('profile.signUp.intro')}>
      <PicturePicker value={picture} username={username} onChange={setPicture} />
      {save.isError && <Alert>{t('security.errors.unknown')}</Alert>}
      <Button
        disabled={save.isPending}
        onClick={() => {
          void finish().catch(() => undefined)
        }}
      >
        {t('profile.signUp.continue')}
      </Button>
    </AuthLayout>
  )
}
