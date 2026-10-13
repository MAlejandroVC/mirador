import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { type SubmitEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../components/ui/button'
import { TextField } from '../../../components/ui/text-field'
import { vaultErrorCode } from '../../../worker/errors'
import { AuthLayout } from '../components/auth-layout'
import { ErrorMessage } from '../components/error-message'
import { sessionQuery } from '../hooks/session'
import { useVault } from '../hooks/vault'

// SEC-02, SEC-12: still signed in, but the keys are gone from memory (a reload or a
// lock), so the password derives them again. Nothing is sent but a request for the
// wrapped key.
export function UnlockScreen() {
  const { t } = useTranslation()
  const vault = useVault()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: session } = useSuspenseQuery(sessionQuery)
  const [password, setPassword] = useState('')

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
    <AuthLayout title={t('security.unlock.title')} intro={t('security.unlock.intro')}>
      {session && (
        <p className="text-sm text-slate-600">
          {t('security.unlock.signedInAs', { username: session.user.username })}
        </p>
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
        <Button type="submit" disabled={unlock.isPending || !password}>
          {unlock.isPending ? t('security.unlock.working') : t('security.unlock.submit')}
        </Button>
      </form>
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
