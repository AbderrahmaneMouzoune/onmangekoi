import { Shell } from '@/components/layout/shell'
import { Skeleton, SkeletonRow } from '@/components/ui/skeleton'

/**
 * Silhouette de navigation, commune à toutes les routes : elle ne peut rien
 * dire de la page visée, alors elle en garde le rythme — un en-tête, un bloc,
 * quelques cartes. Chaque route affine ensuite la sienne dans son `<Suspense>`.
 */
export default function Loading() {
  return (
    <Shell aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-2/3 sm:h-9" />
        <Skeleton className="h-5 w-1/2" />
      </div>
      <Skeleton className="h-40 w-full rounded-lg" />
      <div className="flex flex-col gap-2">
        <SkeletonRow nameWidth="w-44" />
        <SkeletonRow nameWidth="w-32" />
        <SkeletonRow nameWidth="w-40" />
      </div>
    </Shell>
  )
}
