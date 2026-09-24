import { useSyncExternalStore } from 'react'

/**
 * Ouverture de l'aide des raccourcis, partagée entre qui l'ouvre (la touche
 * `?`, le bouton de l'en-tête) et qui l'affiche (le dialogue monté une fois
 * dans le layout). Un état de module suffit : il n'y a qu'une aide par page.
 */
let open = false
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setShortcutsHelpOpen(next: boolean): void {
  if (open === next) return
  open = next
  listeners.forEach((listener) => listener())
}

export function openShortcutsHelp(): void {
  setShortcutsHelpOpen(true)
}

export function useShortcutsHelpOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => false
  )
}
