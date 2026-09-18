import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silhouette du sélecteur de restaurants : champ de recherche, chips de
 * filtre, bouton d'ajout et liste de résultats, aux dimensions exactes du vrai
 * sélecteur. Rendue sur le serveur, elle n'ajoute rien au bundle envoyé au
 * navigateur.
 */
export function RestaurantPickerFallback() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-11 w-full rounded-md" />
      <div className="flex flex-col gap-3 rounded-lg bg-surface p-3 ring-1 ring-line">
        <SkeletonChips widths={['w-10', 'w-12', 'w-14', 'w-16']} />
        <SkeletonChips widths={['w-24', 'w-16', 'w-16', 'w-20']} />
        <SkeletonChips widths={['w-32']} />
      </div>
      <Skeleton className="h-9 w-36 rounded-md" />
      <div className="flex flex-col gap-1 rounded-lg bg-surface p-1.5 ring-1 ring-line">
        <SkeletonPick nameWidth="w-40" />
        <SkeletonPick nameWidth="w-32" />
        <SkeletonPick nameWidth="w-44" />
        <SkeletonPick nameWidth="w-36" />
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

/** Rangée de résultat : la pastille à cocher, le nom, sa description. */
function SkeletonPick({ nameWidth }: { nameWidth: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <Skeleton className="size-5 shrink-0 rounded-full" />
      <div className="flex flex-1 flex-col gap-1.5">
        <Skeleton className={`h-4 ${nameWidth}`} />
        <Skeleton className="h-3.5 w-24" />
      </div>
    </div>
  )
}
