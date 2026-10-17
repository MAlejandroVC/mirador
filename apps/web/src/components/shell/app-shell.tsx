import { Outlet } from '@tanstack/react-router'
import { useSeedCategories } from '../../features/categories/use-seed-categories'
import { QuickAddProvider } from '../../features/quick-add'
import { usePostRecurring } from '../../features/recurring/use-post-recurring'
import { RemovedWatch } from '../../features/security'
import { UndoProvider } from '../ui/undo-banner'
import { Sidebar } from './sidebar'
import { TabBar } from './tab-bar'

// The frame every screen behind sign-in sits in: the tab bar and quick-add on phones and
// tablets, the sidebar on computers (DL-LAY-06). A screen only renders its <Page>.
export function AppShell() {
  return (
    <UndoProvider>
      <QuickAddProvider>
        <RemovedWatch />
        <PostRecurring />
        <SeedCategories />
        <div className="min-h-dvh bg-background text-text lg:pl-64">
          <Sidebar />
          {/* Room for the floating tab bar, so the last row can scroll above it. */}
          {/* The part that slides when a screen opens (DL-MOT-06), on the page's own
              background so the screen under it doesn't show through. */}
          <main className="bg-background pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:pb-8">
            <Outlet />
          </main>
          <TabBar />
        </div>
      </QuickAddProvider>
    </UndoProvider>
  )
}

/** TXN-10: adds what recurring transactions have due, whichever screen opens first. */
function PostRecurring() {
  usePostRecurring()
  return null
}

/** CAT-04: the suggested categories, there before anyone needs one. */
function SeedCategories() {
  useSeedCategories()
  return null
}
