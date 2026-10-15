import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { applyAppearance, readAppearance } from './lib/appearance'
import './lib/i18n'
// SYS-20: listens for the browser's install offer, which comes once and early.
import './features/install/install'
import { startVault } from './lib/vault'
import { createAppRouter } from './router'

// SYS-16, SYS-17: before the first paint, so the app never flashes the default palette.
applyAppearance(readAppearance())

const queryClient = new QueryClient()
const router = createAppRouter(queryClient, startVault())

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
