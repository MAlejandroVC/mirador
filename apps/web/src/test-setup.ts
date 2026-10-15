import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)

// jsdom has no modal dialogs yet; enough of one for the sheets (DL-CMP-08).
if (typeof HTMLDialogElement !== 'undefined' && !('showModal' in HTMLDialogElement.prototype)) {
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '')
    },
    close(this: HTMLDialogElement) {
      this.removeAttribute('open')
      this.dispatchEvent(new Event('close'))
    },
  })
}

// jsdom has no media queries; answer as a light-mode device that asks for less motion,
// so every change happens at once, as with animations off (DL-MOT-04).
if (typeof window !== 'undefined' && typeof (window.matchMedia as unknown) !== 'function') {
  Object.assign(window, {
    matchMedia: (query: string) => ({
      matches: query.includes('prefers-reduced-motion: reduce'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  })
}
