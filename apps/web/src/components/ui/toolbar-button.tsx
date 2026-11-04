import type { Icon } from './icons'

/** A round toolbar button beside the large title; filled in `brand` while it is on. */
export function ToolbarButton({
  icon: IconComponent,
  label,
  active,
  onClick,
}: {
  icon: Icon
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`grid size-11 shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-brand ${
        active ? 'bg-brand text-on-brand' : 'bg-surface text-brand'
      }`}
    >
      <IconComponent aria-hidden weight={active ? 'fill' : 'regular'} className="size-[1.25rem]" />
    </button>
  )
}
