import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useBack } from '../../../components/shell/back'
import { IconTile } from '../../../components/ui/icon-tile'
import {
  CurrencyCircleDollarIcon,
  DatabaseIcon,
  FolderSimpleIcon,
  LockSimpleIcon,
  PaletteIcon,
  ShieldCheckIcon,
  SignOutIcon,
  TagIcon,
  TranslateIcon,
  UsersThreeIcon,
} from '../../../components/ui/icons'
import { List, ListButtonRow, ListLinkRow } from '../../../components/ui/list'
import { Page } from '../../../components/ui/page'
import { InstallRow } from '../../../features/install'
import { ProfilePicture, useProfilePicture } from '../../../features/profile'
import { sessionQuery, useVault } from '../../../features/security'
import { api } from '../../../lib/api'
import { nativeNames, readLanguageChoice } from '../../../lib/language'
import { AppIcon } from '../../../components/ui/app-icon'

export const Route = createFileRoute('/_app/settings/')({
  component: Settings,
})

// Epic 10: Settings opens with the account, then one row per area: Appearance
// (SYS-16, SYS-17), Language (SYS-19), Currency (SYS-01), Categories and Tags (Epic 4),
// Your data (Epic 9), Password and security (SEC) and, for the person who runs the server, People (SYS-13,
// SYS-21, SYS-22).
// Areas such as budget defaults and data join as they are built. Add to Home Screen follows until Mirador runs from there
// (SYS-20). Lock and Sign out close the list, as in iOS.
function Settings() {
  const { t } = useTranslation()
  const vault = useVault()
  const navigate = useNavigate()
  const back = useBack(t('nav.back'), { to: '/' })
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
  const language = readLanguageChoice()

  return (
    <Page
      title={t('nav.settings')}
      // DL-CMP-06: back to wherever Settings was opened from, or Home after a reload.
      back={{ ...back, hideWithSidebar: true }}
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
          to="/settings/language"
          leading={<IconTile icon={TranslateIcon} />}
          title={t('settings.language.title')}
          trailing={
            <span className="text-[0.9375rem] text-text-muted">
              {language === 'automatic' ? t('settings.language.automatic') : nativeNames[language]}
            </span>
          }
        />
        <ListLinkRow
          to="/settings/currency"
          leading={<IconTile icon={CurrencyCircleDollarIcon} />}
          title={t('settings.currency.title')}
        />
        <ListLinkRow
          to="/settings/categories"
          leading={<IconTile icon={FolderSimpleIcon} />}
          title={t('categories.title')}
        />
        <ListLinkRow
          to="/settings/tags"
          leading={<IconTile icon={TagIcon} />}
          title={t('tags.title')}
        />
        <ListLinkRow
          to="/settings/data"
          leading={<IconTile icon={DatabaseIcon} />}
          title={t('data.title')}
        />
        <ListLinkRow
          to="/settings/security"
          leading={<IconTile icon={ShieldCheckIcon} />}
          title={t('settings.security')}
        />
        {session?.user.operator && (
          <ListLinkRow
            to="/settings/people"
            leading={<IconTile icon={UsersThreeIcon} />}
            title={t('people.title')}
          />
        )}
      </List>
      <InstallRow />
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
