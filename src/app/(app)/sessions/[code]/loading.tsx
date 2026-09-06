import { Shell } from '@/components/layout/shell'
import { SessionRoomFallback } from '@/components/session/session-room-section'

/** La navigation vers une session montre exactement la silhouette du salon. */
export default function SessionLoading() {
  return (
    <Shell>
      <SessionRoomFallback />
    </Shell>
  )
}
