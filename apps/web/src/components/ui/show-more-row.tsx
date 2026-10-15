import { CaretRightIcon } from './icons'

// DL-CMP-15: the last row of a list that shows only some of its options: "Show all …"
// in `brand` with a chevron pointing down, and "Show fewer" once open.
export function ShowMoreRow({
  open,
  more,
  less,
  separator,
  onToggle,
}: {
  open: boolean
  more: string
  less: string
  /** Whether a row in view sits above it. */
  separator: boolean
  onToggle: () => void
}) {
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-h-11 w-full items-center gap-2 pl-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
      >
        <span
          className={`flex min-h-11 flex-1 items-center gap-2 self-stretch border-separator pr-4 ${separator ? 'border-t-[0.5px]' : ''}`}
        >
          <span className="flex-1 text-[0.9375rem] text-brand">{open ? less : more}</span>
          {/* DL-MOT-07: the chevron turns with the list. */}
          <CaretRightIcon
            aria-hidden
            className={`size-4 text-text-faint transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${open ? '-rotate-90' : 'rotate-90'}`}
          />
        </span>
      </button>
    </li>
  )
}
