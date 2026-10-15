import { useId } from 'react'
import { useModal } from './use-modal'

export interface Action {
  label: string
  onSelect: () => void
  /** `danger` only for what deletes (DL-COL-07). */
  tone?: 'brand' | 'danger'
}

// DL-CMP-12: confirms a destructive step. It slides up, states the consequence in one
// sentence and offers the actions, with Cancel set apart below them, as in iOS.
export function ActionSheet(props: {
  open: boolean
  title: string
  message: string
  actions: Action[]
  cancelLabel: string
  onClose: () => void
}) {
  const { open, onClose } = props
  const titleId = useId()
  const messageId = useId()
  // While it leaves, it keeps saying what it said (DL-MOT-06).
  const [ref, shown, handleClose] = useModal(open, props)

  const option =
    'min-h-14 w-full border-t-[0.5px] border-separator px-4 text-[1.0625rem] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand'

  const content = shown && (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-[0.875rem] bg-surface text-center">
        <div className="flex flex-col gap-1 px-4 py-3.5">
          <h2 id={titleId} className="text-[0.8125rem] font-semibold text-text-muted">
            {shown.title}
          </h2>
          <p id={messageId} className="text-[0.8125rem] text-text-muted">
            {shown.message}
          </p>
        </div>
        {shown.actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onSelect}
            className={`${option} ${action.tone === 'danger' ? 'text-danger' : 'text-brand'}`}
          >
            {action.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="min-h-14 w-full rounded-[0.875rem] bg-surface text-[1.0625rem] font-semibold text-brand focus-visible:outline-2 focus-visible:outline-brand"
      >
        {shown.cancelLabel}
      </button>
    </div>
  )

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={messageId}
      onClose={(event) => {
        handleClose(event, onClose)
      }}
      // React passes a nested sheet's cancel event up to this one; only its own counts.
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="sheet m-0 mt-auto w-full max-w-none bg-transparent p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:m-auto md:max-w-[22rem]"
    >
      {content}
    </dialog>
  )
}
