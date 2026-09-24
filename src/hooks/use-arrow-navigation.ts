import { useCallback } from 'react'

export type ArrowOrientation = 'vertical' | 'horizontal' | 'both'

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

const TEXT_INPUTS = new Set(['text', 'search', 'email', 'password', 'url', 'tel', 'number', 'time'])

/** Un champ où les flèches déplacent déjà le curseur : on ne les lui prend pas. */
function editsText(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false
  if (element.isContentEditable || element.tagName === 'TEXTAREA') return true
  return element instanceof HTMLInputElement && TEXT_INPUTS.has(element.type)
}

/**
 * Se balader aux flèches dans une liste : ↑ ↓ (ou ← → selon l'orientation)
 * passent d'un élément focalisable au suivant, Début et Fin sautent aux
 * extrémités. La tabulation n'est pas touchée — chaque élément reste un arrêt
 * de Tab — c'est un raccourci en plus, pas un autre modèle de focus. Pour un
 * groupe à arrêt unique (onglets, radios), voir `useRovingFocus`.
 *
 * Renvoie un gestionnaire `onKeyDown` à poser sur le conteneur.
 */
export function useArrowNavigation(orientation: ArrowOrientation = 'vertical') {
  return useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if (editsText(document.activeElement)) return

      const vertical = orientation !== 'horizontal'
      const horizontal = orientation !== 'vertical'
      const { key } = event
      const forward = (vertical && key === 'ArrowDown') || (horizontal && key === 'ArrowRight')
      const backward = (vertical && key === 'ArrowUp') || (horizontal && key === 'ArrowLeft')
      const edge = key === 'Home' || key === 'End'
      if (!forward && !backward && !edge) return

      const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return

      const active = document.activeElement
      const index = items.findIndex((item) => item === active)
      let next: number
      if (key === 'Home') next = 0
      else if (key === 'End') next = items.length - 1
      else if (index === -1) next = forward ? 0 : items.length - 1
      else next = forward ? Math.min(index + 1, items.length - 1) : Math.max(index - 1, 0)

      if (next === index) {
        // Au bout de la liste, la flèche ne fait rien — et ne fait pas défiler
        // la page non plus, ce qui donnerait l'impression d'avoir sauté.
        event.preventDefault()
        return
      }
      event.preventDefault()
      items[next]?.focus()
    },
    [orientation]
  )
}
