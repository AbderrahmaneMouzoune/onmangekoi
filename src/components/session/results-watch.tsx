'use client'

import { useSessionWatch } from '@/hooks/use-session-watch'

/**
 * Suit la ligne de session depuis le classement, pour tout le monde : le
 * départage d'une égalité comme la décision du host (« On y va ») sont des
 * UPDATE de `sessions`, et arrivent donc par le même événement Realtime que
 * la clôture. Personne n'a à recharger.
 *
 * Un seul abonnement par page : le client Realtime rend le canal existant
 * quand on en redemande un de même nom, et lui ajouter des écouteurs après
 * `subscribe()` échoue. C'est pourquoi le suivi vit ici plutôt que dans
 * chacun des panneaux qui en profitent.
 */
export function ResultsWatch({ sessionId }: { sessionId: string }) {
  useSessionWatch(sessionId)
  return null
}
