import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { type SubmitEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usernamePattern } from '@repo/api'
import { Alert } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { TextField } from '../../../components/ui/text-field'
import { vaultErrorCode } from '../../../worker/errors'
import { AuthLayout } from '../components/auth-layout'
import { ErrorMessage } from '../components/error-message'
import { RecoveryKeyStep } from '../components/recovery-key-step'
import { sessionQuery } from '../hooks/session'
import { minimumPasswordLength, signUpStatusQuery } from '../hooks/sign-up'
import { useVault } from '../hooks/vault'

interface Problems {
  username?: string
  password?: string
  confirm?: string
  setupCode?: string
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
  const [problems, setProblems] = useState<Problems>({})

  const signUp = useMutation({
    mutationFn: () =>
      vault.signUp({
        username,
        password,
        ...(status.mode === 'setup' ? { setupCode: setupCode.trim() } : {}),
      }),
  })

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const found: Problems = {}
    if (!usernamePattern.test(username.trim().toLowerCase())) {
      found.username = t('security.errors.invalidUsername')
    }
    if (password.length < minimumPasswordLength) {
      found.password = t('security.errors.passwordTooShort', { count: minimumPasswordLength })
    } else if (confirm !== password) {
      found.confirm = t('security.errors.passwordsDontMatch')
    }
    if (status.mode === 'setup' && !setupCode.trim()) {
      found.setupCode = t('security.errors.setupCodeMissing')
    }
    setProblems(found)
    if (Object.keys(found).length === 0) signUp.mutate()
  }

  if (signUp.data) {
    return (
      <RecoveryKeyStep
        username={username.trim().toLowerCase()}
        recoveryKey={signUp.data.recoveryKey}
        onDone={async () => {
          queryClient.removeQueries(sessionQuery)
          await navigate({ to: '/' })
        }}
      />
    )
  }

  const signInLink = (
    <p className="text-center text-sm text-slate-600">
      {t('security.signUp.haveAccount')}{' '}
      <Link
        to="/sign-in"
        className="inline-flex min-h-11 items-center font-medium text-slate-900 underline"
      >
        {t('security.signUp.signIn')}
      </Link>
    </p>
  )

  if (status.mode === 'closed') {
    return (
      <AuthLayout title={t('security.signUp.title')}>
        <Alert tone="warning">{t('security.signUp.closed')}</Alert>
        {signInLink}
      </AuthLayout>
    )
  }

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
        <TextField
          label={t('form.username')}
          hint={t('security.signUp.usernameHint')}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          error={problems.username}
          value={username}
          onChange={(event) => {
            setUsername(event.target.value)
          }}
        />
        <TextField
          label={t('form.password')}
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
          label={t('security.signUp.confirm')}
          type="password"
          autoComplete="new-password"
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
