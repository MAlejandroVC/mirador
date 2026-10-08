import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { fetchHealth } from '../lib/api'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const { t } = useTranslation()
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, retry: false })

  const status = health.isPending
    ? t('health.checking')
    : health.isSuccess
      ? t('health.ok')
      : t('health.unreachable')

  return (
    <main className="mx-auto flex max-w-md flex-col gap-2 px-4 py-12">
      <h1 className="text-3xl font-semibold">{t('app.name')}</h1>
      <p className="text-slate-600">{t('app.tagline')}</p>
      <p role="status" className="text-sm text-slate-500">
        {status}
      </p>
    </main>
  )
}
