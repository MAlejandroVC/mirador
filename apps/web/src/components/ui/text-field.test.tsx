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
        hint="Pick something you will remember."
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
  it('NFR-07: says more about a field in a hint under it, not behind an (i) button', () => {
    render(<Password />)
    expect(screen.getByText('Pick something you will remember.')).toBeVisible()
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
      'Pick something you will remember.',
    )
    expect(screen.queryByRole('button', { name: /About/ })).not.toBeInTheDocument()
  })

  it('SYS-06: shows the checks once the field is used, ticks them off, and keeps them in place until all are met', async () => {
    const user = userEvent.setup()
    render(<Password />)
    const field = screen.getByLabelText('Password')
    expect(screen.queryByText('A number')).not.toBeInTheDocument()

    await user.click(field)
    expect(screen.getByText('At least 3 characters')).toHaveTextContent('(not yet)')
    // Screen readers read the checks with the field.
    expect(field.getAttribute('aria-describedby')).toContain(screen.getByRole('list').id)

    await user.type(field, 'ab')
    expect(screen.getByText('At least 3 characters')).toHaveTextContent('(not yet)')
    expect(screen.getByText('A number')).toHaveTextContent('(not yet)')

    // Leaving the field keeps them where they are, so nothing under them moves while
    // the finger reaches for it.
    await user.click(screen.getByLabelText('Elsewhere'))
    expect(screen.getByText('A number')).toBeInTheDocument()

    // Once every rule is met, they fold away.
    await user.type(field, '1')
    expect(screen.queryByText('A number')).not.toBeInTheDocument()
  })
})
