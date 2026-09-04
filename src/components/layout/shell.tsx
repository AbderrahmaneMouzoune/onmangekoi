import { cn } from '@/lib/utils'

interface ShellProps {
  children: React.ReactNode
  className?: string
  /** Colonne large (listes, résultats) */
  wide?: boolean
}

/** Colonne de contenu mobile-first, centrée sur grand écran. */
export function Shell({ children, className, wide = false }: ShellProps) {
  return (
    <main
      className={cn(
        'mx-auto flex w-full flex-1 flex-col gap-6 px-4 pt-6 pb-16 safe-bottom',
        wide ? 'max-w-2xl' : 'max-w-lg',
        className
      )}
    >
      {children}
    </main>
  )
}
