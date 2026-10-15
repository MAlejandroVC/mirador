import { type ReactNode, useEffect, useRef, useState } from 'react'
import { CaretLeftIcon } from './icons'

// DL-CMP-06: every screen opens with its title. A tab's large title shares its row
// with the tab's actions, such as the account button, as in the App Store, so no row
// is spent on a lone button. A screen reached from another, like a Settings page, has
// a round back button at the top left, a chevron only, as in iOS Settings, and opens
// with a header card (`card`): its icon, its title and one line on what it is for.
// Once the page scrolls, the title shrinks into the bar at the top, centered. A screen
// the sidebar lists, like Settings, hides `back` once the sidebar shows (DL-LAY-06).
export function Page({
  title,
  back,
  actions,
  card,
  children,
}: {
  title: string
  back?: { label: string; onClick: () => void; hideWithSidebar?: boolean }
  actions?: ReactNode
  card?: { icon: ReactNode; description: string }
  children?: ReactNode
}) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  const scrolled = useScrolledPast(titleRef)
  // A screen with a header card keeps its bar, with the back button, from the start.
  // Otherwise the bar shows only once the title is gone, and until then the back
  // button, if any, sits in the title's row so no row is spent on it alone.
  const pinned = Boolean(back && card)
  const barShown = scrolled || pinned
  const backButton = back && (
    <button
      type="button"
      aria-label={back.label}
      onClick={back.onClick}
      className={`grid size-11 shrink-0 place-items-center rounded-full bg-surface text-text shadow-[0_0_0_0.5px_var(--color-separator)] focus-visible:outline-2 focus-visible:outline-brand ${back.hideWithSidebar ? 'lg:hidden' : ''}`}
    >
      <CaretLeftIcon aria-hidden className="size-[1.375rem]" />
    </button>
  )

  return (
    <div className="flex flex-col">
      {/* DL-SHP-01: a solid bar, no blur. The hairline appears only once content
          slides under it, as in iOS. */}
      <div
        inert={!barShown}
        className={`${pinned ? 'sticky' : 'fixed inset-x-0 lg:left-64'} top-0 z-10 bg-background pt-[env(safe-area-inset-top)] transition-opacity duration-200 motion-reduce:transition-none ${
          barShown ? 'opacity-100' : 'pointer-events-none opacity-0'
        } ${scrolled ? 'shadow-[0_0.5px_0_var(--color-separator)]' : ''}`}
      >
        <div className="mx-auto grid h-14 w-full max-w-(--page-width) grid-cols-[1fr_auto_1fr] items-center px-4">
          <div className="flex justify-start">{barShown && backButton}</div>
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
          pinned ? '' : 'pt-[calc(env(safe-area-inset-top)+0.75rem)] lg:pt-6'
        }`}
      >
        {card ? (
          // DL-CMP-06: the header card of a screen reached from another.
          <header className="mb-2 flex flex-col items-start gap-1 rounded-[1.25rem] bg-surface p-4">
            <span className="mb-2">{card.icon}</span>
            <h1 ref={titleRef} className="text-[1.5rem] leading-tight font-bold text-text">
              {title}
            </h1>
            <p className="text-[0.9375rem] text-text-muted">{card.description}</p>
          </header>
        ) : (
          <div className="flex items-center gap-3 pt-1 pb-2">
            {backButton}
            {/* DL-TYP-03: large title, 30 px bold. */}
            <h1
              ref={titleRef}
              className="flex-1 text-[1.875rem] leading-tight font-bold tracking-[-0.02em] text-text"
            >
              {title}
            </h1>
            {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
          </div>
        )}
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
      // The bar is 56 px tall; count the title gone once it is under it.
      { rootMargin: '-56px 0px 0px 0px', threshold: 0 },
    )
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [ref])
  return scrolled
}
