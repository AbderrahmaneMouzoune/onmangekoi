import { describeRules } from '@/domain/session-rules'
import { cn } from '@/lib/utils'

import type { SessionRules } from '@/domain/session-rules'

const TONES = {
  /** Sur fond clair : salle d'attente, écrans de session */
  surface: 'border-line bg-surface text-ink-2',
  /** Sur l'ardoise : écran d'invitation */
  chalk: 'border-chalk/25 bg-chalk/10 text-chalk',
} as const

interface RulesSummaryProps {
  rules: SessionRules
  tone?: keyof typeof TONES
  className?: string
}

/**
 * Les règles du vote en trois pastilles. Elles se lisent avant d'entrer et
 * avant de voter : savoir qu'on n'aura pas de veto, ou que le classement
 * tombera à 80 % des votants, fait partie de ce à quoi on dit oui.
 */
export function RulesSummary({ rules, tone = 'surface', className }: RulesSummaryProps) {
  return (
    <ul aria-label="Règles du vote" className={cn('flex flex-wrap gap-1.5', className)}>
      {describeRules(rules).map((rule) => (
        <li
          key={rule}
          className={cn('rounded-full border px-2.5 py-1 text-[0.7rem] font-medium', TONES[tone])}
        >
          {rule}
        </li>
      ))}
    </ul>
  )
}
