import type { Invite } from '@repo/api'
import { inviteLifetimeDays } from '@repo/api'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { IconTile } from '../../../components/ui/icon-tile'
import { UserPlusIcon } from '../../../components/ui/icons'
import { List } from '../../../components/ui/list'
import { Page } from '../../../components/ui/page'
import { Section } from './security-screen'
import { useSettingsBack } from '../../../components/shell/settings-back'
import { api } from '../../../lib/api'
import { inviteLink, invitesQuery } from '../hooks/invites'

// SYS-13: anyone with the app's address can't just sign up; the operator makes an
// invite and sends its link to the person. Mirador sends no messages itself (NFR-05).
export function InvitesScreen() {
  const { t } = useTranslation()
  const settingsBack = useSettingsBack()
  const queryClient = useQueryClient()
  const { data: invites } = useSuspenseQuery(invitesQuery)
  // Whether an invite is still waiting, as of opening the screen.
  const [now] = useState(() => Date.now())

  const create = useMutation({
    mutationFn: () => api.createInvite(),
    onSuccess: () => queryClient.invalidateQueries(invitesQuery),
  })

  return (
    <Page
      title={t('security.invites.title')}
      back={settingsBack}
      card={{
        icon: <IconTile icon={UserPlusIcon} size="large" />,
        description: t('security.invites.description'),
      }}
    >
      {create.data ? (
        <NewInvite code={create.data.code} />
      ) : (
        // DL-LAY-05: the same section cards as Password and security.
        <Section
          title={t('security.invites.newSection')}
          intro={t('security.invites.intro', { count: inviteLifetimeDays })}
        >
          <Button
            disabled={create.isPending}
            onClick={() => {
              create.mutate()
            }}
          >
            {create.isPending ? t('security.invites.working') : t('security.invites.create')}
          </Button>
          {create.isError && <Alert>{t('security.errors.unknown')}</Alert>}
        </Section>
      )}
      {/* DL-CMP-07: the invites are rows in an inset list. */}
      <List label={t('security.invites.listTitle')}>
        {invites.length === 0 ? (
          <li className="flex min-h-[3.25rem] items-center px-4 text-[0.9375rem] text-text-muted">
            {t('security.invites.none')}
          </li>
        ) : (
          invites.map((invite) => <InviteRow key={invite.id} invite={invite} now={now} />)
        )}
      </List>
    </Page>
  )
}

// Shown once: the server keeps only a hash of the code.
function NewInvite({ code }: { code: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const link = inviteLink(code)
  const canShare = typeof navigator.share === 'function'

  return (
    <section
      aria-label={t('security.invites.newTitle')}
      className="flex flex-col gap-4 rounded-2xl bg-surface px-4 py-3.5"
    >
      <h2 className="text-[1.0625rem] font-semibold text-text">{t('security.invites.newTitle')}</h2>
      <p className="rounded-xl bg-inset p-3 font-mono text-sm break-all text-text select-all">
        {link}
      </p>
      <div className={`grid gap-3 ${canShare ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <Button
          variant="secondary"
          onClick={() => {
            void navigator.clipboard.writeText(link).then(() => {
              setCopied(true)
            })
          }}
        >
          <span aria-live="polite">
            {copied ? t('security.recoveryKey.copied') : t('security.recoveryKey.copy')}
          </span>
        </Button>
        {canShare && (
          <Button
            variant="secondary"
            onClick={() => {
              void navigator
                .share({ title: t('app.name'), text: t('security.invites.shareText'), url: link })
                .catch(() => undefined)
            }}
          >
            {t('security.invites.share')}
          </Button>
        )}
      </div>
      <Alert tone="warning">{t('security.invites.shownOnce')}</Alert>
    </section>
  )
}

function InviteRow({ invite, now }: { invite: Invite; now: number }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const withdraw = useMutation({
    mutationFn: () => api.withdrawInvite(invite.id),
    onSettled: () => queryClient.invalidateQueries(invitesQuery),
  })
  const date = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(iso))
  const waiting = !invite.usedAt && Date.parse(invite.expiresAt) > now

  let status: string
  if (invite.usedAt) {
    status = invite.usedBy
      ? t('security.invites.usedBy', { username: invite.usedBy, date: date(invite.usedAt) })
      : t('security.invites.used', { date: date(invite.usedAt) })
  } else if (waiting) {
    status = t('security.invites.waiting', { date: date(invite.expiresAt) })
  } else {
    status = t('security.invites.expired', { date: date(invite.expiresAt) })
  }

  return (
    <li className="flex min-h-14 items-center justify-between gap-3 border-t-[0.5px] border-separator px-4 py-2 first:border-t-0">
      <div className="flex flex-col">
        <span className="text-[0.9375rem] text-text">{status}</span>
        <span className="text-[0.8125rem] text-text-muted">
          {t('security.invites.made', { date: date(invite.createdAt) })}
        </span>
      </div>
      {waiting && (
        <Button
          variant="ghost"
          disabled={withdraw.isPending}
          onClick={() => {
            withdraw.mutate()
          }}
        >
          {t('security.invites.withdraw')}
        </Button>
      )}
    </li>
  )
}
