import { Shell } from '@/components/layout/shell'
import { Skeleton } from '@/components/ui/skeleton'

export default function SessionLoading() {
  return (
    <Shell aria-busy="true">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <Skeleton className="aspect-[4/5] w-full rounded-xl sm:aspect-[5/6]" />
      <div className="grid grid-cols-4 gap-2">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>
    </Shell>
  )
}
