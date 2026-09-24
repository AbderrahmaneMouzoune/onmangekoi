import { useCallback } from 'react'

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown'])
const PREVIOUS_KEYS = new Set(['ArrowLeft', 'ArrowUp'])

/**
 * Déplacement au clavier dans un groupe d'onglets ou de boutons radio : les
 * flèches passent d'un élément à l'autre (en boucle), Début et Fin sautent aux
 * extrémités. Le groupe n'expose qu'un seul arrêt de tabulation ; c'est le
 * motif « roving tabindex » de WAI-ARIA.
 *
 * Renvoie un gestionnaire `onKeyDown` à poser sur le conteneur : il cherche
 * les éléments `[data-roving]` non désactivés qu'il contient, focalise le
 * suivant et appelle `onMove` avec son index.
 */
export function useRovingFocus(onMove?: (index: number) => void) {
  return useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      const isNext = NEXT_KEYS.has(event.key)
      const isPrevious = PREVIOUS_KEYS.has(event.key)
      const isEdge = event.key === 'Home' || event.key === 'End'
      if (!isNext && !isPrevious && !isEdge) return

      const items = Array.from(
        event.currentTarget.querySelectorAll<HTMLElement>('[data-roving]:not(:disabled)')
      )
      if (items.length === 0) return
      const currentIndex = items.findIndex((item) => item === document.activeElement)

      let nextIndex: number
      if (event.key === 'Home') nextIndex = 0
      else if (event.key === 'End') nextIndex = items.length - 1
      else if (currentIndex === -1) nextIndex = 0
      else if (isNext) nextIndex = (currentIndex + 1) % items.length
      else nextIndex = (currentIndex - 1 + items.length) % items.length

      event.preventDefault()
      items[nextIndex]?.focus()
      onMove?.(nextIndex)
    },
    [onMove]
  )
}
