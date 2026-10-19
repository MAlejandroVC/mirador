import type { MoneyParts } from '@repo/core'

// DL-NUM-01, DL-NUM-02, DL-TYP-02: an amount in tabular numerals with its cents set
// smaller in the muted color; the hero amount sets its currency symbol that way too.
// `hero` is the one large amount a screen exists to show (DL-TYP-03: 46 px, its sign
// and cents 23 px). A screen reader hears it as one number (`label`).
export function Amount({
  parts,
  label,
  size = 'body',
  tone = 'text',
}: {
  parts: MoneyParts
  label: string
  /** `figure` is the answer on a question tile: larger than a list, quieter than the hero. */
  size?: 'body' | 'figure' | 'hero'
  /**
   * `hero` for an amount on the hero card, which takes `on-hero` (DL-CMP-01); `muted`
   * for money that only moved between the person's own wallets (DL-NUM-03).
   */
  tone?: 'text' | 'hero' | 'moss' | 'muted'
}) {
  const small =
    size === 'hero'
      ? 'text-[1.4375rem] font-medium'
      : size === 'figure'
        ? 'text-[0.875rem] font-medium'
        : 'text-[0.8125rem]'
  const muted =
    tone === 'hero' ? 'text-on-hero/75' : tone === 'moss' ? 'text-moss' : 'text-text-muted'
  const main =
    tone === 'hero'
      ? 'text-on-hero'
      : tone === 'moss'
        ? 'text-moss'
        : tone === 'muted'
          ? 'text-text-muted'
          : 'text-text'
  return (
    <span
      className={`whitespace-nowrap tabular-nums ${
        size === 'hero'
          ? 'text-[2.875rem] leading-none font-semibold tracking-[-0.03em]'
          : size === 'figure'
            ? 'text-[1.375rem] leading-tight font-semibold tracking-[-0.01em]'
            : 'text-[0.9375rem]'
      } ${main}`}
    >
      <span className="sr-only">{label}</span>
      <span aria-hidden>
        {/* The minus keeps the full size: it says the amount is owed (DL-A11Y-03). */}
        {parts.sign}
        {size === 'hero' && parts.prefix ? (
          <span className={`${small} ${muted}`}>{parts.prefix}</span>
        ) : (
          parts.prefix
        )}
        {parts.whole}
        {(parts.cents || parts.suffix) && (
          <span className={`${small} ${muted}`}>
            {parts.cents}
            {parts.suffix}
          </span>
        )}
      </span>
    </span>
  )
}
