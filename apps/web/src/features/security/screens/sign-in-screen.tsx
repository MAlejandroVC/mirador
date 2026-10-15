import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { type SubmitEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { TextField } from '../../../components/ui/text-field'
import { vaultErrorCode } from '../../../worker/errors'
import { AuthLayout } from '../components/auth-layout'
import { ErrorMessage } from '../components/error-message'
import { OrDivider, PasskeyButton } from '../components/passkey-button'
import { sessionQuery } from '../hooks/session'
import { passkeysSupported } from '../lib/passkey'
import { useVault } from '../hooks/vault'

// SYS-06: sign in with username and password, or with a passkey. The password stays in
// the browser (SEC-03) and also unlocks the data on this device; so does a passkey.
export function SignInScreen() {
  const { t } = useTranslation()
  const vault = useVault()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const { deleted } = useSearch({ from: '/sign-in' })

  async function signedIn() {
    queryClient.removeQueries(sessionQuery)
    await navigate({ to: '/' })
  }

  const signIn = useMutation({
    mutationFn: () => vault.signIn(username, password),
    onSuccess: signedIn,
  })

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    signIn.mutate()
  }

  return (
    <AuthLayout title={t('security.signIn.title')} intro={t('security.signIn.intro')}>
      {deleted && <Alert tone="success">{t('security.signIn.deleted')}</Alert>}
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextField
          label={t('form.username')}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          value={username}
          onChange={(event) => {
            setUsername(event.target.value)
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
        <Button type="submit" disabled={signIn.isPending || !username || !password}>
          {signIn.isPending ? t('security.signIn.working') : t('security.signIn.submit')}
        </Button>
      </form>
      {passkeysSupported() && (
        <>
          <OrDivider label={t('security.signIn.or')} />
          <PasskeyButton
            variant="secondary"
            label={t('security.signIn.passkey')}
            working={t('security.signIn.passkeyWorking')}
            onOpened={signedIn}
          />
        </>
      )}
      <p className="text-center text-sm">
        <Link to="/recover" className="inline-flex min-h-11 items-center font-medium text-brand">
          {t('security.signIn.forgot')}
        </Link>
      </p>
      <p className="text-center text-sm text-text-muted">
        {t('security.signIn.noAccount')}{' '}
        <Link to="/sign-up" className="inline-flex min-h-11 items-center font-medium text-brand">
          {t('security.signIn.createAccount')}
        </Link>
      </p>
    </AuthLayout>
  )
}
