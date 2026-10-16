import { type ReactNode, type RefObject, use } from 'react'
import { createPortal } from 'react-dom'
import { CheckIcon } from './icons'
import { roundButton, SheetActionSlot } from './sheet-action'

// DL-CMP-08, DL-PAT-02: a sheet's main action, the round check at the top right of its
// bar, where it stays in view above the keyboard. It stays tappable while fields are
// missing, so tapping it can show which (useSubmit); after a save the check pops before
// the sheet slides away (DL-MOT-02, DL-MOT-05). Anything else, such as an error from
// saving or a second action like "Save & new", sits at the end of the form.
export function SubmitButton({
  button,
  done,
  pending,
  onClick,
  children,
  before,
  secondary,
}: {
  button: RefObject<HTMLButtonElement | null>
  done: boolean
  pending: boolean
  onClick: () => void
  /** The action's name, such as "Save", read out by screen readers. */
  children: string
  /** Shown at the end of the form, such as an error from saving. */
  before?: ReactNode
  /** A tinted second action at the end of the form, such as "Save & new" (DL-CMP-05). */
  secondary?: ReactNode
}) {
  const slot = use(SheetActionSlot)
  const action = (
    <button
      ref={button}
      type="button"
      aria-label={children}
      aria-disabled={pending || done || undefined}
      onClick={() => {
        if (!pending && !done) onClick()
      }}
      className={`${roundButton} bg-brand text-on-brand ${pending ? 'opacity-60' : ''}`}
    >
      <CheckIcon
        // A new check on a good save, so it pops in again (DL-MOT-05).
        key={done ? 'done' : 'ready'}
        aria-hidden
        weight="bold"
        className={`size-5 ${done ? 'animate-[check-in_260ms_cubic-bezier(0.32,0.72,0,1)]' : ''}`}
      />
    </button>
  )
  return (
    <>
      {slot && createPortal(action, slot)}
      {before}
      {secondary && <div className="mt-1 flex gap-2.5">{secondary}</div>}
    </>
  )
}
