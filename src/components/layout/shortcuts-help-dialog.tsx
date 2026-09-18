'use client'

import { RiCloseLine } from '@remixicon/react'
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

const KEY_LABELS: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Enter: 'Entrée',
  Escape: 'Échap',
}

const GROUPS: Group[] = [
  {
    title: 'Créer',
    rows: CREATE_SHORTCUTS.map((shortcut) => ({
      keys: shortcut.keys,
      sequence: true,
      label: shortcut.label,
    })),
  },
  {
    title: 'Aller à',
    rows: GO_SHORTCUTS.map((shortcut) => ({
      keys: shortcut.keys,
      sequence: true,
      label: shortcut.label,
    })),
  },
  {
    title: 'Pendant le vote',
    rows: VOTE_ACTIONS.map((action) => ({ keys: action.shortcuts, label: action.label })),
  },
  {
    title: 'Partout',
    rows: [
      { keys: ['Tab'], label: 'Passer d’un élément au suivant' },
      { keys: ['ArrowUp', 'ArrowDown'], label: 'Se déplacer dans une liste' },
      { keys: [SEARCH_KEY], label: 'Chercher un resto' },
      { keys: ['Escape'], label: 'Fermer, annuler' },
      { keys: [HELP_KEY], label: 'Cette aide' },
    ],
  },
]

interface ShortcutsHelpDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** L'aide des raccourcis : la même liste que le README, dans l'app. */
export function ShortcutsHelpDialog({ open, onOpenChange }: ShortcutsHelpDialogProps) {
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogPopup>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <DialogTitle>Raccourcis clavier</DialogTitle>
            <DialogDescription>
              Deux touches à la suite pour créer ou naviguer, une seule pendant le vote.
            </DialogDescription>
          </div>
          <DialogClose
            render={
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Fermer l’aide" />
            }
          >
            <RiCloseLine aria-hidden="true" />
          </DialogClose>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {GROUPS.map((group) => (
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
                              {row.sequence ? 'puis' : 'ou'}
                            </span>
                          )}
                          <kbd>{KEY_LABELS[key] ?? key}</kbd>
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
