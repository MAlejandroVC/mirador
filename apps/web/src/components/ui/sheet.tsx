import { type ReactNode, useId } from 'react'
import { useModal } from './use-modal'
import { useSwipeDown } from './use-swipe-down'

// DL-CMP-08: creating or editing opens a sheet that slides up (DL-MOT-06), with a
// grabber, Cancel at the top left and the title in the middle; the main action goes at
// the bottom, within reach of the thumb. On a phone, swiping it down closes it too. From 768 px it is a centered dialog
// (DL-LAY-06). A native <dialog> keeps focus inside it and closes on Escape.
export function Sheet(props: {
  open: boolean
  title: string
  /** Cancel at the top left, for a sheet that creates or edits something. */
  cancelLabel?: string
  /** Done at the top right instead, for a settings-like or informational sheet. */
  doneLabel?: string
  onClose: () => void
  children: ReactNode
}) {
  const { open, onClose } = props
  const titleId = useId()
  // While it leaves, it keeps its title and content (DL-MOT-06).
  const [ref, shown, handleClose] = useModal(open, props)
  useSwipeDown(ref, onClose)

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
        {/* The bar with Cancel and the title stays put while a long form scrolls. */}
        {/* The bar is also where a swipe down starts, however far the form has scrolled. */}
        <div data-sheet-bar className="sticky top-0 z-10 flex flex-col bg-surface">
          <span aria-hidden className="mx-auto mt-1.5 h-[5px] w-9 rounded-full bg-fill md:hidden" />
          <header className="grid grid-cols-[1fr_auto_1fr] items-center px-2 pt-1">
            {shown?.cancelLabel ? (
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 justify-self-start rounded-xl px-2 text-[1.0625rem] text-brand focus-visible:outline-2 focus-visible:outline-brand"
              >
                {shown.cancelLabel}
              </button>
            ) : (
              <span />
            )}
            <h2 id={titleId} className="text-center text-[1.0625rem] font-semibold">
              {shown?.title}
            </h2>
            {shown?.doneLabel ? (
              // DL-CMP-08: settings-like sheets put Done at the top right.
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 justify-self-end rounded-xl px-2 text-[1.0625rem] font-semibold text-brand focus-visible:outline-2 focus-visible:outline-brand"
              >
                {shown.doneLabel}
              </button>
            ) : (
              <span />
            )}
          </header>
        </div>
        <div className="flex flex-col gap-3 px-4 pt-3">{shown?.children}</div>
      </div>
    </dialog>
  )
}

// DL-CMP-08: the main action at the bottom of a sheet, in reach of the thumb. It stays
// in view while a long form scrolls under it.
export function SheetFooter({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-4 mt-1 mb-[calc(-1*max(1.5rem,env(safe-area-inset-bottom)))] flex flex-col gap-2 bg-surface px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      {children}
    </div>
  )
}
