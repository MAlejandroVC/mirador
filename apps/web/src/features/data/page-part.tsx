import type { Box } from '@repo/import'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import type { PagePicture } from './import-model'

// IMP-40: a statement page, or a part of one, with boxes drawn over what was read.
// Tags sit above their box, outside the picture, so the caller leaves room for them.
// Boxes take `brand`, never a category color (DL-COL-13); one with a problem takes
// `warning` (DL-COL-05); an installment mark is dashed, as it is part of a row's text.

export type BoxTone = 'brand' | 'warning' | 'muted' | 'dashed'

export interface PageBox {
  key: string
  box: Box
  tone: BoxTone
  /** A small tag over its top left corner, such as "Date" or "In Mirador". */
  tag?: string
  /** `end` sets the tag just after the box, for small boxes stacked close together. */
  tagAt?: 'top' | 'end'
  /** Shown stronger, as the one being looked at. */
  strong?: boolean
  onClick?: () => void
  label?: string
}

const tones: Record<BoxTone, string> = {
  brand:
    'border-brand bg-[color-mix(in_srgb,var(--color-brand)_10%,transparent)] [--tag:var(--color-brand)]',
  warning:
    'border-warning bg-[color-mix(in_srgb,var(--color-warning)_12%,transparent)] [--tag:var(--color-warning)]',
  muted: 'border-text-muted bg-transparent [--tag:var(--color-text-muted)]',
  dashed:
    'border-dashed border-brand bg-[color-mix(in_srgb,var(--color-brand)_6%,transparent)] [--tag:var(--color-brand)]',
}

const tagColors: Record<BoxTone, string> = {
  brand: 'var(--color-brand)',
  warning: 'var(--color-warning)',
  muted: 'var(--color-text-muted)',
  dashed: 'var(--color-brand)',
}

export function PagePart({
  image,
  region = { x: 0, y: 0, width: 1, height: 1 },
  boxes = [],
  children,
  className = '',
}: {
  image: PagePicture
  region?: Box
  boxes?: readonly PageBox[]
  children?: ReactNode
  className?: string
}) {
  const { x, y, width, height } = region
  // Tags after their box are stacked so they never cover each other: lines on a page
  // are often closer together than a tag is tall. That needs the drawn height in px.
  const frame = useRef<HTMLDivElement>(null)
  const [drawn, setDrawn] = useState(0)
  useEffect(() => {
    const element = frame.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      setDrawn(element.clientHeight)
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [])
  const tagHeight = 18
  // Tags after their boxes are placed in the order given, most important first, each
  // as close to its line as the ones already placed allow. One that would land more
  // than a tag away from its line is left off, so no tag points at the wrong line.
  const endTags = new Map<string, number>()
  const dropped = new Set<string>()
  const taken: number[] = []
  const free = (top: number) => taken.every((other) => Math.abs(other - top) >= tagHeight + 2)
  for (const item of boxes.filter((box) => box.tag && fitsAfter(box))) {
    const ideal = ((item.box.y + item.box.height / 2 - y) / height) * drawn - tagHeight / 2
    const tries = [
      ideal,
      ...taken.flatMap((other) => [other + tagHeight + 2, other - tagHeight - 2]),
    ]
      .filter((top) => Math.abs(top - ideal) <= tagHeight && free(top))
      .sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal))
    const [top] = tries
    if (top === undefined) dropped.add(item.key)
    else {
      endTags.set(item.key, top)
      taken.push(top)
    }
  }
  function fitsAfter(item: PageBox) {
    return item.tagAt === 'end' && item.box.x + item.box.width < x + width * 0.7
  }
  // Inside the region, a box's place is its share of the region.
  const place = (box: Box) => ({
    left: `${String(((box.x - x) / width) * 100)}%`,
    top: `${String(((box.y - y) / height) * 100)}%`,
    width: `${String((box.width / width) * 100)}%`,
    height: `${String((box.height / height) * 100)}%`,
  })
  return (
    <div
      ref={frame}
      className={`relative w-full rounded-lg bg-surface bg-no-repeat ${className}`}
      style={{
        backgroundImage: `url(${image.url})`,
        backgroundSize: `${String(100 / width)}% auto`,
        backgroundPosition: `${String(width >= 1 ? 0 : (x / (1 - width)) * 100)}% ${String(height >= 1 ? 0 : (y / (1 - height)) * 100)}%`,
        aspectRatio: String((width * image.width) / Math.max(1, height * image.height)),
      }}
    >
      {boxes.map((item) => {
        const style = place(item.box)
        const look = `absolute rounded-[3px] border-[1.5px] ${tones[item.tone]} ${item.strong ? 'border-2 shadow-[0_0_0_3px_color-mix(in_srgb,var(--tag)_22%,transparent)]' : ''}`
        // A box on the right half takes its tag on its right edge, so it stays on the page.
        const right = item.box.x + item.box.width / 2 > x + width * 0.6
        const tag = item.tag && !endTags.has(item.key) && !dropped.has(item.key) && (
          <span
            className={`pointer-events-none absolute -top-[1.15rem] bg-(--tag) px-1 text-[0.625rem] leading-[1.125rem] font-semibold whitespace-nowrap text-on-brand ${
              right
                ? 'right-[-1.5px] rounded-t-[4px] rounded-bl-[4px]'
                : 'left-[-1.5px] rounded-t-[4px] rounded-br-[4px]'
            }`}
          >
            {item.tag}
          </span>
        )
        return item.onClick ? (
          <button
            key={item.key}
            type="button"
            aria-label={item.label ?? item.tag}
            onClick={item.onClick}
            className={`${look} focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand`}
            style={style}
          >
            {tag}
          </button>
        ) : (
          <span key={item.key} aria-hidden className={look} style={style}>
            {tag}
          </span>
        )
      })}
      {boxes.map((item) => {
        const top = endTags.get(item.key)
        return top === undefined ? null : (
          <span
            key={`${item.key}-tag`}
            aria-hidden
            className={`pointer-events-none absolute rounded-[4px] px-1 text-[0.625rem] leading-[1.125rem] font-semibold whitespace-nowrap text-on-brand`}
            style={{
              left: `calc(${String(((item.box.x + item.box.width - x) / width) * 100)}% + 4px)`,
              top: `${String(top)}px`,
              backgroundColor: tagColors[item.tone],
            }}
          >
            {item.tag}
          </span>
        )
      })}
      {children}
    </div>
  )
}
