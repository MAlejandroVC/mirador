// DL-CMP-11: two to five equal options that switch a mode, as in iOS. Each option is a
// toggle button, so screen readers say which one is on.
export function SegmentedControl<Value extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly { value: Value; label: string }[]
  value: Value
  onChange: (value: Value) => void
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-0.5 rounded-[0.5625rem] bg-fill p-0.5">
      {options.map((option) => {
        const on = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => {
              onChange(option.value)
            }}
            className={`min-h-11 flex-1 rounded-[0.4375rem] text-[0.8125rem] font-medium text-text focus-visible:outline-2 focus-visible:outline-brand ${
              on ? 'bg-thumb shadow-[0_1px_3px_rgb(0_0_0/18%)]' : ''
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
