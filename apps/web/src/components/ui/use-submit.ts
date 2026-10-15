import { useEffect, useRef, useState } from 'react'
import { reduceMotion, shake } from '../../lib/motion'

/**
 * DL-PAT-02: a form checks its required fields only when the person taps its main
 * button. With one missing, the button does nothing but shake the fields still to fill
 * in, now outlined in `warning`; from then on they clear as they are filled. A good save
 * plays the save sequence: the button turns into a check, then the sheet slides away
 * (DL-MOT-02).
 */
export function useSubmit() {
  const button = useRef<HTMLButtonElement>(null)
  const [tries, setTries] = useState(0)
  const [done, setDone] = useState(false)

  // Shake once the missing fields are marked, and put the caret in the first one.
  useEffect(() => {
    if (tries === 0) return
    const form = button.current?.closest('dialog') ?? null
    shake(form)
    const first = form?.querySelector<HTMLElement>('input[aria-invalid="true"]')
    first?.focus()
  }, [tries])

  return {
    /** Whether Save was tapped with something missing, so missing fields show it. */
    tried: tries > 0,
    button,
    done,
    /** Runs `save` when the form is complete; otherwise points at what's missing. */
    submit(complete: boolean, save: () => void) {
      if (complete) save()
      else setTries((count) => count + 1)
    },
    /** After a save: the check, then `close` slides the sheet away (DL-MOT-05). */
    finish(close: () => void) {
      const dialog = button.current?.closest('dialog')
      if (reduceMotion()) {
        close()
        return
      }
      setDone(true)
      setTimeout(() => {
        if (dialog) dialog.dataset.exit = 'save'
        close()
      }, 260)
    },
  }
}
