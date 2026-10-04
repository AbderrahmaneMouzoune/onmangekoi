import { pwaIconResponse } from '@/components/og/app-icon'

/** Icône maskable 512 px du manifest (voir `src/lib/pwa/icons.ts`). */
export function GET() {
  return pwaIconResponse(512, 'maskable')
}
