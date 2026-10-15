import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { IconTile } from '../../../components/ui/icon-tile'
import {
  LockSimpleIcon,
  PaletteIcon,
  ShieldCheckIcon,
  SignOutIcon,
  UserPlusIcon,
} from '../../../components/ui/icons'
import { List, ListButtonRow, ListLinkRow } from '../../../components/ui/list'
import { Page } from '../../../components/ui/page'
import { ProfilePicture, useProfilePicture } from '../../../features/profile'
import { sessionQuery, useVault } from '../../../features/security'
import { api } from '../../../lib/api'
import { AppIcon } from '../../../components/ui/app-icon'

export const Route = createFileRoute('/_app/settings/')({
  component: Settings,
})

// Epic 10: Settings opens with the account, then one row per area: Appearance
// (SYS-16, SYS-17), Password and security (SEC) and, for the person who runs the
// server, Invites (SYS-13). Areas such as currencies, budget defaults, categories and
// data join as they are built. Lock and Sign out close the list, as in iOS.
function Settings() {
  const { t } = useTranslation()
  const vault = useVault()
  const router = useRouter()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: session } = useSuspenseQuery(sessionQuery)
  const picture = useProfilePicture()
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
        <ListLinkRow
          to="/settings/account"
          leading={<ProfilePicture picture={picture} username={username} size={3.5} />}
          title={<span className="text-[1.0625rem] font-semibold">{username}</span>}
          subtitle={t('settings.account.summary')}
        />
      </List>
      <List>
        <ListLinkRow
          to="/settings/appearance"
          leading={<IconTile icon={PaletteIcon} />}
          title={t('settings.appearance.title')}
        />
        <ListLinkRow
          to="/settings/security"
          leading={<IconTile icon={ShieldCheckIcon} />}
          title={t('settings.security')}
        />
        {session?.user.operator && (
          <ListLinkRow
            to="/settings/invites"
            leading={<IconTile icon={UserPlusIcon} />}
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
      <footer className="flex flex-col items-center gap-1 px-4 pt-4 text-center">
        <AppIcon className="mb-1 size-12 rounded-xl" />
        <p className="text-[0.9375rem] font-semibold text-text">{t('app.name')}</p>
        <p className="text-[0.8125rem] text-text-muted">{t('app.tagline')}</p>
        <p className="pt-2 text-[0.8125rem] text-text-muted">{t('settings.encrypted')}</p>
        <p role="status" className="text-[0.8125rem] text-text-muted">
          {status}
        </p>
      </footer>
    </Page>
  )
}
