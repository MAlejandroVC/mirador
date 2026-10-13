import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../../lib/i18n'
import {
  fakeVault,
  type FakeServer,
  renderApp,
  shownRecoveryKey,
  stubServer,
  unlockedVault,
} from '../../../test-utils'
import { VaultError } from '../../../worker/errors'
import { readAutoLock } from '../lib/auto-lock'

const password = 'a sunny day in Monterrey'

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function section(name: string) {
  return within(screen.getByRole('region', { name }))
}

describe('password and security', () => {
  it('SEC-08: is one tap from home, and only while unlocked', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    const { router } = renderApp('/', unlockedVault(server))

    await user.click(await screen.findByRole('link', { name: 'Password and security' }))
    expect(
      await screen.findByRole('heading', { name: 'Password and security' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/security')
  })

  it('SEC-12: asks for the password first when locked', async () => {
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    renderApp('/security', fakeVault(server))

    expect(await screen.findByRole('heading', { name: 'Unlock Mirador' })).toBeInTheDocument()
  })

  it('SEC-08: changes the password with the current one', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    const vault = unlockedVault(server)
    renderApp('/security', vault)

    await screen.findByRole('heading', { name: 'Password and security' })
    const form = section('Password')
    await user.click(form.getByRole('button', { name: 'Change password' }))
    expect(form.getByText('Enter your current password.')).toBeInTheDocument()
    expect(vault.changePassword).not.toHaveBeenCalled()

    await user.type(form.getByLabelText('Current password'), password)
    await user.type(form.getByLabelText('New password'), 'a brand new password')
    await user.type(form.getByLabelText('Repeat new password'), 'a brand new password')
    await user.click(form.getByRole('button', { name: 'Change password' }))

    expect(vault.changePassword).toHaveBeenCalledWith(password, 'a brand new password')
    expect(
      await form.findByText('Password changed. Your other devices were signed out.'),
    ).toBeInTheDocument()
    expect(form.getByLabelText('Current password')).toHaveValue('')
  })

  it('SEC-08: says when the current password is wrong', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    const vault = fakeVault(server, {
      changePassword: vi.fn(() => Promise.reject(new VaultError('wrong-password'))),
    })
    await vault.unlock('')
    renderApp('/security', vault)

    await screen.findByRole('heading', { name: 'Password and security' })
    const form = section('Password')
    await user.type(form.getByLabelText('Current password'), 'not my password')
    await user.type(form.getByLabelText('New password'), 'a brand new password')
    await user.type(form.getByLabelText('Repeat new password'), 'a brand new password')
    await user.click(form.getByRole('button', { name: 'Change password' }))

    expect(await form.findByRole('alert')).toHaveTextContent('Wrong password.')
  })

  it('SEC-08: shows a new recovery key once, then confirms the old one stopped working', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    const vault = unlockedVault(server)
    renderApp('/security', vault)

    await screen.findByRole('heading', { name: 'Password and security' })
    const form = section('Recovery key')
    await user.type(form.getByLabelText('Current password'), password)
    await user.click(form.getByRole('button', { name: 'Make a new recovery key' }))

    expect(vault.replaceRecoveryKey).toHaveBeenCalledWith(password)
    expect(
      await screen.findByRole('heading', { name: 'Save your recovery key' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(shownRecoveryKey)).toBeInTheDocument()
    await user.click(screen.getByLabelText('I saved my recovery key somewhere safe'))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(
      await screen.findByText('Your new recovery key is saved. The old one no longer works.'),
    ).toBeInTheDocument()
  })

  it('SEC-08: signs out the other devices, in Spanish too', async () => {
    await i18n.changeLanguage('es')
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    const vault = unlockedVault(server)
    renderApp('/security', vault)

    await screen.findByRole('heading', { name: 'Contraseña y seguridad' })
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión en otros dispositivos' }))

    expect(vault.signOutOthers).toHaveBeenCalled()
    expect(await screen.findByText('Se cerró la sesión en 2 dispositivos más.')).toBeInTheDocument()
  })

  it('SEC-12: picks when this device locks itself, five minutes until changed', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana' }
    stubServer(server)
    renderApp('/security', unlockedVault(server))

    await screen.findByRole('heading', { name: 'Password and security' })
    const autoLock = section('Lock automatically')
    const choice = autoLock.getByLabelText('Lock')
    expect(choice).toHaveDisplayValue('After 5 minutes without use')

    await user.selectOptions(choice, 'As soon as I leave the app')

    expect(autoLock.getByRole('status')).toHaveTextContent('Saved for this device.')
    expect(readAutoLock()).toBe('leave')
    localStorage.clear()
  })
})
