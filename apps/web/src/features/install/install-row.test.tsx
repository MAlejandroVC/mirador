import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../lib/i18n'
import { InstallRow } from './install-row'

const iPhone =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const mac =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'

function device(userAgent: string, { standalone = false } = {}) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: standalone && query === '(display-mode: standalone)',
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('add to Home Screen', () => {
  it('SYS-20: shows the steps on an iPhone, where Safari has no install dialog', async () => {
    const user = userEvent.setup()
    device(iPhone)
    render(<InstallRow />)

    await user.click(screen.getByRole('button', { name: /Add to Home Screen/ }))

    const steps = within(screen.getByRole('dialog'))
      .getAllByRole('listitem')
      .map((step) => step.textContent)
    expect(steps).toEqual([
      "1Tap Share in the browser's toolbar",
      '2Scroll down and tap Add to Home Screen',
      '3Tap Add',
    ])
  })

  it('SYS-20: is hidden once Mirador runs from the Home Screen, and on a computer', () => {
    device(iPhone, { standalone: true })
    const { unmount } = render(<InstallRow />)
    expect(screen.queryByRole('button', { name: /Add to Home Screen/ })).not.toBeInTheDocument()
    unmount()

    device(mac)
    render(<InstallRow />)
    expect(screen.queryByRole('button', { name: /Add to Home Screen/ })).not.toBeInTheDocument()
  })

  it("SYS-20: opens the browser's own install dialog where it has one", async () => {
    const user = userEvent.setup()
    device(mac)
    render(<InstallRow />)
    const prompt = vi.fn(() => Promise.resolve())
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    })
    act(() => {
      window.dispatchEvent(event)
    })

    await user.click(screen.getByRole('button', { name: /Add to Home Screen/ }))

    expect(event.defaultPrevented).toBe(true)
    expect(prompt).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
