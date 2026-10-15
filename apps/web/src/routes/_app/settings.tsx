import {
  LockSimpleIcon,
  ShieldCheckIcon,
  SignOutIcon,
  UserPlusIcon,
} from '../../components/ui/icons'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { IconTile } from '../../components/ui/icon-tile'
import { List, ListButtonRow, ListLinkRow, ListRow } from '../../components/ui/list'
import { Page } from '../../components/ui/page'
import { sessionQuery, useVault } from '../../features/security'
import { api } from '../../lib/api'

export const Route = createFileRoute('/_app/settings')({
  component: Settings,
})

// Epic 10: Settings gathers what used to sit on Home (the account, security, invites,
// lock and sign out). Appearance (SYS-16, SYS-17), language and the rest of the SYS
// settings join it as they are built.
function Settings() {
  const { t } = useTranslation()
  const vault = useVault()
  const router = useRouter()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: session } = useSuspenseQuery(sessionQuery)
  const health = useQuery({ queryKey: ['health'], queryFn: () => api.health(), retry: false })

  const lock = useMutation({
    mutationFn: () => vault.lock(),
    onSuccess: () => navigate({ to: '/unlock' }),
  })
  const signOut = useMutation({
    mutationFn: () => vault.signOut(),
    onSettled: async () => {
      queryClient.removeQueries(sessionQuery)
      await navigate({ to: '/sign-in' })
    },
  })

  const status = health.isPending
    ? t('health.checking')
    : health.isSuccess
      ? t('health.ok')
      : t('health.unreachable')
  const username = session?.user.username ?? ''

  return (
    <Page
      title={t('nav.settings')}
      back={{
        label: t('nav.back'),
        // DL-CMP-06: back to wherever Settings was opened from, or Home after a reload.
        onClick: () => {
          if (router.history.canGoBack()) router.history.back()
          else void navigate({ to: '/' })
        },
        hideWithSidebar: true,
      }}
    >
      <List>
        <ListRow
          leading={
            <span
              aria-hidden
              className="grid size-11 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-brand)_14%,var(--color-surface))] text-[1.0625rem] font-semibold text-brand"
            >
              {username.charAt(0).toUpperCase()}
            </span>
          }
          title={t('settings.signedInAs', { username })}
          subtitle={t('settings.encrypted')}
        />
      </List>
      <List>
        <ListLinkRow
          to="/security"
          leading={<IconTile icon={ShieldCheckIcon} color="lagoon" />}
          title={t('settings.security')}
        />
        {session?.user.operator && (
          <ListLinkRow
            to="/invites"
            leading={<IconTile icon={UserPlusIcon} color="lake" />}
            title={t('settings.invites')}
          />
        )}
      </List>
      <List>
        <ListButtonRow
          leading={<LockSimpleIcon aria-hidden className="size-[1.375rem] text-brand" />}
          title={t('settings.lock')}
          onClick={() => {
            lock.mutate()
          }}
        />
        <ListButtonRow
          leading={<SignOutIcon aria-hidden className="size-[1.375rem] text-brand" />}
          title={t('settings.signOut')}
          disabled={signOut.isPending}
          onClick={() => {
            signOut.mutate()
          }}
        />
      </List>
      {/* DL-VOC-07: where Mirador introduces itself, the slogan sits under its name. */}
      <footer className="flex flex-col items-center gap-1 pt-4 text-center">
        <img src="/favicon.svg" alt="" className="mb-1 size-12 rounded-xl" />
        <p className="text-[0.9375rem] font-semibold text-text">{t('app.name')}</p>
        <p className="text-[0.8125rem] text-text-muted">{t('app.tagline')}</p>
        <p role="status" className="text-[0.8125rem] text-text-muted">
          {status}
        </p>
      </footer>
    </Page>
  )
}
