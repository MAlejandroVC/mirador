import { type ReactNode, useEffect, useRef } from 'react'

// DL-CMP-08: creating or editing opens a sheet that slides up (DL-MOT-06), with a
// grabber, Cancel at the top left and the title in the middle; the main action goes at
// the bottom, within reach of the thumb. From 768 px it is a centered dialog
// (DL-LAY-06). A native <dialog> keeps focus inside it and closes on Escape.
export function Sheet({
  open,
  title,
  cancelLabel,
  onClose,
  children,
}: {
  open: boolean
  title: string
  cancelLabel: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby="sheet-title"
      onClose={onClose}
      // A tap on the dimmed background closes it, like a swipe down.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="sheet m-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-[1.375rem] bg-surface p-0 text-text shadow-[0_-8px_32px_rgb(0_0_0/18%)] md:m-auto md:max-w-[33.75rem] md:rounded-[1.375rem]"
    >
      <div className="flex flex-col pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <span aria-hidden className="mx-auto mt-1.5 h-[5px] w-9 rounded-full bg-fill md:hidden" />
        <header className="grid grid-cols-[1fr_auto_1fr] items-center px-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 justify-self-start rounded-xl px-2 text-[1.0625rem] text-brand focus-visible:outline-2 focus-visible:outline-brand"
          >
            {cancelLabel}
          </button>
          <h2 id="sheet-title" className="text-[1.0625rem] font-semibold">
            {title}
          </h2>
          <span />
        </header>
        <div className="flex flex-col gap-3 px-4 pt-3">{children}</div>
      </div>
    </dialog>
  )
}
