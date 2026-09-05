import { z } from 'zod'

import { VOTE_VALUES } from '@/domain/vote'

export const SubmitVoteSchema = z.object({
  sessionId: z.uuid(),
  sessionRestaurantId: z.uuid(),
  /** Les quatre valeurs de vote sont définies une seule fois, dans `domain/vote`. */
  value: z.literal(VOTE_VALUES),
})

export type SubmitVoteInput = z.infer<typeof SubmitVoteSchema>
