import { type ReactNode, useId } from 'react'

// The top of a sheet that makes something with a look: its tile, large, and its name
// centered under it (WAL-01, CAT-01). Missing, it shows the warning only after Save
// is tapped (DL-PAT-02).
export function NameField({
  tile,
  label,
  placeholder,
  value,
  maxLength,
  error,
  onChange,
}: {
  tile: ReactNode
  label: string
  placeholder: string
  value: string
  maxLength: number
  error: string | null
  onChange: (value: string) => void
}) {
  const errorId = useId()
  return (
    <div className="flex flex-col items-center gap-3 pt-1">
      {tile}
      <label className="w-full">
        <span className="sr-only">{label}</span>
        <input
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
          }}
          maxLength={maxLength}
          placeholder={placeholder}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="min-h-12 w-full rounded-xl bg-inset px-3 text-center text-[1.0625rem] font-semibold text-text caret-brand outline-none placeholder:font-normal placeholder:text-text-muted aria-invalid:outline-2 aria-invalid:outline-solid aria-invalid:-outline-offset-2 aria-invalid:outline-warning"
        />
      </label>
      {/* Outside the label, so the field's name stays just its label. */}
      {error && (
        <span
          id={errorId}
          role="alert"
          className="-mt-1.5 block w-full px-4 text-center text-[0.8125rem] text-warning"
        >
          {error}
        </span>
      )}
    </div>
  )
}
