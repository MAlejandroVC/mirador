import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowCounterClockwiseIcon } from './icons'
import { type Undoable, UndoContext } from './use-undo'

// DL-CMP-13: one line and an Undo button on `surface`, just above the tab bar, for
// 5 seconds, one at a time: a new one replaces the last.
export function UndoProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [current, setCurrent] = useState<(Undoable & { key: number }) | null>(null)
  const show = useCallback((undoable: Undoable) => {
    setCurrent({ ...undoable, key: Date.now() })
  }, [])

  useEffect(() => {
    if (!current) return
    const timer = setTimeout(() => {
      setCurrent(null)
    }, 5000)
    return () => {
      clearTimeout(timer)
    }
  }, [current])

  return (
    <UndoContext value={show}>
      {children}
      <div
        role="status"
        className="pointer-events-none fixed inset-x-3 bottom-[calc(max(0.75rem,calc(env(safe-area-inset-bottom)-0.75rem))+4.125rem)] z-30 mx-auto flex max-w-[30rem] justify-center lg:bottom-6 lg:left-64"
      >
        {current && (
          <div
            key={current.key}
            className="pointer-events-auto flex min-h-[3.25rem] w-full items-center gap-3 rounded-2xl border-[0.5px] border-separator bg-surface pr-1 pl-4 shadow-[0_4px_14px_rgb(0_0_0/12%)]"
          >
            <span className="flex-1 text-[0.9375rem] text-text">{current.message}</span>
            <button
              type="button"
              onClick={() => {
                current.undo()
                setCurrent(null)
              }}
              className="flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-[0.9375rem] font-semibold text-brand focus-visible:outline-2 focus-visible:outline-brand"
            >
              <ArrowCounterClockwiseIcon aria-hidden className="size-[1.125rem]" />
              {t('common.undo')}
            </button>
          </div>
        )}
      </div>
    </UndoContext>
  )
}
