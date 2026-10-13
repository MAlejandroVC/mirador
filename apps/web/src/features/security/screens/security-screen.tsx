import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type ReactNode, type SubmitEvent, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { TextField } from '../../../components/ui/text-field'
import { api } from '../../../lib/api'
import { vaultErrorCode } from '../../../worker/errors'
import { ErrorMessage } from '../components/error-message'
import { RecoveryKeyStep } from '../components/recovery-key-step'
import { sessionQuery } from '../hooks/session'
import { minimumPasswordLength, passwordFollowsRules } from '../lib/password'
import { useVault } from '../hooks/vault'
import { addPasskey, passkeysQuery } from '../hooks/passkeys'
import { type AutoLockChoice, autoLockChoices, readAutoLock, saveAutoLock } from '../lib/auto-lock'
import { passkeysSupported } from '../lib/passkey'

// SEC-08: change the password, replace the recovery key and sign out other devices,
// all without touching the data: the account key stays the same. SYS-06, SEC-12:
// passkeys (Face ID) and when this device locks itself.
export function SecurityScreen() {
  const { t } = useTranslation()
  const { data: session } = useSuspenseQuery(sessionQuery)
  const username = session?.user.username ?? ''
  const [newRecoveryKey, setNewRecoveryKey] = useState<string | null>(null)
  const [recoveryKeySaved, setRecoveryKeySaved] = useState(false)

  // Shown once, like at sign-up; the old key already stopped working.
  if (newRecoveryKey) {
    return (
      <RecoveryKeyStep
        username={username}
        recoveryKey={newRecoveryKey}
        onDone={() => {
          setNewRecoveryKey(null)
          setRecoveryKeySaved(true)
          return Promise.resolve()
        }}
      />
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-8 sm:py-12">
      <div className="flex flex-col items-start gap-2">
        <Link
          to="/"
          className="-ml-1 inline-flex min-h-11 items-center px-1 font-medium text-slate-700 underline-offset-4 hover:underline"
        >
          ← {t('security.settings.back')}
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">{t('security.settings.title')}</h1>
      </div>
      <Passkeys username={username} />
      <AutoLockSetting />
      <ChangePassword username={username} />
      <ReplaceRecoveryKey
        username={username}
        saved={recoveryKeySaved}
        onReplaced={(key) => {
          setRecoveryKeySaved(false)
          setNewRecoveryKey(key)
        }}
      />
      <SignOutOthers />
    </main>
  )
}

function Section({
  title,
  intro,
  children,
}: {
  title: string
  intro: string
  children: ReactNode
}) {
  const id = useId()
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
        <p className="text-sm text-slate-600">{intro}</p>
      </div>
      {children}
    </section>
  )
}

// Lets a password manager tie the new password to the right account.
function UsernameForPasswordManagers({ username }: { username: string }) {
  return <input type="text" autoComplete="username" value={username} readOnly hidden />
}

interface PasswordProblems {
  current?: string
  password?: string
  confirm?: string
}

