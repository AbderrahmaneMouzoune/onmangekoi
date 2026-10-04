'use client'

import { RiCloseLine } from '@remixicon/react'
import { useTranslations } from 'next-intl'
import { Fragment } from 'react'

import { Button } from '@/components/ui/button'
import {
  DialogClose,
  DialogDescription,
  DialogPopup,
  DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog'
import { VOTE_ACTIONS } from '@/domain/vote'
import { CREATE_SHORTCUTS, GO_SHORTCUTS, HELP_KEY, SEARCH_KEY } from '@/lib/shortcuts'

interface Row {
  keys: readonly string[]
  /** Les touches s'enchaînent (« puis ») plutôt que de s'ajouter (« ou »). */
  sequence?: boolean
  label: string
}

interface Group {
  title: string
  rows: Row[]
}

/** Flèches : des symboles, les mêmes dans toutes les langues. */
const ARROWS: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
}

/** Touches dont le nom se traduit (`layout.shortcuts.keys`). */
const NAMED_KEYS = ['Enter', 'Escape'] as const

function isNamedKey(key: string): key is (typeof NAMED_KEYS)[number] {
  return (NAMED_KEYS as readonly string[]).includes(key)
}

interface ShortcutsHelpDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** L'aide des raccourcis : la même liste que le README, dans l'app. */
export function ShortcutsHelpDialog({ open, onOpenChange }: ShortcutsHelpDialogProps) {
  const t = useTranslations('layout.shortcuts')
  const tVote = useTranslations('session.vote.actions')

  const groups: Group[] = [
    {
      title: t('groups.create'),
      rows: CREATE_SHORTCUTS.map((shortcut) => ({
        keys: shortcut.keys,
        sequence: true,
        label: t(`targets.${shortcut.id}`),
      })),
    },
    {
      title: t('groups.goTo'),
      rows: GO_SHORTCUTS.map((shortcut) => ({
        keys: shortcut.keys,
        sequence: true,
        label: t(`targets.${shortcut.id}`),
      })),
    },
    {
      title: t('groups.vote'),
      rows: VOTE_ACTIONS.map((action) => ({ keys: action.shortcuts, label: tVote(action.kind) })),
    },
    {
      title: t('groups.anywhere'),
      rows: [
        { keys: ['Tab'], label: t('anywhere.tab') },
        { keys: ['ArrowUp', 'ArrowDown'], label: t('anywhere.arrows') },
        { keys: [SEARCH_KEY], label: t('anywhere.search') },
        { keys: ['Escape'], label: t('anywhere.escape') },
        { keys: [HELP_KEY], label: t('anywhere.help') },
      ],
    },
  ]

  const keyLabel = (key: string) => ARROWS[key] ?? (isNamedKey(key) ? t(`keys.${key}`) : key)

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-lg">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </div>
          <DialogClose
            render={<Button type="button" variant="ghost" size="icon-sm" aria-label={t('close')} />}
          >
            <RiCloseLine aria-hidden="true" />
          </DialogClose>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {groups.map((group) => (
            <section key={group.title} className="flex flex-col gap-2">
              <h3 className="eyebrow">{group.title}</h3>
              <dl className="flex flex-col gap-1.5">
                {group.rows.map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
                    <dt className="text-ink-2">{row.label}</dt>
                    <dd className="flex shrink-0 items-center gap-1">
                      {row.keys.map((key, index) => (
                        <Fragment key={key}>
                          {index > 0 && (
                            <span className="text-[0.65rem] text-muted-foreground">
                              {row.sequence ? t('then') : t('or')}
                            </span>
                          )}
                          <kbd>{keyLabel(key)}</kbd>
                        </Fragment>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogPopup>
    </DialogRoot>
  )
}
