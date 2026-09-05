'use client'

import { createContext, useContext, useMemo } from 'react'

/**
 * Sources de restaurants disponibles sur ce déploiement.
 *
 * La clé Google est une variable serveur : le layout la lit une fois et
 * diffuse ici le seul booléen utile au navigateur, plutôt que de faire
 * traverser une prop à tous les formulaires qui affichent un sélecteur.
 */
interface RestaurantSources {
  /** `GOOGLE_PLACES_API_KEY` est configurée : l'onglet Google a du sens. */
  google: boolean
}

const RestaurantSourcesContext = createContext<RestaurantSources>({ google: false })

export function RestaurantSourcesProvider({
  google,
  children,
}: {
  google: boolean
  children: React.ReactNode
}) {
  const value = useMemo(() => ({ google }), [google])
  return <RestaurantSourcesContext value={value}>{children}</RestaurantSourcesContext>
}

export function useRestaurantSources(): RestaurantSources {
  return useContext(RestaurantSourcesContext)
}
