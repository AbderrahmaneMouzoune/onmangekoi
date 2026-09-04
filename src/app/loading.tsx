import { Shell } from '@/components/layout/shell'
import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <Shell aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <Skeleton className="h-40 w-full rounded-lg" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    </Shell>
  )
}
