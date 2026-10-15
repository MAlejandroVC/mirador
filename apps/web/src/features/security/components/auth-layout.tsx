import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AppIcon } from '../../../components/ui/app-icon'

// The frame of the sign-in, sign-up and unlock screens. Mirador introduces itself at the
// top with its icon, name and slogan (DL-VOC-07); the form sits in a card (DL-LAY-05),
// whose `surface` sets the `inset` fields apart (DL-CMP-09).
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
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-10 sm:py-16">
      <div className="flex items-center gap-3">
        <AppIcon className="size-12 rounded-xl" />
        <div className="flex flex-col">
          <p className="text-[1.0625rem] font-semibold text-text">{t('app.name')}</p>
          <p className="text-[0.8125rem] text-text-muted">{t('app.tagline')}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 pt-3">
        {/* DL-TYP-03: large title. */}
        <h1 className="text-[1.875rem] leading-tight font-bold tracking-[-0.02em] text-text">
          {title}
        </h1>
        {intro && <p className="text-[0.9375rem] text-text-muted">{intro}</p>}
      </div>
      <div className="flex flex-col gap-5 rounded-2xl bg-surface p-4 sm:p-6">{children}</div>
    </main>
  )
}
