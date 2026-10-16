import { matchingByName, nameTaken, type Payee } from '@repo/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChoiceRow } from '../../components/ui/choice-row'
import { PlusIcon, XIcon } from '../../components/ui/icons'
import { List, ListButtonRow } from '../../components/ui/list'
import { SearchField } from '../../components/ui/search-field'
import { Sheet } from '../../components/ui/sheet'

// TXN fields: Payee, the optional shop or person on the other side. Typing a name
// that isn't a payee yet offers to add it; picking one fills in what was used with
// it last time (TXN-08).
export function PayeePicker({
  open,
  payees,
  value,
  onChoose,
  onCreate,
  onClose,
}: {
  open: boolean
  payees: readonly Payee[]
  value: string | null
  onChoose: (payee: Payee | null) => void
  /** Makes a new payee with this name; it is saved with the transaction. */
  onCreate: (name: string) => Payee
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <Sheet
      open={open}
      title={t('transactions.payee')}
      cancelLabel={t('nav.cancel')}
      onClose={onClose}
    >
      {open && (
        <PayeeChoices payees={payees} value={value} onChoose={onChoose} onCreate={onCreate} />
      )}
    </Sheet>
  )
}

function PayeeChoices({
  payees,
  value,
  onChoose,
  onCreate,
}: {
  payees: readonly Payee[]
  value: string | null
  onChoose: (payee: Payee | null) => void
  onCreate: (name: string) => Payee
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const name = query.trim()
  const shown = matchingByName(payees, name)
  const canAdd = name !== '' && !nameTaken(name, payees)

  return (
    <>
      <SearchField
        label={t('payees.search')}
        clearLabel={t('pickers.clear')}
        value={query}
        onChange={setQuery}
        autoFocus
      />
      {(canAdd || value !== null) && (
        <List inset>
          {canAdd && (
            <ListButtonRow
              leading={<PlusIcon aria-hidden className="size-[1.375rem] text-brand" />}
              title={t('payees.add', { name })}
              onClick={() => {
                onChoose(onCreate(name))
              }}
            />
          )}
          {value !== null && (
            <ListButtonRow
              leading={<XIcon aria-hidden className="size-[1.375rem] text-brand" />}
              title={t('payees.clear')}
              onClick={() => {
                onChoose(null)
              }}
            />
          )}
        </List>
      )}
      {shown.length > 0 ? (
        <List inset>
          {shown.map((payee) => (
            <ChoiceRow
              key={payee.id}
              role="radio"
              title={payee.name}
              checked={payee.id === value}
              onToggle={() => {
                onChoose(payee)
              }}
            />
          ))}
        </List>
      ) : (
        !canAdd && (
          <p className="px-4 py-6 text-center text-[0.9375rem] text-text-muted">
            {t('payees.none')}
          </p>
        )
      )}
    </>
  )
}
