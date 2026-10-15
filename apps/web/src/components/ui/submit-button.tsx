import type { ReactNode, RefObject } from 'react'
import { Button } from './button'
import { CheckIcon } from './icons'
import { SheetFooter } from './sheet'

// DL-CMP-08, DL-PAT-02: a sheet's main action, at the bottom. It stays tappable while
// fields are missing, so tapping it can show which (useSubmit); after a save it turns
// into a check before the sheet slides away (DL-MOT-02, DL-MOT-05).
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
  children: string
  /** Shown above the button, such as an error from saving. */
  before?: ReactNode
  /** A tinted second action to its left, such as "Save & new" (DL-CMP-05). */
  secondary?: ReactNode
}) {
  return (
    <>
      {before}
      <SheetFooter>
        <div className="flex gap-2.5">
          {secondary}
          <Button
            ref={button}
            className="relative flex-1"
            aria-disabled={pending || done || undefined}
            onClick={() => {
              if (!pending && !done) onClick()
            }}
          >
            <span className={done ? 'invisible' : ''}>{children}</span>
            {done && (
              <CheckIcon
                aria-hidden
                weight="bold"
                className="absolute size-6 animate-[check-in_260ms_cubic-bezier(0.32,0.72,0,1)]"
              />
            )}
          </Button>
        </div>
      </SheetFooter>
    </>
  )
}
