import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silhouette du sélecteur de restaurants : le rail des sources, le champ de
 * recherche et la liste de résultats, aux dimensions exactes du vrai
 * sélecteur. Rendue sur le serveur, elle n'ajoute rien au bundle envoyé au
 * navigateur.
 */
export function RestaurantPickerFallback() {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
        <Skeleton className="h-9 rounded-md bg-surface" />
        <Skeleton className="h-9 rounded-md bg-line" />
      </div>
      <Skeleton className="h-11 w-full rounded-md" />
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
