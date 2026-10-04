import { useTranslations } from 'next-intl'

import type { PeopleLabels } from '@/lib/format'

/**
 * Libellés de repli des pseudos — invité sans pseudo, compte supprimé — dans
 * la langue de la personne (`common.people`), à passer à `participantLabel`.
 */
export function usePeopleLabels(): PeopleLabels {
  const t = useTranslations('common.people')
  return { guest: t('guest'), deletedParticipant: t('deletedParticipant') }
}
