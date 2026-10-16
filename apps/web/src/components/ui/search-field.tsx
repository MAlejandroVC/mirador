import { MagnifyingGlassIcon, XIcon } from './icons'

// A search box at the top of a long picker (CAT-12), as in iOS: a magnifying glass,
// the query and a clear button once something is typed.
export function SearchField({
  label,
  clearLabel,
  value,
  onChange,
  autoFocus,
}: {
  label: string
  clearLabel: string
  value: string
  onChange: (value: string) => void
  autoFocus?: boolean
}) {
  return (
    <label className="flex min-h-11 items-center gap-2 rounded-xl bg-fill px-3">
      <MagnifyingGlassIcon aria-hidden className="size-[1.125rem] shrink-0 text-text-muted" />
      <span className="sr-only">{label}</span>
      <input
        type="search"
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
        }}
        placeholder={label}
        autoComplete="off"
        autoFocus={autoFocus}
        enterKeyHint="search"
        className="min-h-11 min-w-0 flex-1 bg-transparent text-[1.0625rem] text-text caret-brand outline-none placeholder:text-text-muted [&::-webkit-search-cancel-button]:hidden"
      />
      {value !== '' && (
        <button
          type="button"
          aria-label={clearLabel}
          onClick={() => {
            onChange('')
          }}
          className="-mr-2 grid size-11 shrink-0 place-items-center text-text-muted focus-visible:outline-2 focus-visible:outline-brand"
        >
          <XIcon aria-hidden weight="bold" className="size-4" />
        </button>
      )}
    </label>
  )
}
