import type { ReactNode } from 'react'

// DL-CMP-01, DL-COL-10: the one loud element of a screen, at its top: `hero` with the
// palette's glow, holding the hero amount with its label and one line of context.
export function HeroCard({
  label,
  amount,
  context,
}: {
  label: string
  amount: ReactNode
  context?: ReactNode
}) {
  return (
    <section className="flex flex-col gap-1.5 rounded-2xl bg-hero-glow px-4 pt-3.5 pb-4 text-on-hero">
      <h2 className="text-[0.8125rem] font-medium text-on-hero/80">{label}</h2>
      <p>{amount}</p>
      {context && <p className="text-[0.8125rem] text-on-hero/80">{context}</p>}
    </section>
  )
}
