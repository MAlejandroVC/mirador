import { toCalendarDate } from '@repo/core'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Alert } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { ArrowSquareOutIcon, DownloadSimpleIcon } from '../../../components/ui/icons'
import { AuthLayout } from '../components/auth-layout'
import { sessionQuery } from '../hooks/session'
import { useVault } from '../hooks/vault'
import { exportFile, exportFileName, saveFile } from '../lib/export'

// Where anyone can get Mirador to run their own server (SYS-23).
export const repositoryUrl = 'https://github.com/MAlejandroVC/mirador'

// SYS-23: the operator removed this account. All it can still do is download its data,
// decrypted here on the device, until the server deletes it; and find out how to run
// its own Mirador.
export function RemovedScreen() {
  const { t, i18n } = useTranslation()
  const vault = useVault()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: session } = useSuspenseQuery(sessionQuery)
  const username = session?.user.username ?? ''
  const deletesAt = session?.user.removed?.deletesAt
  const date = deletesAt
    ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(new Date(deletesAt))
    : ''

  const download = useMutation({
    mutationFn: async () => {
      const now = new Date()
      saveFile(
        exportFile(await vault.listRecords(), username, now),
        exportFileName(username, toCalendarDate(now)),
      )
    },
  })

  const signOut = useMutation({
    mutationFn: () => vault.signOut(),
    onSettled: async () => {
      queryClient.removeQueries(sessionQuery)
      await navigate({ to: '/sign-in' })
    },
  })

  return (
    <AuthLayout title={t('removed.title')} intro={t('removed.intro')}>
      <section className="flex flex-col gap-3">
        <h2 className="text-[1.0625rem] font-semibold text-text">{t('removed.dataTitle')}</h2>
        <p className="text-[0.9375rem] text-text-muted">{t('removed.dataBody', { date })}</p>
        <Button
          disabled={download.isPending}
          onClick={() => {
            download.mutate()
          }}
        >
          <DownloadSimpleIcon aria-hidden weight="bold" className="mr-2 size-5" />
          {download.isPending ? t('removed.downloading') : t('removed.download')}
        </Button>
        {download.isSuccess && (
          <p role="status" className="text-[0.8125rem] text-text-muted">
            {t('removed.downloaded')}
          </p>
        )}
        {download.isError && <Alert>{t('security.errors.unknown')}</Alert>}
      </section>
      <section className="flex flex-col gap-3 border-t-[0.5px] border-separator pt-5">
        <h2 className="text-[1.0625rem] font-semibold text-text">{t('removed.ownTitle')}</h2>
        <p className="text-[0.9375rem] text-text-muted">{t('removed.ownBody')}</p>
        <a
          href={repositoryUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-[3.125rem] items-center justify-center rounded-[0.875rem] bg-[color-mix(in_srgb,var(--color-brand)_14%,var(--color-surface))] px-4 text-[1.0625rem] font-semibold text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {t('removed.own')}
          <ArrowSquareOutIcon aria-hidden className="ml-2 size-5" />
        </a>
      </section>
      <Button
        variant="ghost"
        disabled={signOut.isPending}
        onClick={() => {
          signOut.mutate()
        }}
      >
        {t('settings.signOut')}
      </Button>
    </AuthLayout>
  )
}
