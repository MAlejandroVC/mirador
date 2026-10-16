import {
  type Invite,
  inviteDefaultDays,
  inviteDefaultUses,
  inviteIsOpen,
  inviteMaxDays,
  type Person,
} from '@repo/api'
import { addDays, toCalendarDate } from '@repo/core'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActionSheet } from '../../../components/ui/action-sheet'
import { Alert } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { ChoiceRow } from '../../../components/ui/choice-row'
import { DateRow } from '../../../components/ui/date-field'
import { FieldNote, FieldRows } from '../../../components/ui/field-row'
import { IconTile } from '../../../components/ui/icon-tile'
import { LinkSimpleIcon, PlusIcon, UsersThreeIcon } from '../../../components/ui/icons'
import { List, ListButtonRow, ListRow } from '../../../components/ui/list'
import { Page } from '../../../components/ui/page'
import { PickerRow } from '../../../components/ui/picker-row'
import { Sheet, SheetFooter } from '../../../components/ui/sheet'
import { useSettingsBack } from '../../../components/shell/settings-back'
import { api } from '../../../lib/api'
import { ProfilePicture } from '../../profile'
import { endOfDay, inviteLink, invitesQuery, peopleQuery } from '../hooks/people'

// The choices for how many people a link signs up; null is no limit (SYS-21).
const useChoices = [1, 5, 10, 25, 50, 100, null] as const
type Uses = (typeof useChoices)[number]

function useDate() {
  const { i18n } = useTranslation()
  return (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(iso))
}

// SYS-13, SYS-21, SYS-22: only people the operator invites can create an account. Here
// the operator makes invite links, for one person or a whole group, and sees who has
// an account, removing anyone who shouldn't. Mirador sends no messages itself
// (NFR-05), so the operator shares each link.
export function PeopleScreen() {
  const { t } = useTranslation()
  const settingsBack = useSettingsBack()

  return (
    <Page
      title={t('people.title')}
      back={settingsBack}
      card={{
        icon: <IconTile icon={UsersThreeIcon} size="large" />,
        description: t('people.description'),
      }}
    >
      <InviteLinks />
      <People />
    </Page>
  )
}

function InviteLinks() {
  const { t } = useTranslation()
  const { data: invites } = useSuspenseQuery(invitesQuery)
  const [making, setMaking] = useState(false)
  const [shown, setShown] = useState<Invite | null>(null)
  // Whether a link still works, as of opening the screen.
  const [now] = useState(() => Date.now())

  return (
    <div className="flex flex-col gap-1.5">
      {/* DL-CMP-07: the links are rows in an inset list, the action to add one first. */}
      <List label={t('people.links.title')}>
        <ListButtonRow
          leading={<PlusIcon aria-hidden className="size-[1.375rem] text-brand" />}
          title={t('people.links.new')}
          onClick={() => {
            setMaking(true)
          }}
        />
        {invites.map((invite) => (
          <InviteRow
            key={invite.id}
            invite={invite}
            now={now}
            onOpen={() => {
              setShown(invite)
            }}
          />
        ))}
      </List>
      <FieldNote>{t('people.links.note')}</FieldNote>
      <NewInviteSheet
        open={making}
        onClose={() => {
          setMaking(false)
        }}
      />
      <InviteSheet
        invite={shown ? (invites.find((invite) => invite.id === shown.id) ?? shown) : null}
        now={now}
        onClose={() => {
          setShown(null)
        }}
      />
    </div>
  )
}

function joinedLabel(t: ReturnType<typeof useTranslation>['t'], invite: Invite) {
  return invite.maxUses === null
    ? t('people.links.joined', { count: invite.useCount })
    : t('people.links.joinedOf', { count: invite.useCount, max: invite.maxUses })
}

function useInviteState() {
  const { t } = useTranslation()
  const date = useDate()
  return (invite: Invite, now: number) => {
    if (invite.endedAt) return t('people.links.ended', { date: date(invite.endedAt) })
    if (invite.maxUses !== null && invite.useCount >= invite.maxUses) {
      return t('people.links.usedUp')
    }
    // A link chosen to expire on a date works through that day, until midnight.
    const lastDay = new Date(Date.parse(invite.expiresAt) - 1).toISOString()
    if (Date.parse(invite.expiresAt) <= now) {
      return t('people.links.expired', { date: date(lastDay) })
    }
    return t('people.links.expires', { date: date(lastDay) })
  }
}

