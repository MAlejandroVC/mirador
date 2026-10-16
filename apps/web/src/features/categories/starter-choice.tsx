import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { FolderSimpleIcon } from '../../components/ui/icons'
import { useStartCategories } from './use-start-categories'

// CAT-04: before the first category, the choice of the suggested set or starting from
// scratch. Either way the system categories come along (CAT-05).
export function StarterChoice({ onDone }: { onDone?: () => void }) {
  const { t } = useTranslation()
  const starter = useStartCategories()
  return (
    <EmptyState
      icon={FolderSimpleIcon}
      title={t('categories.starter.title')}
      action={
        <div className="mt-1 flex w-full flex-col gap-2">
          <Button
            disabled={starter.pending}
            onClick={() => {
              starter.start(false, onDone)
            }}
          >
            {t('categories.starter.suggested')}
          </Button>
          <Button
            variant="ghost"
            disabled={starter.pending}
            onClick={() => {
              starter.start(true, onDone)
            }}
          >
            {t('categories.starter.scratch')}
          </Button>
          {starter.failed && (
            <p className="text-[0.8125rem] text-warning">{t('wallets.saveFailed')}</p>
          )}
        </div>
      }
    >
      {t('categories.starter.body')}
    </EmptyState>
  )
}
