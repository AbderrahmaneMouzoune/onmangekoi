import { AppHeader } from '@/components/layout/app-header'
import { RestaurantSourcesProvider } from '@/components/restaurants/restaurant-sources'
import { isPlacesSearchEnabled } from '@/data-access/places'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // La clé Google est une variable serveur : le layout la lit une fois et ne
  // diffuse que le booléen, pour que les sélecteurs sachent afficher ou non
  // l'onglet « Google » sans qu'aucune page ait à porter la prop.
  return (
    <RestaurantSourcesProvider google={isPlacesSearchEnabled()}>
      <AppHeader />
      {children}
    </RestaurantSourcesProvider>
  )
}
