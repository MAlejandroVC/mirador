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
import { useVault } from '../hooks/vault'

// SYS-06: sign in with email and password. The password stays in the browser
// (SEC-03) and also unlocks the data on this device.
export function SignInScreen() {
  const { t } = useTranslation()
  const vault = useVault()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const signIn = useMutation({
    mutationFn: () => vault.signIn(email, password),
    onSuccess: async () => {
      queryClient.removeQueries(sessionQuery)
      await navigate({ to: '/' })
    },
  })

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    signIn.mutate()
  }

  return (
    <AuthLayout title={t('security.signIn.title')} intro={t('security.signIn.intro')}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextField
          label={t('form.email')}
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          required
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
          }}
        />
        <TextField
          label={t('form.password')}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => {
            setPassword(event.target.value)
          }}
        />
        <ErrorMessage code={signIn.isError ? vaultErrorCode(signIn.error) : null} />
        <Button type="submit" disabled={signIn.isPending || !email || !password}>
          {signIn.isPending ? t('security.signIn.working') : t('security.signIn.submit')}
        </Button>
      </form>
      <p className="text-center text-sm text-slate-600">
        {t('security.signIn.noAccount')}{' '}
        <Link
          to="/sign-up"
          className="inline-flex min-h-11 items-center font-medium text-slate-900 underline"
        >
          {t('security.signIn.createAccount')}
        </Link>
      </p>
    </AuthLayout>
  )
}
