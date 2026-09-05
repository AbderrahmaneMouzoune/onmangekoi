'use client'

import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

/** `false` au rendu serveur et à l'hydratation, `true` ensuite. Sans effet ni setState. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
}
