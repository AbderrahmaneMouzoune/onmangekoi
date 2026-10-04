'use client'

import { RiCheckLine, RiDoorOpenLine } from '@remixicon/react'
import { useTranslations } from 'next-intl'
import { useId } from 'react'

import { cn } from '@/lib/utils'

interface OpenSessionToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
}

/**
 * La case qui fait d'une session un vote « à son heure » : le message part
 * dans la conversation, chacun vote quand il le voit. Elle rend l'échéance
 * obligatoire — c'est le formulaire qui relie les deux — et n'envoie son champ
 * que cochée, comme l'anti-fatigue.
 */
export function OpenSessionToggle({ checked, onChange }: OpenSessionToggleProps) {
  const hintId = useId()
  const t = useTranslations('session.open')

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-describedby={hintId}
        onClick={() => onChange(!checked)}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg border p-3.5 text-left transition-colors',
          checked ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:bg-surface-2'
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-full border',
            checked ? 'border-brand bg-brand text-on-brand' : 'border-line-strong'
          )}
        >
          {checked && <RiCheckLine className="size-3.5" />}
        </span>
        <span className="flex min-w-0 items-center gap-2">
          <RiDoorOpenLine aria-hidden="true" className="size-4 shrink-0 text-brand" />
          <span className="font-medium">{t('label')}</span>
          <span className="truncate text-sm text-muted-foreground">{t('tagline')}</span>
        </span>
      </button>

      {checked && <input type="hidden" name="open" value="on" />}

      <p id={hintId} className="text-xs text-muted-foreground">
        {checked ? t('hintOn') : t('hintOff')}
      </p>
    </div>
  )
}

/** Silhouette : la case décochée, en clair — le départ est le même pour tous. */
export function OpenSessionToggleFallback() {
  const t = useTranslations('session.open')
  return (
    <div className="flex flex-col gap-2">
      <div className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface p-3.5">
        <span
          aria-hidden="true"
          className="size-5 shrink-0 rounded-full border border-line-strong"
        />
        <span className="flex min-w-0 items-center gap-2">
          <RiDoorOpenLine aria-hidden="true" className="size-4 shrink-0 text-brand" />
          <span className="font-medium">{t('label')}</span>
          <span className="truncate text-sm text-muted-foreground">{t('tagline')}</span>
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{t('hintOff')}</p>
    </div>
  )
}
