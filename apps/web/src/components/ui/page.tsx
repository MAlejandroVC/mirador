import { type ReactNode, useEffect, useRef, useState } from 'react'
import { CaretLeftIcon } from './icons'

// DL-CMP-06: every screen opens with a large title. A tab's title shares its row with
// the tab's actions, such as the account button, as in the App Store, so no row is
// spent on a lone button. Once the page scrolls, the title shrinks into a bar at the
// top, centered. A screen reached from another passes `back` and keeps that bar, with
// the back button, from the start. A screen the sidebar lists, like Settings, hides
// `back` once the sidebar shows (DL-LAY-06).
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
  // Without a back button the bar has nothing to show until the title is gone.
  const barShown = scrolled || Boolean(back)

  return (
    <div className="flex flex-col">
      {/* DL-SHP-01: a solid bar, no blur. The hairline appears only once content
          slides under it, as in iOS. */}
      <div
        className={`${back ? 'sticky' : 'fixed inset-x-0 lg:left-64'} top-0 z-10 bg-background pt-[env(safe-area-inset-top)] transition-opacity duration-200 motion-reduce:transition-none ${
          barShown ? 'opacity-100' : 'pointer-events-none opacity-0'
        } ${scrolled ? 'shadow-[0_0.5px_0_var(--color-separator)]' : ''}`}
      >
        <div className="mx-auto grid h-11 w-full max-w-(--page-width) grid-cols-[1fr_auto_1fr] items-center px-2">
          <div className="flex justify-start">
            {back && (
              <button
                type="button"
                onClick={back.onClick}
                className={`flex min-h-11 items-center gap-0.5 rounded-xl pr-2 text-[1.0625rem] text-brand focus-visible:outline-2 focus-visible:outline-brand ${back.hideWithSidebar ? 'lg:hidden' : ''}`}
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
          <div />
        </div>
      </div>
      <div
        className={`mx-auto flex w-full max-w-(--page-width) flex-col gap-3 px-4 ${
          back ? '' : 'pt-[calc(env(safe-area-inset-top)+0.75rem)] lg:pt-6'
        }`}
      >
        <div className="flex items-center justify-between gap-3 pt-1 pb-2">
          {/* DL-TYP-03: large title, 30 px bold. */}
          <h1
            ref={titleRef}
            className="text-[1.875rem] leading-tight font-bold tracking-[-0.02em] text-text"
          >
            {title}
          </h1>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </div>
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
      // The bar is 44 px tall; count the title gone once it is under it.
      { rootMargin: '-44px 0px 0px 0px', threshold: 0 },
    )
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [ref])
  return scrolled
}
