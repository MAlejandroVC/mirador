import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { amountTip, columnAt, nearestPoint } from './chart-pointer'
import { type Column, ColumnChart } from './charts'

// jsdom has no Touch, so the events carry plain points.
function touch(target: Element, type: string, x = 0, y = 10) {
  const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
    touches: type === 'touchend' ? [] : [{ clientX: x, clientY: y }],
  })
  fireEvent(target, event)
  return event
}

const columns: Column[] = ['Aug', 'Sep', 'Oct'].map((label, index) => ({
  key: label,
  label,
  value: (index + 1) * 10_000,
  description: `${label}: $${String((index + 1) * 100)}.00`,
}))

function Chart({ onSelect }: { onSelect: (column: Column) => void }) {
  return (
    <ColumnChart
      columns={columns}
      onSelect={onSelect}
      tip={(column) => amountTip(`${column.label} 2026`, `$${String(column.value / 100)}.00`)}
    />
  )
}

/** The element the chart listens on: the one holding its columns. */
const plot = () => screen.getByRole('button', { name: 'Aug: $100.00' }).parentElement as Element

describe('chart callouts', () => {
  beforeEach(() => {
    // jsdom lays nothing out; the chart is 300 px wide, 100 px per column.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 300, 112),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('DL-VIZ-05: the point under the pointer is the nearest one on a line, or the column under it', () => {
    const box = new DOMRect(0, 0, 300, 100)
    expect(nearestPoint(0, box, 31)).toBe(0)
    expect(nearestPoint(140, box, 31)).toBe(14)
    expect(columnAt(250, box, 3)).toBe(2)
    // A finger dragged past the chart stays on its first or last point.
    expect(nearestPoint(400, box, 31)).toBe(30)
    expect(columnAt(-5, box, 3)).toBe(0)
  })

  it('DL-VIZ-05: on a computer the callout follows the mouse, and a click still opens the column', () => {
    const onSelect = vi.fn()
    render(<Chart onSelect={onSelect} />)

    fireEvent.pointerMove(plot(), { clientX: 250, clientY: 50 })
    expect(screen.getByText('Oct 2026')).toBeVisible()
    expect(screen.getByText('$300.00')).toBeVisible()
    fireEvent.pointerMove(plot(), { clientX: 120, clientY: 50 })
    expect(screen.getByText('Sep 2026')).toBeVisible()
    expect(screen.queryByText('Oct 2026')).toBeNull()
    fireEvent.pointerLeave(plot())
    expect(screen.queryByText('Sep 2026')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Oct: $300.00' }))
    expect(onSelect).toHaveBeenCalledWith(columns[2])
  })

  it('DL-VIZ-05: on a phone a touch and hold shows the callout and follows the finger; a tap still opens the column', () => {
    vi.useFakeTimers()
    const onSelect = vi.fn()
    render(<Chart onSelect={onSelect} />)

    // A quick tap shows nothing and is left to open the column.
    touch(plot(), 'touchstart', 250)
    expect(touch(plot(), 'touchend').defaultPrevented).toBe(false)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.queryByText('Oct 2026')).toBeNull()

    // Holding shows the callout, dragging moves it, and lifting the finger hides it
    // without the lift counting as a tap on the column.
    touch(plot(), 'touchstart', 50)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(screen.getByText('Aug 2026')).toBeVisible()
    expect(touch(plot(), 'touchmove', 250).defaultPrevented).toBe(true)
    expect(screen.getByText('Oct 2026')).toBeVisible()
    expect(touch(plot(), 'touchend').defaultPrevented).toBe(true)
    expect(screen.queryByText('Oct 2026')).toBeNull()
  })

  it('DL-VIZ-05: a finger that moves before the hold is scrolling the page, so no callout shows', () => {
    vi.useFakeTimers()
    render(<Chart onSelect={vi.fn()} />)

    touch(plot(), 'touchstart', 50, 10)
    const scroll = touch(plot(), 'touchmove', 52, 40)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(scroll.defaultPrevented).toBe(false)
    expect(screen.queryByText('Aug 2026')).toBeNull()
  })
})
