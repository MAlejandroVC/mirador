import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { type SubmitEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../components/ui/button'
import { TextField } from '../../../components/ui/text-field'
import { vaultErrorCode } from '../../../worker/errors'
import { AuthLayout } from '../components/auth-layout'
import { ErrorMessage } from '../components/error-message'
import { OrDivider, PasskeyButton } from '../components/passkey-button'
import { passkeysQuery } from '../hooks/passkeys'
import { sessionQuery } from '../hooks/session'
import { passkeysSupported } from '../lib/passkey'
import { useVault } from '../hooks/vault'

// SEC-02, SEC-12: still signed in, but the keys are gone from memory (a reload or a
// lock), so the password derives them again. Nothing is sent but a request for the
// wrapped key. With a passkey on the account (SYS-06), Face ID opens it instead.
export function UnlockScreen() {
  const { t } = useTranslation()
  const vault = useVault()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: session } = useSuspenseQuery(sessionQuery)
  const [password, setPassword] = useState('')
  const passkeys = useQuery({ ...passkeysQuery, enabled: passkeysSupported() })
  const withPasskey = (passkeys.data?.length ?? 0) > 0

  async function toSignIn() {
    queryClient.removeQueries(sessionQuery)
    await navigate({ to: '/sign-in' })
  }

  const unlock = useMutation({
    mutationFn: () => vault.unlock(password),
    onSuccess: () => navigate({ to: '/' }),
    onError: async (error) => {
      if (vaultErrorCode(error) === 'signed-out') await toSignIn()
    },
  })

  const signOut = useMutation({
    mutationFn: () => vault.signOut(),
    onSettled: toSignIn,
  })

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    unlock.mutate()
  }

  return (
    <AuthLayout
      title={t('security.unlock.title')}
      intro={withPasskey ? t('security.unlock.introPasskey') : t('security.unlock.intro')}
    >
      {session && (
        <p className="text-sm text-text-muted">
          {t('security.unlock.signedInAs', { username: session.user.username })}
        </p>
      )}
      {withPasskey && (
        <>
          <PasskeyButton
            label={t('security.unlock.passkey')}
            working={t('security.unlock.passkeyWorking')}
            onOpened={async () => {
              await navigate({ to: '/' })
            }}
            onError={async (code) => {
              if (code === 'signed-out') await toSignIn()
            }}
          />
          <OrDivider label={t('security.unlock.or')} />
        </>
      )}
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {/* Lets password managers fill the right entry. */}
        <input type="hidden" autoComplete="username" value={session?.user.username ?? ''} />
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
        <ErrorMessage code={unlock.isError ? vaultErrorCode(unlock.error) : null} />
        <Button
          type="submit"
          variant={withPasskey ? 'secondary' : 'primary'}
          disabled={unlock.isPending || !password}
        >
          {unlock.isPending ? t('security.unlock.working') : t('security.unlock.submit')}
        </Button>
      </form>
      <p className="text-center text-sm">
        <Link to="/recover" className="inline-flex min-h-11 items-center font-medium text-brand">
          {t('security.signIn.forgot')}
        </Link>
      </p>
      <Button
        variant="ghost"
        onClick={() => {
          signOut.mutate()
        }}
        disabled={signOut.isPending}
      >
        {t('security.unlock.signOut')}
      </Button>
    </AuthLayout>
  )
}
