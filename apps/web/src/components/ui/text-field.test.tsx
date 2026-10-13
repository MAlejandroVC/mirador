import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../lib/i18n'
import { TextField } from './text-field'

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

function Password() {
  const [value, setValue] = useState('')
  return (
    <>
      <TextField
        label="Password"
        type="password"
        info="Pick something you will remember."
        checks={[
          { label: 'At least 3 characters', met: value.length >= 3 },
          { label: 'A number', met: /\d/.test(value) },
        ]}
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
        }}
      />
      <TextField label="Elsewhere" />
    </>
  )
}

describe('text field', () => {
  it('NFR-07: keeps more about a field behind an (i) button that opens and closes it', async () => {
    const user = userEvent.setup()
    render(<Password />)

    const info = screen.getByRole('button', { name: 'About Password' })
    expect(info).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Pick something you will remember.')).not.toBeVisible()

    await user.click(info)
    expect(info).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Pick something you will remember.')).toBeVisible()
    await user.click(info)
    expect(screen.queryByText('Pick something you will remember.')).not.toBeVisible()
  })

  it('SYS-06: shows the checks only while the field has focus, and ticks them off as they are met', async () => {
    const user = userEvent.setup()
    render(<Password />)
    const field = screen.getByLabelText('Password')
    expect(screen.queryByText('A number')).not.toBeInTheDocument()

    await user.click(field)
    expect(screen.getByText('At least 3 characters')).toHaveTextContent('(not yet)')
    // Screen readers read the checks with the field.
    expect(field.getAttribute('aria-describedby')).toContain(screen.getByRole('list').id)

    await user.type(field, 'ab1')
    expect(screen.getByText('At least 3 characters')).toHaveTextContent('(done)')
    expect(screen.getByText('A number')).toHaveTextContent('(done)')

    // Showing the password keeps them open; leaving the field hides them.
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(screen.getByText('A number')).toBeInTheDocument()
    await user.click(screen.getByLabelText('Elsewhere'))
    expect(screen.queryByText('A number')).not.toBeInTheDocument()
  })
})