function ChangePassword({ username }: { username: string }) {
  const { t } = useTranslation()
  const vault = useVault()
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [problems, setProblems] = useState<PasswordProblems>({})

  const change = useMutation({
    mutationFn: () => vault.changePassword(current, password),
    onSuccess: () => {
      setCurrent('')
      setPassword('')
      setConfirm('')
    },
  })

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const found: PasswordProblems = {}
    if (!current) found.current = t('security.errors.passwordMissing')
    if (!passwordFollowsRules(password)) {
      found.password = t('security.errors.passwordRules', { count: minimumPasswordLength })
    } else if (confirm !== password) {
      found.confirm = t('security.errors.passwordsDontMatch')
    }
    setProblems(found)
    if (Object.keys(found).length === 0) change.mutate()
  }

  return (
    <Section
      title={t('security.settings.password.title')}
      intro={t('security.settings.password.intro')}
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <UsernameForPasswordManagers username={username} />
        <TextField
          label={t('security.settings.password.current')}
          type="password"
          autoComplete="current-password"
          error={problems.current}
          value={current}
          onChange={(event) => {
            setCurrent(event.target.value)
          }}
        />
        <TextField
          label={t('security.settings.password.new')}
          type="password"
          autoComplete="new-password"
          hint={t('security.signUp.passwordHint', { count: minimumPasswordLength })}
          error={problems.password}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value)
          }}
        />
        <TextField
          label={t('security.settings.password.confirm')}
          type="password"
          autoComplete="new-password"
          error={problems.confirm}
          value={confirm}
          onChange={(event) => {
            setConfirm(event.target.value)
          }}
        />
        <ErrorMessage code={change.isError ? vaultErrorCode(change.error) : null} />
        {change.isSuccess && <Alert tone="success">{t('security.settings.password.done')}</Alert>}
        <Button type="submit" disabled={change.isPending}>
          {change.isPending
            ? t('security.settings.password.working')
            : t('security.settings.password.submit')}
        </Button>
      </form>
    </Section>
  )
}

function ReplaceRecoveryKey({
  username,
  saved,
  onReplaced,
}: {
  username: string
  saved: boolean
  onReplaced: (recoveryKey: string) => void
}) {
  const { t } = useTranslation()
  const vault = useVault()
  const [password, setPassword] = useState('')
  const [problem, setProblem] = useState<string | undefined>()

  const replace = useMutation({
    mutationFn: () => vault.replaceRecoveryKey(password),
    onSuccess: ({ recoveryKey }) => {
      setPassword('')
      onReplaced(recoveryKey)
    },
  })

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const missing = password ? undefined : t('security.errors.passwordMissing')
    setProblem(missing)
    if (!missing) replace.mutate()
  }

  return (
    <Section
      title={t('security.settings.recoveryKey.title')}
      intro={t('security.settings.recoveryKey.intro')}
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <UsernameForPasswordManagers username={username} />
        <TextField
          label={t('security.settings.recoveryKey.password')}
          type="password"
          autoComplete="current-password"
          error={problem}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value)
          }}
        />
        <ErrorMessage code={replace.isError ? vaultErrorCode(replace.error) : null} />
        {saved && <Alert tone="success">{t('security.settings.recoveryKey.done')}</Alert>}
        <Button type="submit" variant="secondary" disabled={replace.isPending}>
          {replace.isPending
            ? t('security.settings.recoveryKey.working')
            : t('security.settings.recoveryKey.submit')}
        </Button>
      </form>
    </Section>
  )
}

function SignOutOthers() {
  const { t } = useTranslation()
  const vault = useVault()
  const signOut = useMutation({ mutationFn: () => vault.signOutOthers() })

  return (
    <Section
      title={t('security.settings.devices.title')}
      intro={t('security.settings.devices.intro')}
    >
      <ErrorMessage code={signOut.isError ? vaultErrorCode(signOut.error) : null} />
      {signOut.isSuccess && (
        <Alert tone="success">{t('security.settings.devices.done', { count: signOut.data })}</Alert>
      )}
      <Button
        variant="secondary"
        disabled={signOut.isPending}
        onClick={() => {
          signOut.mutate()
        }}
      >
        {signOut.isPending
          ? t('security.settings.devices.working')
          : t('security.settings.devices.submit')}
      </Button>
    </Section>
  )
}

