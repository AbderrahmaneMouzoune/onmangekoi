import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silhouette du sélecteur de restaurants : le rail des sources, le champ de
 * recherche, les chips de filtre et la liste de résultats, aux dimensions
 * exactes du vrai sélecteur. Rendue sur le serveur, elle n'ajoute rien au
 * bundle envoyé au navigateur.
 */
export function RestaurantPickerFallback() {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
        <Skeleton className="h-9 rounded-md bg-surface" />
        <Skeleton className="h-9 rounded-md bg-line" />
      </div>
      <Skeleton className="h-11 w-full rounded-md" />
      {/* Budget et régime : la rangée « distance » n'apparaît qu'une fois la
          position donnée, la silhouette ne la promet donc pas. */}
      <div className="flex flex-col gap-3 rounded-lg bg-surface p-3 ring-1 ring-line">
        <SkeletonChips widths={['w-10', 'w-12', 'w-14', 'w-16']} />
        <SkeletonChips widths={['w-24', 'w-16', 'w-16', 'w-20']} />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
      <div className="flex flex-col gap-1 rounded-lg bg-surface p-1.5 ring-1 ring-line">
        <SkeletonPick nameWidth="w-40" />
        <SkeletonPick nameWidth="w-32" />
        <SkeletonPick nameWidth="w-44" />
        <SkeletonPick nameWidth="w-36" />
      </div>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-9 w-48 rounded-md" />
      </div>
    </div>
  )
}

/** Rangée de chips : l'intitulé du filtre, puis ses choix. */
function SkeletonChips({ widths }: { widths: string[] }) {
  return (
    <div className="flex items-center gap-3">
      <Skeleton className="h-3 w-16 shrink-0" />
      <div className="flex flex-wrap gap-1.5">
        {widths.map((width) => (
          <Skeleton key={width} className={`h-8 rounded-full ${width}`} />
        ))}
      </div>
    </div>
  )
}

/** Carte de résultat : la pastille à cocher, la vignette, le nom et ses infos. */
function SkeletonPick({ nameWidth }: { nameWidth: string }) {
  return (
    <div className="flex items-center gap-3 p-2">
      <Skeleton className="size-5 shrink-0 rounded-full" />
      <Skeleton className="size-14 shrink-0 rounded-lg" />
      <div className="flex flex-1 flex-col gap-1.5">
        <Skeleton className={`h-4 ${nameWidth}`} />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-36" />
      </div>
    </div>
  )
}
