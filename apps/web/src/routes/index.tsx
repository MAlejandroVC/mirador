import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button'
import { sessionQuery, useVault } from '../features/security'
import { api } from '../lib/api'

// Screens behind sign-in check the same two things: a session with the server, and
// keys in the worker's memory (SEC-12).
export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) => {
    if (!(await context.queryClient.query(sessionQuery))) {
      throw redirect({ to: '/sign-in' })
    }
    if ((await context.vault.status()) === 'locked') throw redirect({ to: '/unlock' })
  },
  component: Home,
})

function Home() {
  const { t } = useTranslation()
  const vault = useVault()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: session } = useSuspenseQuery(sessionQuery)
  const health = useQuery({ queryKey: ['health'], queryFn: () => api.health(), retry: false })

  const lock = useMutation({
    mutationFn: () => vault.lock(),
    onSuccess: () => navigate({ to: '/unlock' }),
  })
  const signOut = useMutation({
    mutationFn: () => vault.signOut(),
    onSettled: async () => {
      queryClient.removeQueries(sessionQuery)
      await navigate({ to: '/sign-in' })
    },
  })

  const status = health.isPending
    ? t('health.checking')
    : health.isSuccess
      ? t('health.ok')
      : t('health.unreachable')

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">{t('app.name')}</h1>
        <p className="text-slate-600">{t('app.tagline')}</p>
      </div>
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-5">
        {session && (
          <p className="font-medium">
            {t('security.home.signedInAs', { username: session.user.username })}
          </p>
        )}
        <p className="text-sm text-slate-600">{t('security.home.encrypted')}</p>
        <p role="status" className="text-sm text-slate-500">
          {status}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="secondary"
          onClick={() => {
            lock.mutate()
          }}
        >
          {t('security.home.lock')}
        </Button>
        <Button
          variant="secondary"
          disabled={signOut.isPending}
          onClick={() => {
            signOut.mutate()
          }}
        >
          {t('security.home.signOut')}
        </Button>
      </div>
    </main>
  )
}
