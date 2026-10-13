import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { type SubmitEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../components/ui/button'
import { TextField } from '../../../components/ui/text-field'
import { vaultErrorCode } from '../../../worker/errors'
import { AuthLayout } from '../components/auth-layout'
import { ErrorMessage } from '../components/error-message'
import { sessionQuery } from '../hooks/session'
import { minimumPasswordLength, passwordFollowsRules } from '../lib/password'
import { useVault } from '../hooks/vault'

interface Problems {
  recoveryKey?: string
  password?: string
  confirm?: string
}

// SEC-07: a forgotten password. The recovery key opens the data and a new password
// replaces the old one; the recovery key itself never leaves the browser.
export function RecoverScreen() {
  const { t } = useTranslation()
  const vault = useVault()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [username, setUsername] = useState('')
  const [recoveryKey, setRecoveryKey] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [problems, setProblems] = useState<Problems>({})

  const recover = useMutation({
    mutationFn: () => vault.recover({ username, recoveryKey, newPassword: password }),
    onSuccess: async () => {
      queryClient.removeQueries(sessionQuery)
      await navigate({ to: '/' })
    },
  })

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const found: Problems = {}
    if (!recoveryKey.trim()) found.recoveryKey = t('security.errors.recoveryKeyMissing')
    if (!passwordFollowsRules(password)) {
      found.password = t('security.errors.passwordRules', { count: minimumPasswordLength })
    } else if (confirm !== password) {
      found.confirm = t('security.errors.passwordsDontMatch')
    }
    setProblems(found)
    if (Object.keys(found).length === 0) recover.mutate()
  }

  return (
    <AuthLayout title={t('security.recover.title')} intro={t('security.recover.intro')}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextField
          label={t('form.username')}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={username}
          onChange={(event) => {
            setUsername(event.target.value)
          }}
        />
        <TextField
          label={t('security.recover.recoveryKey')}
          hint={t('security.recover.recoveryKeyHint')}
          error={problems.recoveryKey}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          value={recoveryKey}
          onChange={(event) => {
            setRecoveryKey(event.target.value)
          }}
        />
        <TextField
          label={t('security.recover.newPassword')}
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
          label={t('security.recover.confirm')}
          type="password"
          autoComplete="new-password"
          error={problems.confirm}
          value={confirm}
          onChange={(event) => {
            setConfirm(event.target.value)
          }}
        />
        <ErrorMessage code={recover.isError ? vaultErrorCode(recover.error) : null} />
        <Button type="submit" disabled={recover.isPending || !username}>
          {recover.isPending ? t('security.recover.working') : t('security.recover.submit')}
        </Button>
      </form>
      <p className="text-center text-sm">
        <Link
          to="/sign-in"
          className="inline-flex min-h-11 items-center font-medium text-slate-900 underline"
        >
          {t('security.recover.back')}
        </Link>
      </p>
    </AuthLayout>
  )
}
