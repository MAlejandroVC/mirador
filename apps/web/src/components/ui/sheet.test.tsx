import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../lib/i18n'
import { ChoiceRow } from './choice-row'
import { Sheet } from './sheet'

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

// jsdom has no Touch, so the events carry plain points.
function touch(target: Element, type: string, y: number, x = 100) {
  const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
    touches: type === 'touchend' ? [] : [{ clientX: x, clientY: y }],
  })
  fireEvent(target, event)
  return event
}

function Editor({ dirty = false }: { dirty?: boolean }) {
  const [open, setOpen] = useState(true)
  const [asked, setAsked] = useState(false)
  return (
    <>
      {asked && <p>Discard changes?</p>}
      <Sheet
        open={open}
        title="New expense"
        cancelLabel="Cancel"
        onClose={() => {
          if (dirty) setAsked(true)
          else setOpen(false)
        }}
      >
        <p>Amount</p>
      </Sheet>
    </>
  )
}

describe('sheet', () => {
  it('DL-CMP-08: swiping a sheet down closes it', () => {
    render(<Editor />)
    const sheet = screen.getByRole('dialog', { name: 'New expense' })
    const content = screen.getByText('Amount')
    touch(content, 'touchstart', 100)
    expect(touch(content, 'touchmove', 140).defaultPrevented).toBe(true)
    touch(content, 'touchmove', 300)
    touch(content, 'touchend', 300)
    expect(sheet).not.toHaveAttribute('open')
  })

  it('DL-CMP-08: a sheet with unsaved changes asks first instead of closing', () => {
    render(<Editor dirty />)
    const sheet = screen.getByRole('dialog', { name: 'New expense' })
    const title = screen.getByRole('heading', { name: 'New expense' })
    touch(title, 'touchstart', 100)
    touch(title, 'touchmove', 300)
    touch(title, 'touchend', 300)
    expect(screen.getByText('Discard changes?')).toBeInTheDocument()
    expect(sheet).toHaveAttribute('open')
  })

  it('DL-CMP-08: a pull up or sideways is a scroll, not a swipe to close', () => {
    render(<Editor />)
    const sheet = screen.getByRole('dialog', { name: 'New expense' })
    const content = screen.getByText('Amount')
    touch(content, 'touchstart', 300)
    expect(touch(content, 'touchmove', 200).defaultPrevented).toBe(false)
    touch(content, 'touchend', 200)
    touch(content, 'touchstart', 100, 100)
    expect(touch(content, 'touchmove', 120, 200).defaultPrevented).toBe(false)
    touch(content, 'touchend', 120)
    expect(sheet).toHaveAttribute('open')
  })
})

describe('choice row', () => {
  it('DL-CMP-10: a single option that is on or off is a switch', () => {
    function Excluded() {
      const [on, setOn] = useState(false)
      return (
        <ul>
          <ChoiceRow
            role="switch"
            title="Leave out of the budget"
            checked={on}
            onToggle={() => {
              setOn(!on)
            }}
          />
        </ul>
      )
    }
    render(<Excluded />)
    const toggle = screen.getByRole('switch', { name: 'Leave out of the budget' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })
})