function InviteRow({ invite, now, onOpen }: { invite: Invite; now: number; onOpen: () => void }) {
  const { t } = useTranslation()
  const state = useInviteState()
  return (
    <ListButtonRow
      tone="text"
      leading={<IconTile icon={LinkSimpleIcon} />}
      title={joinedLabel(t, invite)}
      subtitle={state(invite, now)}
      onClick={onOpen}
    />
  )
}

// SYS-21: what a link allows and who joined with it, and ending it early.
function InviteSheet({
  invite,
  now,
  onClose,
}: {
  invite: Invite | null
  now: number
  onClose: () => void
}) {
  const { t } = useTranslation()
  const date = useDate()
  const state = useInviteState()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const end = useMutation({
    mutationFn: (id: string) => api.endInvite(id),
    onSettled: () => queryClient.invalidateQueries(invitesQuery),
  })
  const open = invite ? inviteIsOpen(invite, now) && !end.isSuccess : false

  return (
    <Sheet
      open={invite !== null}
      title={t('people.links.sheetTitle')}
      doneLabel={t('nav.done')}
      onClose={() => {
        end.reset()
        onClose()
      }}
    >
      {invite && (
        <>
          <List inset>
            <ListRow
              title={t('people.links.uses')}
              trailing={
                <Value>
                  {invite.maxUses === null
                    ? t('people.links.countNoLimit', { count: invite.useCount })
                    : t('people.links.countOf', { count: invite.useCount, max: invite.maxUses })}
                </Value>
              }
            />
            <ListRow
              title={t('people.links.status')}
              trailing={<Value>{state(invite, now)}</Value>}
            />
            <ListRow
              title={t('people.links.made')}
              trailing={<Value>{date(invite.createdAt)}</Value>}
            />
          </List>
          <List label={t('people.links.whoJoined')} inset>
            {invite.joined.length === 0 ? (
              <ListRow
                title={<span className="text-text-muted">{t('people.links.nobody')}</span>}
              />
            ) : (
              invite.joined.map((username) => (
                <ListRow
                  key={username}
                  leading={<ProfilePicture picture="initial" username={username} size={2} />}
                  title={username}
                />
              ))
            )}
          </List>
          {end.isError && <Alert>{t('security.errors.unknown')}</Alert>}
          {open && (
            <SheetFooter>
              <Button
                variant="secondary"
                disabled={end.isPending}
                onClick={() => {
                  setConfirming(true)
                }}
              >
                {t('people.links.end')}
              </Button>
            </SheetFooter>
          )}
          <ActionSheet
            open={confirming}
            title={t('people.links.endTitle')}
            message={t('people.links.endBody')}
            cancelLabel={t('nav.cancel')}
            actions={[
              {
                label: t('people.links.endAction'),
                onSelect: () => {
                  setConfirming(false)
                  end.mutate(invite.id)
                },
              },
            ]}
            onClose={() => {
              setConfirming(false)
            }}
          />
        </>
      )}
    </Sheet>
  )
}

function Value({ children }: { children: string }) {
  return <span className="text-[0.9375rem] text-text-muted">{children}</span>
}

// SYS-21: a new link, with when it expires and how many people it lets in. Once made,
// the sheet shows the link to send, just this once.
function NewInviteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const date = useDate()
  const queryClient = useQueryClient()
  const today = toCalendarDate(new Date())
  const [expires, setExpires] = useState(() => addDays(today, inviteDefaultDays))
  const [uses, setUses] = useState<Uses>(inviteDefaultUses)
  const [choosingUses, setChoosingUses] = useState(false)
  const create = useMutation({
    mutationFn: () => api.createInvite({ expiresAt: endOfDay(expires), maxUses: uses }),
    onSuccess: () => queryClient.invalidateQueries(invitesQuery),
  })

  function close() {
    onClose()
    // Next time starts from the defaults again, once the sheet has slid away.
    setTimeout(() => {
      create.reset()
      setExpires(addDays(today, inviteDefaultDays))
      setUses(inviteDefaultUses)
    }, 400)
  }

  const usesLabel = (choice: Uses) =>
    choice === null ? t('people.links.anyone') : t('people.links.people', { count: choice })
  const made = create.data

  return (
    <Sheet
      open={open}
      title={t('people.links.newTitle')}
      {...(made ? { doneLabel: t('nav.done') } : { cancelLabel: t('nav.cancel') })}
      onClose={close}
    >
      {made ? (
        <NewInvite code={made.code} />
      ) : (
        <>
          <FieldRows
            note={
              <FieldNote>
                {uses === null
                  ? t('people.links.summaryAnyone', { date: date(endOfDay(expires)) })
                  : t('people.links.summary', {
                      count: uses,
                      date: date(`${expires}T12:00:00`),
                    })}
              </FieldNote>
            }
          >
            <DateRow
              label={t('people.links.expiresOn')}
              value={expires}
              min={addDays(today, 1)}
              max={addDays(today, inviteMaxDays - 1)}
              onChange={setExpires}
            />
            <PickerRow
              label={t('people.links.whoCanJoin')}
              value={usesLabel(uses)}
              error={false}
              onClick={() => {
                setChoosingUses(true)
              }}
            />
          </FieldRows>
          {create.isError && <Alert>{t('security.errors.unknown')}</Alert>}
          <SheetFooter>
            <Button
              disabled={create.isPending}
              onClick={() => {
                create.mutate()
              }}
            >
              {create.isPending ? t('people.links.working') : t('people.links.make')}
            </Button>
          </SheetFooter>
        </>
      )}
      <Sheet
        open={choosingUses}
        title={t('people.links.whoCanJoin')}
        doneLabel={t('nav.done')}
        onClose={() => {
          setChoosingUses(false)
        }}
      >
        <List inset>
          {useChoices.map((choice) => (
            <ChoiceRow
              key={String(choice)}
              role="radio"
              title={usesLabel(choice)}
              checked={uses === choice}
              onToggle={() => {
                setUses(choice)
                setChoosingUses(false)
              }}
            />
          ))}
        </List>
      </Sheet>
    </Sheet>
  )
}

