import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../../lib/i18n'
import {
  fakeVault,
  type FakeServer,
  renderApp,
  shownRecoveryKey,
  stubServer,
} from '../../../test-utils'
import { VaultError } from '../../../worker/errors'

const password = 'a sunny day in Monterrey'

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sign-up', () => {
  it('SYS-13: asks for the setup code on a server with no accounts yet', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signUpMode: 'setup' }
    stubServer(server)
    const vault = fakeVault(server)
    renderApp('/sign-up', vault)

    await user.type(await screen.findByLabelText('Email'), 'ana@example.com')
    await user.type(screen.getByLabelText('Password'), password)
    await user.type(screen.getByLabelText('Repeat password'), password)
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Enter the setup code.')).toBeInTheDocument()
    expect(vault.signUp).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Setup code'), ' ABC123 ')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(vault.signUp).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password,
      setupCode: 'ABC123',
    })
  })

  it('SYS-06: checks the email, the password length and the repeat before anything else', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signUpMode: 'open' }
    stubServer(server)
    const vault = fakeVault(server)
    renderApp('/sign-up', vault)

    expect(screen.queryByLabelText('Setup code')).not.toBeInTheDocument()
    await user.type(await screen.findByLabelText('Email'), 'ana')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Enter an email address.')).toBeInTheDocument()
    expect(screen.getByText('Use at least 12 characters.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Email'), '@example.com')
    await user.clear(screen.getByLabelText('Password'))
    await user.type(screen.getByLabelText('Password'), password)
    await user.type(screen.getByLabelText('Repeat password'), `${password}!`)
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText("The passwords don't match.")).toBeInTheDocument()
    expect(vault.signUp).not.toHaveBeenCalled()
  })

  it('SEC-07: shows the recovery key once, and moves on only after the person says it is saved', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signUpMode: 'open' }
    stubServer(server)
    renderApp('/sign-up', fakeVault(server))

    await user.type(await screen.findByLabelText('Email'), 'ana@example.com')
    await user.type(screen.getByLabelText('Password'), password)
    await user.type(screen.getByLabelText('Repeat password'), password)
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(
      await screen.findByRole('heading', { name: 'Save your recovery key' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(shownRecoveryKey)).toHaveTextContent(
      shownRecoveryKey.replaceAll('-', ''),
    )
    expect(screen.getByText(/your data is gone for good/)).toBeInTheDocument()
    const proceed = screen.getByRole('button', { name: 'Continue' })
    expect(proceed).toBeDisabled()

    await user.click(screen.getByLabelText('I saved my recovery key somewhere safe'))
    await user.click(proceed)
    expect(await screen.findByText('Signed in as ana@example.com')).toBeInTheDocument()
  })

  it('SYS-13: says so when the server takes no new accounts', async () => {
    const server: FakeServer = { signUpMode: 'closed' }
    stubServer(server)
    renderApp('/sign-up', fakeVault(server))

    expect(await screen.findByText(/isn't taking new accounts/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
  })

  it('SYS-06: explains an email that already has an account, in Spanish too', async () => {
    await i18n.changeLanguage('es')
    const user = userEvent.setup()
    const server: FakeServer = { signUpMode: 'open' }
    stubServer(server)
    renderApp(
      '/sign-up',
      fakeVault(server, { signUp: () => Promise.reject(new VaultError('email-taken')) }),
    )

    await user.type(await screen.findByLabelText('Correo electrónico'), 'ana@example.com')
    await user.type(screen.getByLabelText('Contraseña'), password)
    await user.type(screen.getByLabelText('Repite la contraseña'), password)
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Ese correo ya tiene una cuenta')
  })
})

describe('sign-in', () => {
  it('SYS-06: signs in and opens the app', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: null }
    stubServer(server)
    const vault = fakeVault(server)
    renderApp('/sign-in', vault)

    await user.type(await screen.findByLabelText('Email'), 'ana@example.com')
    await user.type(screen.getByLabelText('Password'), password)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Signed in as ana@example.com')).toBeInTheDocument()
    expect(vault.signIn).toHaveBeenCalledWith('ana@example.com', password)
  })

  it('SEC-03: says the email or password is wrong without saying which', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: null }
    stubServer(server)
    renderApp(
      '/sign-in',
      fakeVault(server, { signIn: () => Promise.reject(new VaultError('wrong-credentials')) }),
    )

    await user.type(await screen.findByLabelText('Email'), 'ana@example.com')
    await user.type(screen.getByLabelText('Password'), password)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password.')
  })

  it('NFR-07: the password can be shown to check it, with a named control', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: null }
    stubServer(server)
    renderApp('/sign-in', fakeVault(server))

    const field = await screen.findByLabelText('Password')
    expect(field).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(field).toHaveAttribute('type', 'text')
  })
})

describe('unlock', () => {
  it('SEC-12: unlocks with the password and reports a wrong one', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: 'ana@example.com' }
    stubServer(server)
    let unlocked = false
    const vault = fakeVault(server, {
      status: () => Promise.resolve(unlocked ? 'unlocked' : 'locked'),
      unlock: vi.fn((typed: string) => {
        if (typed !== password) return Promise.reject(new VaultError('wrong-password'))
        unlocked = true
        return Promise.resolve()
      }),
    })
    renderApp('/unlock', vault)

    expect(await screen.findByText('Signed in as ana@example.com')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Password'), 'not it')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong password.')

    await user.clear(screen.getByLabelText('Password'))
    await user.type(screen.getByLabelText('Password'), password)
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(await screen.findByText('Signed in as ana@example.com')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Lock' })).toBeInTheDocument()
  })
})
