import type { ReactNode } from 'react'

// DL-MOT-07: a part of a form that opens and closes in place, growing and shrinking to
// its height. Closed, it takes no room and nothing in it can be reached.
export function Fold({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className="fold"
      data-closed={open ? undefined : ''}
      aria-hidden={open ? undefined : true}
      inert={!open}
    >
      <div>{children}</div>
    </div>
  )
}
