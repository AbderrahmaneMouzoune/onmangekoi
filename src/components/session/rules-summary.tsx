import { useLocale, useTranslations } from 'next-intl'

import { describeRules } from '@/domain/session-rules'
import { percentLabel } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { RuleLine, SessionRules } from '@/domain/session-rules'

const TONES = {
  /** Sur fond clair : salle d'attente, écrans de session */
  surface: 'border-line bg-surface text-ink-2',
  /** Sur l'ardoise : écran d'invitation */
  chalk: 'border-chalk/25 bg-chalk/10 text-chalk',
} as const

/**
 * Une ligne du résumé des règles, dans la langue de la personne. Le seuil est
 * un ratio : il se formate ici (« 80 % », « 80% »), pas dans le domaine.
 */
export function useRuleLineText(): (line: RuleLine) => string {
  const t = useTranslations('session.rules.lines')
  const locale = useLocale()
  // Pas de `useCallback` : le résumé se rend aussi dans des Server
  // Components (écran d'invitation), et la fonction ne coûte rien.
  return (line) => {
    switch (line.kind) {
      case 'superlikes':
      case 'vetos':
        return t(line.kind, { count: line.count })
      case 'closeAtRatio':
        return t('closeAtRatio', { ratio: percentLabel(line.ratio, locale) })
      default:
        return t(line.kind)
    }
  }
}

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
  const t = useTranslations('session.rules')
  const describe = useRuleLineText()
  return (
    <ul aria-label={t('label')} className={cn('flex flex-wrap gap-1.5', className)}>
      {describeRules(rules).map((line) => (
        <li
          key={line.kind}
          className={cn('rounded-full border px-2.5 py-1 text-[0.7rem] font-medium', TONES[tone])}
        >
          {describe(line)}
        </li>
      ))}
    </ul>
  )
}
