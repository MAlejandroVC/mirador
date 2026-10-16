import {
  activeFilters,
  amountText,
  type FlowType,
  fractionDigits,
  parseAmount,
  type TransactionFilter,
  type TransactionSource,
} from '@repo/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/button'
import { ChoiceRow } from '../../components/ui/choice-row'
import { FieldNote, FieldRow, FieldRows, MoneyRow } from '../../components/ui/field-row'
import { IconTile } from '../../components/ui/icon-tile'
import { List } from '../../components/ui/list'
import { PickerRow } from '../../components/ui/picker-row'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { Sheet } from '../../components/ui/sheet'
import { useLocale } from '../../lib/format'
import { CategoryTile, TagDot } from '../categories/category-tile'
import type { Ledger } from '../wallets/use-ledger'
import { walletIconComponents } from '../wallets/wallet-look'
import { MultiPicker, type PickItem } from './multi-picker'

const types: readonly FlowType[] = ['expense', 'income', 'transfer', 'balance']
const sources: readonly TransactionSource[] = ['manual', 'quickAdd', 'import', 'recurring']
type Choosing = 'wallets' | 'groups' | 'categories' | 'tags' | 'payees'

// TXN-22, TXN-23: narrowing the list. Every change applies at once, behind the sheet,
// and the period's totals follow (TXN-24). The dates come from the period above the
// list, so they aren't repeated here.
export function FilterSheet({
  open,
  ledger,
  value,
  onChange,
  onClose,
}: {
  open: boolean
  ledger: Ledger
  value: TransactionFilter
  onChange: (filter: TransactionFilter) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const currency = ledger.defaultCurrency
  const decimals = fractionDigits(currency)
  const [choosing, setChoosing] = useState<Choosing | null>(null)
  const [minText, setMinText] = useState(
    value.minAmount === undefined ? '' : amountText(value.minAmount, currency, locale),
  )
  const [maxText, setMaxText] = useState(
    value.maxAmount === undefined ? '' : amountText(value.maxAmount, currency, locale),
  )
  const groups = new Map(ledger.groups.map((group) => [group.id, group]))

  const set = (patch: Partial<TransactionFilter>) => {
    // A filter that is cleared is left out, so it no longer counts as on.
    const next: Record<string, unknown> = { ...value }
    for (const [key, item] of Object.entries(patch) as [string, unknown][])
      if (item === undefined) Reflect.deleteProperty(next, key)
      else next[key] = item
    onChange(next)
  }
  const toggle = <T,>(list: readonly T[] | undefined, item: T): T[] =>
    (list ?? []).includes(item)
      ? (list ?? []).filter((each) => each !== item)
      : [...(list ?? []), item]
  const amount = (text: string) => {
    const parsed = parseAmount(text, currency, locale)
    return parsed === null || parsed === 0 ? undefined : parsed
  }

  const pickItems: Record<Choosing, PickItem[]> = {
    wallets: ledger.wallets.map((wallet) => ({
      id: wallet.id,
      name: wallet.name,
      leading: <IconTile icon={walletIconComponents[wallet.icon]} color={wallet.color} />,
    })),
    groups: ledger.groups.map((group) => ({
      id: group.id,
      name: group.name,
      leading: <TagDot color={group.color} />,
    })),
    categories: ledger.categories.map((category) => ({
      id: category.id,
      name: category.name,
      leading: <CategoryTile category={category} group={groups.get(category.groupId)} />,
      section: groups.get(category.groupId)?.name ?? '',
    })),
    tags: ledger.tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      leading: <TagDot color={tag.color} />,
    })),
    payees: [...ledger.payees]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((payee) => ({ id: payee.id, name: payee.name })),
  }
  const keys: Record<Choosing, keyof TransactionFilter> = {
    wallets: 'walletIds',
    groups: 'groupIds',
    categories: 'categoryIds',
    tags: 'tagIds',
    payees: 'payeeIds',
  }
  const summary = (kind: Choosing) => {
    const ids = (value[keys[kind]] as string[] | undefined) ?? []
    if (ids.length === 0) return t('filters.any')
    const names = pickItems[kind].filter((item) => ids.includes(item.id)).map((item) => item.name)
    return names.length <= 2 ? names.join(', ') : t('filters.count', { count: names.length })
  }

  return (
    <Sheet open={open} title={t('filters.title')} doneLabel={t('nav.done')} onClose={onClose}>
      <List label={t('filters.type')} inset>
        {types.map((type) => (
          <ChoiceRow
            key={type}
            title={t(`filters.types.${type}`)}
            checked={(value.types ?? []).includes(type)}
            onToggle={() => {
              set({ types: toggle(value.types, type) })
            }}
          />
        ))}
      </List>

      <FieldRows>
        {(['wallets', 'groups', 'categories', 'tags', 'payees'] as const).map((kind) => (
          <PickerRow
            key={kind}
            label={t(`filters.${kind}`)}
            value={summary(kind)}
            error={false}
            onClick={() => {
              setChoosing(kind)
            }}
          />
        ))}
      </FieldRows>

      <FieldRows note={<FieldNote>{t('filters.amountHint')}</FieldNote>}>
        <MoneyRow
          label={t('filters.atLeast')}
          value={minText}
          onChange={(next) => {
            setMinText(next)
            set({ minAmount: amount(next) })
          }}
          locale={locale}
          decimals={decimals}
        />
        <MoneyRow
          label={t('filters.atMost')}
          value={maxText}
          onChange={(next) => {
            setMaxText(next)
            set({ maxAmount: amount(next) })
          }}
          locale={locale}
          decimals={decimals}
        />
      </FieldRows>

      <FieldRows>
        <FieldRow
          label={t('filters.text')}
          value={value.text ?? ''}
          placeholder={t('filters.textPlaceholder')}
          onChange={(event) => {
            set({ text: event.target.value === '' ? undefined : event.target.value })
          }}
        />
      </FieldRows>

      {/* TXN-23 */}
      <section className="flex flex-col gap-1.5">
        <h3 className="px-4 text-xs tracking-[0.04em] text-text-muted uppercase">
          {t('filters.budget')}
        </h3>
        <SegmentedControl
          label={t('filters.budget')}
          options={[
            { value: 'all', label: t('filters.budgetAll') },
            { value: 'included', label: t('filters.budgetIncluded') },
            { value: 'excluded', label: t('filters.budgetExcluded') },
          ]}
          value={value.budget ?? 'all'}
          onChange={(budget) => {
            set({ budget: budget === 'all' ? undefined : budget })
          }}
        />
      </section>

      <List label={t('filters.source')} inset>
        {sources.map((source) => (
          <ChoiceRow
            key={source}
            title={t(`filters.sources.${source}`)}
            checked={(value.sources ?? []).includes(source)}
            onToggle={() => {
              set({ sources: toggle(value.sources, source) })
            }}
          />
        ))}
      </List>

      {activeFilters(value) > 0 && (
        <Button
          variant="secondary"
          onClick={() => {
            setMinText('')
            setMaxText('')
            onChange({})
          }}
        >
          {t('filters.clear')}
        </Button>
      )}

      <MultiPicker
        open={choosing !== null}
        title={choosing ? t(`filters.${choosing}`) : ''}
        items={choosing ? pickItems[choosing] : []}
        value={choosing ? ((value[keys[choosing]] as string[] | undefined) ?? []) : []}
        onChange={(ids) => {
          if (choosing) set({ [keys[choosing]]: ids.length > 0 ? ids : undefined })
        }}
        onClose={() => {
          setChoosing(null)
        }}
      />
    </Sheet>
  )
}
