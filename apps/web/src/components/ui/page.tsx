import { CaretLeftIcon } from './icons'
import { type ReactNode, useEffect, useRef, useState } from 'react'

// DL-CMP-06: every screen in the app opens with a large title. Once the page scrolls,
// the title shrinks into the bar at the top, centered. A screen reached from another
// passes `back`; a tab passes its actions (at most two) instead. A screen the sidebar
// lists, like Settings, hides `back` once the sidebar shows (DL-LAY-06).
export function Page({
  title,
  back,
  actions,
  children,
}: {
  title: string
  back?: { label: string; onClick: () => void; hideWithSidebar?: boolean }
  actions?: ReactNode
  children?: ReactNode
}) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  const scrolled = useScrolledPast(titleRef)

  return (
    <div className="flex flex-col">
      {/* DL-SHP-01: a solid bar, no blur. The hairline appears only once content
          slides under it, as in iOS. */}
      <div
        className={`sticky top-0 z-10 bg-background pt-[env(safe-area-inset-top)] ${
          scrolled ? 'shadow-[0_0.5px_0_var(--color-separator)]' : ''
        }`}
      >
        <div className="mx-auto grid h-11 w-full max-w-(--page-width) grid-cols-[1fr_auto_1fr] items-center px-2">
          <div className="flex justify-start">
            {back && (
              <button
                type="button"
                onClick={back.onClick}
                className={`flex min-h-11 items-center gap-0.5 rounded-xl pr-2 ${back.hideWithSidebar ? 'lg:hidden' : ''} text-[1.0625rem] text-brand focus-visible:outline-2 focus-visible:outline-brand`}
              >
                <CaretLeftIcon aria-hidden className="size-6" />
                {back.label}
              </button>
            )}
          </div>
          <p
            aria-hidden
            className={`truncate text-[1.0625rem] font-semibold text-text transition-opacity duration-200 motion-reduce:transition-none ${
              scrolled ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {title}
          </p>
          <div className="flex justify-end gap-1">{actions}</div>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-(--page-width) flex-col gap-3 px-4">
        {/* DL-TYP-03: large title, 30 px bold. */}
        <h1
          ref={titleRef}
          className="pt-1 pb-2 text-[1.875rem] leading-tight font-bold tracking-[-0.02em] text-text"
        >
          {title}
        </h1>
        {children}
      </div>
    </div>
  )
}

// True once the large title has scrolled under the bar.
function useScrolledPast(ref: React.RefObject<HTMLElement | null>) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      ([entry]) => {
        setScrolled(entry ? !entry.isIntersecting : false)
      },
      // The bar is 44 px tall plus the notch; count the title gone once it is under it.
      { rootMargin: '-44px 0px 0px 0px', threshold: 0 },
    )
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [ref])
  return scrolled
}
