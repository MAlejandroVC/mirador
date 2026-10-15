// The motion every screen shares (DL-MOT-05 to DL-MOT-07). CSS runs what it can; what has
// to outlive an element, such as a sheet sliding away after it has closed, runs here
// with the Web Animations API, and does nothing where that is missing.

/** The system's spring curve, used for everything that moves into place. */
export const ease = 'cubic-bezier(0.32, 0.72, 0, 1)'

/** DL-MOT-04, DL-A11Y-08: less motion when the device asks for it. */
export function reduceMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const wide = () => window.matchMedia('(min-width: 768px)').matches

/**
 * DL-MOT-06: a sheet slides away (fades on wide screens) after it has closed. The dialog
 * itself closes at once, so the screen under it answers the next tap straight away
 * (DL-MOT-03), and a copy of it plays the way out. A sheet closed by its Save button
 * slides away a little slower, as part of the save sequence (DL-MOT-05).
 */
export function leave(dialog: HTMLDialogElement) {
  const saved = dialog.dataset.exit === 'save'
  delete dialog.dataset.exit
  if (typeof dialog.animate !== 'function') return
  const rect = dialog.getBoundingClientRect()
  const ghost = document.createElement('div')
  ghost.className = `${dialog.className} sheet-ghost`
  ghost.setAttribute('aria-hidden', 'true')
  ghost.inert = true
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${String(rect.left)}px`,
    top: `${String(rect.top)}px`,
    width: `${String(rect.width)}px`,
    height: `${String(rect.height)}px`,
    margin: '0',
    maxWidth: 'none',
    maxHeight: 'none',
    overflow: 'hidden',
    pointerEvents: 'none',
  })
  for (const child of Array.from(dialog.childNodes)) ghost.append(child.cloneNode(true))
  // Sheets opened from this one, and copies of ones already leaving, go with it unseen.
  for (const inner of Array.from(
    ghost.querySelectorAll('dialog, .sheet-ghost, .sheet-ghost-backdrop'),
  ))
    inner.remove()
  const backdrop = document.createElement('div')
  backdrop.className = 'sheet-ghost-backdrop'
  // A sheet opened over another one leaves over it, so the copy goes inside the dialog
  // that stays open: the top layer covers anything outside it.
  const host =
    Array.from(document.querySelectorAll('dialog[open]'))
      .filter((each) => each !== dialog)
      .at(-1) ?? document.body
  host.append(backdrop, ghost)
  ghost.scrollTop = dialog.scrollTop

  const duration = reduceMotion() ? 200 : wide() ? 150 : saved ? 420 : 350
  const frames: Keyframe[] = reduceMotion()
    ? [{ opacity: 1 }, { opacity: 0 }]
    : wide()
      ? [
          { opacity: 1, scale: '1' },
          { opacity: 0, scale: '0.96' },
        ]
      : [{ translate: '0 0' }, { translate: '0 100%' }]
  const easing = wide() || reduceMotion() ? 'ease-in' : ease
  const out = ghost.animate(frames, { duration, easing, fill: 'forwards' })
  backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing, fill: 'forwards' })
  const remove = () => {
    ghost.remove()
    backdrop.remove()
  }
  out.finished.then(remove, remove)
}

/** DL-MOT-07: a quick sideways shake on each field that still needs filling in. */
export function shake(root: Element | null | undefined) {
  if (!root || reduceMotion()) return
  for (const field of Array.from(root.querySelectorAll('[aria-invalid="true"]'))) {
    const row = field.closest('li') ?? field
    if (typeof row.animate !== 'function') continue
    row.animate(
      [
        { translate: '0' },
        { translate: '-6px' },
        { translate: '6px' },
        { translate: '-4px' },
        { translate: '3px' },
        { translate: '0' },
      ],
      { duration: 300, easing: 'ease-out' },
    )
  }
}

// DL-MOT-02: a row that was just saved opens into its list with a highlight. The save
// marks its id; the row asks once, when it first appears.
const fresh = new Map<string, number>()

export function markNew(id: string) {
  fresh.set(id, Date.now())
}

/** Whether the row was saved in the last moment, so it should open with a highlight. */
export function isNew(id: string) {
  const at = fresh.get(id)
  return at !== undefined && Date.now() - at < 2000
}
