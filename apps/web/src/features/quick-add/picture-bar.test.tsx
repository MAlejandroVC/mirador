import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../lib/i18n'
import { PictureBar, type PictureState } from './picture-bar'

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

const state = (over: Partial<PictureState> = {}): PictureState => ({
  phase: 'idle',
  unsure: [],
  thumb: null,
  version: 0,
  onPick: () => undefined,
  ...over,
})

describe('PictureBar', () => {
  it('WID-02, WID-04: offers the camera and the photo library, and reads the picture chosen', () => {
    const onPick = vi.fn()
    const { container } = render(<PictureBar picture={state({ onPick })} />)
    expect(screen.getByRole('button', { name: 'Take a picture' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Choose a picture' })).toBeTruthy()
    const camera = container.querySelector('input[capture="environment"]')
    expect(camera).toBeTruthy()
    const file = new File(['x'], 'ticket.jpg', { type: 'image/jpeg' })
    fireEvent.change(camera!, { target: { files: [file] } })
    expect(onPick).toHaveBeenCalledWith(file)
  })

  it('SEC-05: says the picture is read privately while it is read', () => {
    render(<PictureBar picture={state({ phase: 'reading' })} />)
    expect(screen.getByRole('status').textContent).toContain('forgets it right away')
  })

  it('IMP-10: asks to check an amount that was hard to read', () => {
    render(<PictureBar picture={state({ phase: 'filled', unsure: ['amount'] })} />)
    expect(screen.getByText('Hard to read. Check the amount.')).toBeTruthy()
  })
})
