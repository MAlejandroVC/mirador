import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '../lib/i18n'
import { createAppRouter } from '../router'

function renderHome() {
  const queryClient = new QueryClient()
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: ['/'] }))
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('home page', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the app name and that the server is connected', async () => {
    await i18n.changeLanguage('en')
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ status: 'ok' }))),
    )

    renderHome()

    expect(await screen.findByRole('heading', { name: 'Mirador' })).toBeInTheDocument()
    expect(await screen.findByText('Server connected')).toBeInTheDocument()
  })

  it('says so in Spanish when the server cannot be reached', async () => {
    await i18n.changeLanguage('es')
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 503 }))),
    )

    renderHome()

    expect(await screen.findByText('No se puede conectar con el servidor')).toBeInTheDocument()
  })
})
