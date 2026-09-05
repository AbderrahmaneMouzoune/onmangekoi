import { z } from 'zod'

export const SubmitVoteSchema = z.object({
  sessionId: z.uuid(),
  sessionRestaurantId: z.uuid(),
  value: z.union([z.literal(-2), z.literal(0), z.literal(1), z.literal(2)]),
})

export type SubmitVoteInput = z.infer<typeof SubmitVoteSchema>
