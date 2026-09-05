'use client'

import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}
const getSnapshot = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function'
const getServerSnapshot = () => false

/**
 * `navigator.share` est-il disponible ? Rendu `false` côté serveur et au
 * premier rendu client (pas de divergence d'hydratation), puis la vraie valeur.
 */
export function useCanShare(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
