'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { ShortcutsHelpDialog } from '@/components/layout/shortcuts-help-dialog'
import {
  HELP_KEY,
  isTypingTarget,
  matchSequence,
  SEARCH_KEY,
  SEQUENCE_TIMEOUT_MS,
} from '@/lib/shortcuts'
import {
  openShortcutsHelp,
  setShortcutsHelpOpen,
  useShortcutsHelpOpen,
} from '@/lib/shortcuts-help-store'

/**
 * Écoute les raccourcis globaux et affiche l'aide (`?`).
 *
 * Monté une fois dans le layout racine, sans lire ni l'URL ni l'utilisateur :
 * il ne rend rien qui dépende du serveur, la coquille prérendue reste
 * statique. Il ne réagit jamais à une touche déjà consommée (le deck de
 * vote, une modale) ni à une saisie en cours.
 */
export function KeyboardShortcuts() {
  const navigation = useRouter()
  const helpOpen = useShortcutsHelpOpen()

  useEffect(() => {
    let buffer: string[] = []
    let timer = 0

    function reset() {
      buffer = []
      window.clearTimeout(timer)
    }

    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isTypingTarget(event.target)) return

      if (event.key === HELP_KEY) {
        event.preventDefault()
        reset()
        openShortcutsHelp()
        return
      }

      if (event.key === SEARCH_KEY) {
        const search = document.querySelector<HTMLInputElement>('input[type="search"]')
        if (!search) return
        event.preventDefault()
        reset()
        search.focus()
        search.select()
        return
      }

      // Seules les lettres enchaînent : une flèche, une touche de fonction ou
      // Échap referment la séquence sans rien faire.
      if (event.key.length !== 1) {
        reset()
        return
      }

      const key = event.key.toLowerCase()
      let outcome = matchSequence([...buffer, key])
      if (outcome.kind === 'none' && buffer.length > 0) {
        // La suite ne colle pas : cette touche peut être le début d'autre chose.
        buffer = []
        outcome = matchSequence([key])
      }

      if (outcome.kind === 'match') {
        event.preventDefault()
        reset()
        navigation.push(outcome.shortcut.href)
        return
      }

      if (outcome.kind === 'prefix') {
        buffer = [key]
        window.clearTimeout(timer)
        timer = window.setTimeout(reset, SEQUENCE_TIMEOUT_MS)
        return
      }

      reset()
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      reset()
    }
  }, [navigation])

  return <ShortcutsHelpDialog open={helpOpen} onOpenChange={setShortcutsHelpOpen} />
}