// SYS-06: each passkey wraps the account key with its own secret. Adding one needs the
// current password, like changing it; removing one doesn't, since it only takes a way
// in away.
function Passkeys({ username }: { username: string }) {
  const { t, i18n } = useTranslation()
  const vault = useVault()
  const queryClient = useQueryClient()
  const passkeys = useQuery(passkeysQuery)
  const [password, setPassword] = useState('')
  const [problem, setProblem] = useState<string | undefined>()
  const supported = passkeysSupported()

  const add = useMutation({
    mutationFn: () => addPasskey(vault, password),
    onSuccess: () => {
      setPassword('')
    },
    onSettled: () => queryClient.invalidateQueries(passkeysQuery),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.removePasskey(id),
    onSettled: () => queryClient.invalidateQueries(passkeysQuery),
  })

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const missing = password ? undefined : t('security.errors.passwordMissing')
    setProblem(missing)
    if (!missing) add.mutate()
  }

  const date = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(iso))

  return (
    <Section
      title={t('security.settings.passkeys.title')}
      intro={t('security.settings.passkeys.intro')}
    >
      {passkeys.data?.length === 0 && (
        <p className="text-sm text-slate-600">{t('security.settings.passkeys.none')}</p>
      )}
      {passkeys.data && passkeys.data.length > 0 && (
        <ul className="flex flex-col divide-y divide-slate-200 rounded-xl border border-slate-200">
          {passkeys.data.map((passkey, index) => (
            <li key={passkey.id} className="flex items-center justify-between gap-3 py-2 pr-2 pl-4">
              <div className="flex min-w-0 flex-col">
                <span className="font-medium text-slate-900">
                  {t('security.settings.passkeys.name', { number: index + 1 })}
                </span>
                <span className="text-sm text-slate-600">
                  {t('security.settings.passkeys.added', { date: date(passkey.createdAt) })}
                  {passkey.lastUsedAt &&
                    `, ${t('security.settings.passkeys.lastUsed', { date: date(passkey.lastUsedAt) })}`}
                </span>
              </div>
              <Button
                variant="ghost"
                aria-label={t('security.settings.passkeys.removeLabel', { number: index + 1 })}
                disabled={remove.isPending}
                onClick={() => {
                  remove.mutate(passkey.id)
                }}
              >
                {t('security.settings.passkeys.remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {supported ? (
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <UsernameForPasswordManagers username={username} />
          <TextField
            label={t('security.settings.passkeys.password')}
            type="password"
            autoComplete="current-password"
            error={problem}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
            }}
          />
          <ErrorMessage code={add.isError ? vaultErrorCode(add.error) : null} />
          {add.isSuccess && <Alert tone="success">{t('security.settings.passkeys.done')}</Alert>}
          <Button type="submit" variant="secondary" disabled={add.isPending}>
            {add.isPending
              ? t('security.settings.passkeys.working')
              : t('security.settings.passkeys.submit')}
          </Button>
        </form>
      ) : (
        <Alert>{t('security.settings.passkeys.unsupported')}</Alert>
      )}
    </Section>
  )
}

// SEC-12: a choice for this device; the auto-lock reads it on every check.
function AutoLockSetting() {
  const { t } = useTranslation()
  const id = useId()
  const [choice, setChoice] = useState<AutoLockChoice>(readAutoLock)
  const [saved, setSaved] = useState(false)

  return (
    <Section
      title={t('security.settings.autoLock.title')}
      intro={t('security.settings.autoLock.intro')}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-sm font-medium text-slate-800">
          {t('security.settings.autoLock.label')}
        </label>
        <select
          id={id}
          value={String(choice)}
          onChange={(event) => {
            const picked =
              autoLockChoices.find((option) => String(option) === event.target.value) ?? choice
            setChoice(picked)
            setSaved(saveAutoLock(picked))
          }}
          className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:outline-2 focus:outline-offset-1 focus:outline-slate-900"
        >
          {autoLockChoices.map((option) => (
            <option key={option} value={String(option)}>
              {option === 'leave'
                ? t('security.settings.autoLock.leave')
                : t('security.settings.autoLock.minutes', { count: option })}
            </option>
          ))}
        </select>
      </div>
      {saved && (
        <p role="status" className="text-sm text-slate-600">
          {t('security.settings.autoLock.done')}
        </p>
      )}
    </Section>
  )
}
