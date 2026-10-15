// DL-CMP-11: two to five equal options that switch a mode, as in iOS. Each option is a
// toggle button, so screen readers say which one is on. The thumb under the selected
// option slides to the one tapped (DL-MOT-07).
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
  const index = options.findIndex((option) => option.value === value)
  const count = options.length
  return (
    <div
      role="group"
      aria-label={label}
      className="relative flex gap-0.5 rounded-[0.5625rem] bg-fill p-0.5"
    >
      {index >= 0 && (
        <span
          aria-hidden
          className="absolute top-0.5 bottom-0.5 left-0.5 rounded-[0.4375rem] bg-thumb shadow-[0_1px_3px_rgb(0_0_0/18%)] transition-transform duration-250 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
          style={{
            // Equal widths, with the 2 px gaps between options left out.
            width: `calc((100% - 4px - ${String((count - 1) * 2)}px) / ${String(count)})`,
            transform: `translateX(calc(${String(index)} * (100% + 2px)))`,
          }}
        />
      )}
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
            className="relative min-h-11 flex-1 rounded-[0.4375rem] text-[0.8125rem] font-medium text-text focus-visible:outline-2 focus-visible:outline-brand"
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
