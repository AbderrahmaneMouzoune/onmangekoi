import { RiLoader4Line } from '@remixicon/react'

import { cn } from '@/lib/utils'

export function Spinner({ className }: { className?: string }) {
  return <RiLoader4Line aria-hidden="true" className={cn('size-4.5 animate-spin', className)} />
}
