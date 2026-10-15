import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { type SubmitEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usernamePattern } from '@repo/api'
import { Button } from '../../../components/ui/button'
import { TextField } from '../../../components/ui/text-field'
import { api } from '../../../lib/api'
import { vaultErrorCode } from '../../../worker/errors'
import { AuthLayout } from '../components/auth-layout'
import { ErrorMessage } from '../components/error-message'
import { PictureStep } from '../components/picture-step'
import { RecoveryKeyStep } from '../components/recovery-key-step'
import { sessionQuery } from '../hooks/session'
import { signUpStatusQuery } from '../hooks/sign-up'
import { minimumPasswordLength, passwordFollowsRules } from '../lib/password'
import { usePasswordChecks, useRepeatChecks, useUsernameChecks } from '../hooks/field-checks'
import { useVault } from '../hooks/vault'

interface Problems {
  username?: string | undefined
  password?: string
  confirm?: string
  setupCode?: string
  inviteCode?: string
}

// SYS-06, SYS-13, SEC-07: create an account, then show the recovery key once.
export function SignUpScreen() {
  const { t } = useTranslation()
  const vault = useVault()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: status } = useSuspenseQuery(signUpStatusQuery)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [setupCode, setSetupCode] = useState('')
  const { invite } = useSearch({ from: '/sign-up' })
  const [inviteCode, setInviteCode] = useState(invite ?? '')
  const [problems, setProblems] = useState<Problems>({})
  const [keySaved, setKeySaved] = useState(false)
  const usernameRules = useUsernameChecks(username)
  const passwordRules = usePasswordChecks(password)
  const repeatRules = useRepeatChecks(password, confirm)
  const wanted = username.trim().toLowerCase()
  // SYS-06: checked when the person leaves the field, so a taken username shows up
  // before the keys are made. The answer counts only until the name is edited again.
  const [checked, setChecked] = useState<string | null>(null)
  const sentInvite = status.mode === 'invite' ? inviteCode.trim() : ''
  const availability = useQuery({
    queryKey: ['username-check', checked, sentInvite],
    queryFn: checked
      ? () =>
          api.checkUsername({
            username: checked,
            ...(sentInvite ? { inviteCode: sentInvite } : {}),
          })
      : skipToken,
    retry: false,
  })
  const available = checked === wanted ? availability.data : undefined

  const signUp = useMutation({
    mutationFn: () =>
      vault.signUp({
        username,
        password,
        ...(status.mode === 'setup' ? { setupCode: setupCode.trim() } : {}),
        ...(status.mode === 'invite' ? { inviteCode: inviteCode.trim() } : {}),
      }),
  })

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const found: Problems = {}
    if (!usernamePattern.test(wanted)) {
      found.username = t('security.errors.invalidUsername')
    } else if (available === false) {
      found.username = t('security.errors.username-taken')
    }
    if (!passwordFollowsRules(password)) {
      found.password = t('security.errors.passwordRules', { count: minimumPasswordLength })
    } else if (confirm !== password) {
      found.confirm = t('security.errors.passwordsDontMatch')
    }
    if (status.mode === 'setup' && !setupCode.trim()) {
      found.setupCode = t('security.errors.setupCodeMissing')
    }
    if (status.mode === 'invite' && !inviteCode.trim()) {
      found.inviteCode = t('security.errors.inviteCodeMissing')
    }
    setProblems(found)
    if (Object.keys(found).length === 0) signUp.mutate()
  }

  if (keySaved) {
    return (
      <PictureStep
        username={wanted}
        onDone={async () => {
          queryClient.removeQueries(sessionQuery)
          await navigate({ to: '/' })
        }}
      />
    )
  }

  if (signUp.data) {
    return (
      <RecoveryKeyStep
        username={wanted}
        recoveryKey={signUp.data.recoveryKey}
        onDone={() => {
          setKeySaved(true)
          return Promise.resolve()
        }}
      />
    )
  }

  const signInLink = (
    <p className="text-center text-sm text-text-muted">
      {t('security.signUp.haveAccount')}{' '}
      <Link to="/sign-in" className="inline-flex min-h-11 items-center font-medium text-brand">
        {t('security.signUp.signIn')}
      </Link>
    </p>
  )

  return (
    <AuthLayout title={t('security.signUp.title')} intro={t('security.signUp.intro')}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {status.mode === 'setup' && (
          <TextField
            label={t('security.signUp.setupCode')}
            hint={t('security.signUp.setupCodeHint')}
            error={problems.setupCode}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={setupCode}
            onChange={(event) => {
              setSetupCode(event.target.value)
            }}
          />
        )}
        {status.mode === 'invite' && (
          <TextField
            label={t('security.signUp.inviteCode')}
            hint={t('security.signUp.inviteCodeHint')}
            error={problems.inviteCode}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={inviteCode}
            onChange={(event) => {
              setInviteCode(event.target.value)
            }}
          />
        )}
        <TextField
          label={t('form.username')}
          info={t('security.signUp.usernameHint')}
          checks={usernameRules}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          error={
            problems.username ??
            (available === false ? t('security.errors.username-taken') : undefined)
          }
          success={
            available ? t('security.signUp.usernameAvailable', { username: wanted }) : undefined
          }
          value={username}
          onChange={(event) => {
            setUsername(event.target.value)
            setProblems((found) => ({ ...found, username: undefined }))
          }}
          onBlur={() => {
            setChecked(usernamePattern.test(wanted) ? wanted : null)
          }}
        />
        <TextField
          label={t('form.password')}
          type="password"
          autoComplete="new-password"
          info={t('security.signUp.passwordHint', { count: minimumPasswordLength })}
          checks={passwordRules}
          error={problems.password}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value)
          }}
        />
        <TextField
          label={t('security.signUp.confirm')}
          type="password"
          autoComplete="new-password"
          checks={repeatRules}
          error={problems.confirm}
          value={confirm}
          onChange={(event) => {
            setConfirm(event.target.value)
          }}
        />
        <ErrorMessage code={signUp.isError ? vaultErrorCode(signUp.error) : null} />
        <Button type="submit" disabled={signUp.isPending}>
          {signUp.isPending ? t('security.signUp.working') : t('security.signUp.submit')}
        </Button>
      </form>
      {signInLink}
    </AuthLayout>
  )
}
