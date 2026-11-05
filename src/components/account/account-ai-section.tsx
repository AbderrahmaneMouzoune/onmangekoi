import { RiSparkling2Line } from '@remixicon/react'
import { useTranslations } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'

import { AiTokenCreator } from '@/components/account/ai-token-creator'
import { RevokeAiTokenButton } from '@/components/account/revoke-ai-token-button'
import { Skeleton } from '@/components/ui/skeleton'
import { getMyApiTokens } from '@/data-access/ai-tokens'
import { getCurrentViewer } from '@/data-access/auth'
import { createServerClient } from '@/data-access/supabase/server'
import { env } from '@/env'
import { isLocale } from '@/i18n/config'
import { relativeDate } from '@/lib/format'
import { mcpEndpoint } from '@/lib/mcp'

/**
 * « Connecter ton IA » : un jeton personnel, et Claude, ChatGPT ou Cursor
 * tiennent tes listes à ta place. « J'ai mangé à La Ba, c'était bon » suffit
 * pour que le resto soit cherché, ajouté s'il manque, et rangé.
 *
 * Les jetons existants se lisent par leur nom et leurs derniers caractères,
 * jamais en entier : la base n'en garde que l'empreinte.
 */
export async function AccountAiSection() {
  const [supabase, user] = await Promise.all([createServerClient(), getCurrentViewer()])
  if (!user) return null

  const [tokens, t, rawLocale] = await Promise.all([
    getMyApiTokens(supabase),
    getTranslations('account.ai'),
    getLocale(),
  ])
  const locale = isLocale(rawLocale) ? rawLocale : 'fr'

  return (
    <section className="flex flex-col gap-4 rounded-lg bg-surface p-4 ring-1 ring-line">
      <Intro />
      <AiTokenCreator endpoint={mcpEndpoint(env.SITE_URL)} />

      {tokens.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-ink">{t('tokens.title')}</h3>
          <ul className="flex flex-col gap-1.5">
            {tokens.map((token) => (
              <li
                key={token.id}
                className="flex items-center gap-3 rounded-md bg-surface-2 py-2 pr-2 pl-3"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">
                    {token.label}{' '}
                    <span className="font-mono text-xs text-muted-foreground">
                      …{token.token_hint}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {token.last_used_at
                      ? t('tokens.lastUsed', { when: relativeDate(token.last_used_at, locale) })
                      : t('tokens.neverUsed')}
                  </span>
                </div>
                <RevokeAiTokenButton tokenId={token.id} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function Intro() {
  const t = useTranslations('account.ai')
  return (
    <div className="flex flex-col gap-1">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        <RiSparkling2Line aria-hidden="true" className="size-4.5 text-muted-foreground" />
        {t('title')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('description')}</p>
      <p className="text-sm text-ink-2 italic">{t('example')}</p>
    </div>
  )
}

/** Silhouette : l'explication est la même pour tout le monde. */
export function AccountAiFallback() {
  return (
    <section
      aria-busy="true"
      className="flex flex-col gap-4 rounded-lg bg-surface p-4 ring-1 ring-line"
    >
      <Intro />
      <Skeleton className="h-11 w-full" />
    </section>
  )
}
