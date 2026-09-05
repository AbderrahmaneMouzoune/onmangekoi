import { cn } from '@/lib/utils'

interface InviteCodeProps {
  code: string
  className?: string
}

/**
 * Le code d'invitation en tuiles : un caractère par case, deux groupes de trois,
 * lisible de l'autre côté de la table. Le code brut est exposé pour les
 * lecteurs d'écran et les tests (`data-code`).
 */
export function InviteCode({ code, className }: InviteCodeProps) {
  const chars = code.toUpperCase().split('')
  const spoken = chars.join(' ')

  return (
    <div
      data-testid="invite-code"
      data-code={code.toUpperCase()}
      role="img"
      aria-label={`Code d’invitation : ${spoken}`}
      className={cn('flex items-center gap-1.5', className)}
    >
      {chars.map((char, index) => (
        <span
          key={`${char}-${index}`}
          aria-hidden="true"
          className={cn(
            'flex h-14 flex-1 items-center justify-center rounded-md bg-chalk font-mono text-3xl font-semibold text-slate tabular sm:h-16 sm:text-4xl',
            index === 2 && 'mr-2'
          )}
        >
          {char}
        </span>
      ))}
    </div>
  )
}
