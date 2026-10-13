import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

// The frame of the sign-in, sign-up and unlock screens: one column on a phone, a
// card on wider screens.
export function AuthLayout({
  title,
  intro,
  children,
}: {
  title: string
  intro?: string
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10 sm:py-16">
      <p className="text-lg font-semibold tracking-tight text-slate-500">{t('app.name')}</p>
      <div className="flex flex-col gap-6 sm:rounded-2xl sm:border sm:border-slate-200 sm:bg-white sm:p-8 sm:shadow-sm">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          {intro && <p className="text-slate-600">{intro}</p>}
        </div>
        {children}
      </div>
    </main>
  )
}
