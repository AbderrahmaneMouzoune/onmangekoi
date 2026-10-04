import { RiTrophyLine } from '@remixicon/react'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'

import { PageHeader } from '@/components/layout/page-header'
import { ListRestaurantRows } from '@/components/lists/list-restaurant-rows'
import { StartSessionButton } from '@/components/lists/start-session-button'
import { Badge } from '@/components/ui/badge'
import { router } from '@/config/router.config'
import { getPublicListRestaurants } from '@/data-access/public-lists'

import type { PublicListPreview } from '@/data-access/models'

interface PublicListDetailProps {
  preview: PublicListPreview
  /**
   * Chemin d'onboarding quand la personne n'a pas encore de pseudo — c'est le
   * cas de tout visiteur qui arrive par le lien. `undefined` pour qui en a un.
   */
  setupHref?: string
}

/**
 * La liste telle qu'elle se présente à qui ne connaît pas encore l'app : son
 * nom, ce qu'on y mange, ce que le groupe y choisit le plus souvent, et un
 * bouton pour en faire un vote tout de suite.
 *
 * Aucun pseudo n'y figure — ni en clair, ni en filigrane : `public_list` ne
 * rend rien du propriétaire, il n'y a donc rien à masquer ici.
 */
export async function PublicListDetail({ preview, setupHref }: PublicListDetailProps) {
  const [restaurants, t, tCommon] = await Promise.all([
    getPublicListRestaurants(preview.share_code),
    getTranslations('lists.public'),
    getTranslations('common'),
  ])

  return (
    <>
      <PageHeader
        eyebrow={t('eyebrow')}
        title={preview.name}
        description={t('description', { count: preview.restaurant_count })}
        back={{ href: router.home(), label: tCommon('actions.home') }}
      />

      <PublicListHighlights preview={preview} />

      <ListRestaurantRows restaurants={restaurants} emptyLabel={t('empty')} />

      {restaurants.length > 0 && (
        <StartSessionButton identifier={preview.share_code} setupHref={setupHref} />
      )}

      <p className="text-center text-sm text-muted-foreground">{t('pitch')}</p>
    </>
  )
}

/**
 * Ce qui fait qu'une liste se présente : les cuisines qu'on y trouve et le
 * restaurant que le groupe finit toujours par choisir. Le même bloc sur la
 * page publique et sur celle de qui a déjà un pseudo — une liste publique
 * est la même pour tout le monde.
 */
export function PublicListHighlights({ preview }: { preview: PublicListPreview }) {
  const t = useTranslations('lists.public')
  // Au-delà d'une poignée, l'énumération ne dit plus rien.
  const cuisines = preview.cuisines.slice(0, 6)

  return (
    <>
      {cuisines.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {cuisines.map((cuisine) => (
            <li key={cuisine}>
              <Badge variant="outline">{cuisine}</Badge>
            </li>
          ))}
        </ul>
      )}

      {preview.top_restaurant && (
        <p className="flex items-center gap-3 rounded-lg bg-fav-soft p-3 text-sm text-ink-2 ring-1 ring-fav/30">
          <RiTrophyLine aria-hidden="true" className="size-5 shrink-0 text-fav" />
          <span>
            {preview.top_restaurant_wins !== null
              ? t.rich('topWithWins', {
                  restaurant: preview.top_restaurant,
                  count: preview.top_restaurant_wins,
                  strong,
                })
              : t.rich('top', { restaurant: preview.top_restaurant, strong })}
          </span>
        </p>
      )}
    </>
  )
}

function strong(chunks: React.ReactNode) {
  return <strong className="font-semibold">{chunks}</strong>
}