// Shown once: the server keeps only a hash of the code.
function NewInvite({ code }: { code: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const link = inviteLink(code)
  const canShare = typeof navigator.share === 'function'

  return (
    <section aria-label={t('people.links.ready')} className="flex flex-col gap-4">
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
                .share({ title: t('app.name'), text: t('people.links.shareText'), url: link })
                .catch(() => undefined)
            }}
          >
            {t('people.links.share')}
          </Button>
        )}
      </div>
      <Alert tone="warning">{t('people.links.shownOnce')}</Alert>
    </section>
  )
}

// SYS-22: everyone on the server. Tapping someone offers to remove them, or to give a
// removed account its access back until it is deleted (SYS-23).
function People() {
  const { t } = useTranslation()
  const date = useDate()
  const queryClient = useQueryClient()
  const { data: people } = useSuspenseQuery(peopleQuery)
  const [chosen, setChosen] = useState<Person | null>(null)
  const change = useMutation({
    mutationFn: ({ person, remove }: { person: Person; remove: boolean }) =>
      remove ? api.removePerson(person.id) : api.restorePerson(person.id),
    onSettled: () => queryClient.invalidateQueries(peopleQuery),
  })

  return (
    <>
      <List label={t('people.list.title')} detail={String(people.length)}>
        {people.map((person) => {
          const picture = (
            <ProfilePicture picture="initial" username={person.username} size={2.25} />
          )
          if (person.operator) {
            return (
              <ListRow
                key={person.id}
                leading={picture}
                title={person.username}
                subtitle={t('people.list.operator')}
              />
            )
          }
          return (
            <ListButtonRow
              key={person.id}
              tone="text"
              leading={picture}
              title={person.username}
              subtitle={
                person.deletesAt ? (
                  <span className="text-warning">
                    {t('people.list.removed', { date: date(person.deletesAt) })}
                  </span>
                ) : (
                  t('people.list.joined', { date: date(person.joinedAt) })
                )
              }
              disabled={change.isPending}
              onClick={() => {
                setChosen(person)
              }}
            />
          )
        })}
      </List>
      {change.isError && <Alert>{t('security.errors.unknown')}</Alert>}
      <ActionSheet
        open={chosen !== null}
        title={chosen?.username ?? ''}
        message={
          chosen?.deletesAt
            ? t('people.list.restoreBody', {
                username: chosen.username,
                date: date(chosen.deletesAt),
              })
            : t('people.list.removeBody', { username: chosen?.username ?? '' })
        }
        cancelLabel={t('nav.cancel')}
        actions={
          chosen
            ? [
                chosen.deletesAt
                  ? {
                      label: t('people.list.restore'),
                      onSelect: () => {
                        change.mutate({ person: chosen, remove: false })
                        setChosen(null)
                      },
                    }
                  : {
                      label: t('people.list.remove', { username: chosen.username }),
                      tone: 'danger' as const,
                      onSelect: () => {
                        change.mutate({ person: chosen, remove: true })
                        setChosen(null)
                      },
                    },
              ]
            : []
        }
        onClose={() => {
          setChosen(null)
        }}
      />
    </>
  )
}
