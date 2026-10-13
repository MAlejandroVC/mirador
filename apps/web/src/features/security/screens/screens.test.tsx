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

    await user.type(await screen.findByLabelText('Username'), 'ana')
    await user.type(screen.getByLabelText('Password'), password)
    await user.type(screen.getByLabelText('Repeat password'), password)
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Enter the setup code.')).toBeInTheDocument()
    expect(vault.signUp).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Setup code'), ' ABC123 ')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(vault.signUp).toHaveBeenCalledWith({
      username: 'ana',
      password,
      setupCode: 'ABC123',
    })
  })

  it('SYS-06: checks the username, the password length and the repeat before anything else', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signUpMode: 'open' }
    stubServer(server)
    const vault = fakeVault(server)
    renderApp('/sign-up', vault)

    expect(screen.queryByLabelText('Setup code')).not.toBeInTheDocument()
    await user.type(await screen.findByLabelText('Username'), 'ana maría')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(
      await screen.findByText(/Use 3 to 32 letters, numbers, dots, dashes or underscores/),
    ).toBeInTheDocument()
    expect(screen.getByText('Use at least 12 characters.')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Username'))
    await user.type(screen.getByLabelText('Username'), 'Ana.Maria')
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

    await user.type(await screen.findByLabelText('Username'), 'ana')
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
    expect(await screen.findByText('Signed in as ana')).toBeInTheDocument()
  })

  it('SYS-13: asks for an invite code, and an invite link fills it in', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signUpMode: 'invite' }
    stubServer(server)
    const vault = fakeVault(server)
    renderApp('/sign-up?invite=ABCD-EFGH-JKMN-PQRS-TV23', vault)

    expect(await screen.findByLabelText('Invite code')).toHaveValue('ABCD-EFGH-JKMN-PQRS-TV23')
    await user.type(screen.getByLabelText('Username'), 'ben')
    await user.type(screen.getByLabelText('Password'), password)
    await user.type(screen.getByLabelText('Repeat password'), password)
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(vault.signUp).toHaveBeenCalledWith({
      username: 'ben',
      password,
      inviteCode: 'ABCD-EFGH-JKMN-PQRS-TV23',
    })
  })

  it('SYS-13: without an invite, says how to get one', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signUpMode: 'invite' }
    stubServer(server)
    const vault = fakeVault(server, {
      signUp: vi.fn(() => Promise.reject(new VaultError('wrong-invite'))),
    })
    renderApp('/sign-up', vault)

    expect(await screen.findByText(/takes new accounts by invite only/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Username'), 'ben')
    await user.type(screen.getByLabelText('Password'), password)
    await user.type(screen.getByLabelText('Repeat password'), password)
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByText('Enter your invite code.')).toBeInTheDocument()
    expect(vault.signUp).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Invite code'), 'used-code')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already used or expired')
  })

  it('SYS-06: explains a username that is already taken, in Spanish too', async () => {
    await i18n.changeLanguage('es')
    const user = userEvent.setup()
    const server: FakeServer = { signUpMode: 'open' }
    stubServer(server)
    renderApp(
      '/sign-up',
      fakeVault(server, { signUp: () => Promise.reject(new VaultError('username-taken')) }),
    )

    await user.type(await screen.findByLabelText('Nombre de usuario'), 'ana')
    await user.type(screen.getByLabelText('Contraseña'), password)
    await user.type(screen.getByLabelText('Repite la contraseña'), password)
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Ese nombre de usuario ya existe')
  })
})

describe('sign-in', () => {
  it('SYS-06: signs in and opens the app', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: null }
    stubServer(server)
    const vault = fakeVault(server)
    renderApp('/sign-in', vault)

    await user.type(await screen.findByLabelText('Username'), 'ana')
    await user.type(screen.getByLabelText('Password'), password)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Signed in as ana')).toBeInTheDocument()
    expect(vault.signIn).toHaveBeenCalledWith('ana', password)
  })

  it('SEC-03: says the username or password is wrong without saying which', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: null }
    stubServer(server)
    renderApp(
      '/sign-in',
      fakeVault(server, { signIn: () => Promise.reject(new VaultError('wrong-credentials')) }),
    )

    await user.type(await screen.findByLabelText('Username'), 'ana')
    await user.type(screen.getByLabelText('Password'), password)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong username or password.')
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
    const server: FakeServer = { signedIn: 'ana' }
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

    expect(await screen.findByText('Signed in as ana')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Password'), 'not it')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong password.')

    await user.clear(screen.getByLabelText('Password'))
    await user.type(screen.getByLabelText('Password'), password)
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(await screen.findByText('Signed in as ana')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Lock' })).toBeInTheDocument()
  })
})

describe('recover', () => {
  const shownKey = 'ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789-ABCD-EFGH-JKMN-PQRS-TVWX-YZ01'

  it('SEC-07: is one tap away from sign-in and from unlock', async () => {
    const user = userEvent.setup()
    stubServer({ signedIn: null })
    const { router } = renderApp('/sign-in', fakeVault({ signedIn: null }))

    await user.click(await screen.findByRole('link', { name: 'Forgot your password?' }))
    expect(router.state.location.pathname).toBe('/recover')
  })

  it('SEC-07: sets a new password with the recovery key and opens the app', async () => {
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: null }
    stubServer(server)
    const vault = fakeVault(server)
    renderApp('/recover', vault)

    await user.type(await screen.findByLabelText('Username'), 'ana')
    await user.type(screen.getByLabelText('Recovery key'), shownKey)
    await user.type(screen.getByLabelText('New password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Set new password' }))
    expect(await screen.findByText('Use at least 12 characters.')).toBeInTheDocument()
    expect(vault.recover).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText('New password'))
    await user.type(screen.getByLabelText('New password'), password)
    await user.type(screen.getByLabelText('Repeat new password'), password)
    await user.click(screen.getByRole('button', { name: 'Set new password' }))

    expect(await screen.findByText('Signed in as ana')).toBeInTheDocument()
    expect(vault.recover).toHaveBeenCalledWith({
      username: 'ana',
      recoveryKey: shownKey,
      newPassword: password,
    })
  })

  it('SEC-07: explains a wrong key and a typo, in Spanish too', async () => {
    await i18n.changeLanguage('es')
    const user = userEvent.setup()
    const server: FakeServer = { signedIn: null }
    stubServer(server)
    const recover = vi
      .fn()
      .mockRejectedValueOnce(new VaultError('recovery-key-typo'))
      .mockRejectedValueOnce(new VaultError('wrong-recovery-key'))
    renderApp('/recover', fakeVault(server, { recover }))

    await user.type(await screen.findByLabelText('Nombre de usuario'), 'ana')
    await user.type(screen.getByLabelText('Clave de recuperación'), shownKey)
    await user.type(screen.getByLabelText('Contraseña nueva'), password)
    await user.type(screen.getByLabelText('Repite la contraseña nueva'), password)
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña nueva' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('tiene un error')

    await user.click(screen.getByRole('button', { name: 'Guardar contraseña nueva' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Usuario o clave de recuperación incorrectos.',
    )
  })
})
