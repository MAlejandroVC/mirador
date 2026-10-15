import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconTile } from '../../components/ui/icon-tile'
import {
  DeviceMobileIcon,
  DotsThreeVerticalIcon,
  ExportIcon,
  type Icon,
  PlusSquareIcon,
} from '../../components/ui/icons'
import { List, ListButtonRow } from '../../components/ui/list'
import { Sheet } from '../../components/ui/sheet'
import { promptInstall, useInstallWay } from './install'

// SYS-20: Settings offers to add Mirador to the Home Screen until it runs from there.
// Where the browser has its own install dialog the row opens it; on iPhone, iPad and
// Android without one, a sheet shows the steps with the icons the browser uses.
export function InstallRow() {
  const { t } = useTranslation()
  const way = useInstallWay()
  const [open, setOpen] = useState(false)
  if (!way) return null

  const steps: { icon: Icon; text: string }[] =
    way === 'android'
      ? [
          { icon: DotsThreeVerticalIcon, text: t('settings.install.android.menu') },
          { icon: PlusSquareIcon, text: t('settings.install.android.add') },
          { icon: DeviceMobileIcon, text: t('settings.install.android.confirm') },
        ]
      : [
          { icon: ExportIcon, text: t('settings.install.ios.share') },
          { icon: PlusSquareIcon, text: t('settings.install.ios.add') },
          { icon: DeviceMobileIcon, text: t('settings.install.ios.confirm') },
        ]

  return (
    <>
      <List>
        <ListButtonRow
          tone="text"
          leading={<IconTile icon={DeviceMobileIcon} />}
          title={t('settings.install.title')}
          subtitle={t('settings.install.summary')}
          onClick={() => {
            if (way === 'prompt') void promptInstall()
            else setOpen(true)
          }}
        />
      </List>
      <Sheet
        open={open}
        title={t('settings.install.title')}
        doneLabel={t('nav.done')}
        onClose={() => {
          setOpen(false)
        }}
      >
        <p className="text-[0.9375rem] text-text-muted">{t('settings.install.intro')}</p>
        <ol className="overflow-hidden rounded-2xl bg-inset">
          {steps.map(({ icon, text }, index) => (
            <li
              key={text}
              className="flex min-h-[3.25rem] items-center gap-3 border-t-[0.5px] border-separator px-4 py-2 first:border-t-0"
            >
              <span
                aria-hidden
                className="w-4 shrink-0 text-center text-[0.9375rem] font-semibold text-text-muted"
              >
                {index + 1}
              </span>
              <IconTile icon={icon} />
              <span className="text-[0.9375rem] text-text">{text}</span>
            </li>
          ))}
        </ol>
      </Sheet>
    </>
  )
}
