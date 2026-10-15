import { Outlet } from '@tanstack/react-router'
import { QuickAddProvider } from '../../features/quick-add'
import { Sidebar } from './sidebar'
import { TabBar } from './tab-bar'

// The frame every screen behind sign-in sits in: the tab bar and quick-add on phones and
// tablets, the sidebar on computers (DL-LAY-06). A screen only renders its <Page>.
export function AppShell() {
  return (
    <QuickAddProvider>
      <div className="min-h-dvh bg-background text-text lg:pl-64">
        <Sidebar />
        {/* Room for the floating tab bar, so the last row can scroll above it. */}
        <main className="pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:pb-8">
          <Outlet />
        </main>
        <TabBar />
      </div>
    </QuickAddProvider>
  )
}
