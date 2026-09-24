'use client'

import { RiKeyboardLine } from '@remixicon/react'

import { Button } from '@/components/ui/button'
import { openShortcutsHelp } from '@/lib/shortcuts-help-store'
import { cn } from '@/lib/utils'

/**
 * Ouvre l'aide des raccourcis. Réservé aux écrans qui ont un clavier
 * physique — sur téléphone, il n'y a rien à apprendre.
 */
export function ShortcutsHelpButton({ className }: { className?: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Raccourcis clavier"
      title="Raccourcis clavier (?)"
      aria-keyshortcuts="?"
      onClick={openShortcutsHelp}
      className={cn('hidden md:inline-flex', className)}
    >
      <RiKeyboardLine aria-hidden="true" />
    </Button>
  )
}
