import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function Page() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <div className="space-y-2">
          <div className="text-5xl">🍴</div>
          <h1 className="text-2xl font-bold">onmangekoi</h1>
          <p className="text-sm text-muted-foreground">Décidez où manger ensemble, sans débat.</p>
        </div>
        <div className="flex w-full flex-col gap-2">
          <Link href="/sessions/new" className={cn(buttonVariants())}>
            Créer une session
          </Link>
          <Link href="/join" className={cn(buttonVariants({ variant: 'outline' }))}>
            Rejoindre une session
          </Link>
        </div>
      </div>
    </div>
  )
}
