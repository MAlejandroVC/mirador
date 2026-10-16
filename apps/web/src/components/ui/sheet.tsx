import { type ReactNode, useId, useState } from 'react'
import { CheckIcon, XIcon } from './icons'
import { roundButton, SheetActionSlot } from './sheet-action'
import { useModal } from './use-modal'
import { useSwipeDown } from './use-swipe-down'

// DL-CMP-08: creating or editing opens a sheet that slides up (DL-MOT-06), with a
// grabber, a round close button (X) at the top left, the title in the middle and the
// main action as a round check at the top right, as in iOS. The bar stays in view above
// the keyboard and while a long form scrolls. On a phone, swiping it down closes it
// too. From 768 px it is a centered dialog (DL-LAY-06). A native <dialog> keeps focus
// inside it and closes on Escape.
export function Sheet(props: {
  open: boolean
  title: string
  /** The X at the top left, for a sheet that creates or edits something; its name. */
  cancelLabel?: string
  /** A check at the top right that only closes, for a settings-like sheet; its name. */
  doneLabel?: string
  onClose: () => void
  children: ReactNode
}) {
  const { open, onClose } = props
  const titleId = useId()
  // While it leaves, it keeps its title and content (DL-MOT-06).
  const [ref, shown, handleClose] = useModal(open, props)
  useSwipeDown(ref, onClose)
  const [slot, setSlot] = useState<HTMLElement | null>(null)

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={(event) => {
        handleClose(event, onClose)
      }}
      // React passes a nested sheet's cancel event up to this one; only its own counts.
      // Escape asks the screen, which may first ask to discard changes (DL-CMP-08).
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        onClose()
      }}
      // A tap on the dimmed background closes it, like a swipe down.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="sheet m-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-[1.375rem] bg-surface p-0 text-text shadow-[0_-8px_32px_rgb(0_0_0/18%)] md:m-auto md:max-w-[33.75rem] md:rounded-[1.375rem]"
    >
      <div className="flex flex-col pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {/* The bar stays put while a long form scrolls, and a swipe down can start on
            it however far the form has scrolled. */}
        <div data-sheet-bar className="sticky top-0 z-10 flex flex-col bg-surface">
          <span aria-hidden className="mx-auto mt-1.5 h-[5px] w-9 rounded-full bg-fill md:hidden" />
          <header className="grid grid-cols-[2.75rem_1fr_2.75rem] items-center gap-2 px-3 pt-1.5 pb-1 md:pt-3">
            {shown?.cancelLabel ? (
              <button
                type="button"
                aria-label={shown.cancelLabel}
                onClick={onClose}
                className={`${roundButton} bg-fill text-text`}
              >
                <XIcon aria-hidden weight="bold" className="size-[1.125rem]" />
              </button>
            ) : (
              <span />
            )}
            <h2 id={titleId} className="truncate text-center text-[1.0625rem] font-semibold">
              {shown?.title}
            </h2>
            {shown?.doneLabel ? (
              // DL-CMP-08: a settings-like sheet only closes, with the same check.
              <button
                type="button"
                aria-label={shown.doneLabel}
                onClick={onClose}
                className={`${roundButton} bg-brand text-on-brand`}
              >
                <CheckIcon aria-hidden weight="bold" className="size-5" />
              </button>
            ) : (
              <span ref={setSlot} className="contents" />
            )}
          </header>
        </div>
        <SheetActionSlot value={slot}>
          <div className="flex flex-col gap-3 px-4 pt-3">{shown?.children}</div>
        </SheetActionSlot>
      </div>
    </dialog>
  )
}
