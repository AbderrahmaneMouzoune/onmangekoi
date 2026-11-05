import { RiArrowDownSLine, RiSparkling2Line } from '@remixicon/react'
import { useTranslations } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'

import {
  ConnectedAppsList,
  loadConnectedApps,
  McpConnectorUrl,
} from '@/components/account/account-connected-apps-section'
import { AiTokenCreator } from '@/components/account/ai-token-creator'
import { RevokeAiTokenButton } from '@/components/account/revoke-ai-token-button'
import { Skeleton } from '@/components/ui/skeleton'
import { getMyApiTokens, type ApiTokenSummary } from '@/data-access/ai-tokens'
import { getCurrentViewer } from '@/data-access/auth'
import { createServerClient } from '@/data-access/supabase/server'
import { isLocale } from '@/i18n/config'
import { relativeDate } from '@/lib/format'
import { MCP_PATH } from '@/lib/mcp/endpoint'
import { absoluteUrl } from '@/lib/site'

/**
 * « Assistants IA » : une seule zone pour brancher Claude, ChatGPT ou Cursor
 * sur le serveur MCP (`/api/mcp`), qui accepte deux façons de se connecter.
 *
 * 1. **La connexion recommandée**, OAuth : on colle l'adresse du serveur dans
 *    les connecteurs de l'assistant, on se connecte à onmangekoi et on
 *    autorise. Rien à copier de secret, tous les tools ouverts, et chaque app
 *    autorisée se déconnecte d'ici.
 * 2. **Le jeton personnel** `omk_…`, replié en second : pour les clients qui
 *    ne savent pas faire OAuth. Il ne couvre que le catalogue et les listes —
 *    la zone le dit avant qu'on en crée un. Il s'ouvre d'office quand des
 *    jetons existent, pour qu'on les voie et puisse les révoquer.
 */
export async function AccountAiSection() {
  const user = await getCurrentViewer()
  if (!user) return null

  const supabase = await createServerClient()
  const [apps, tokens] = await Promise.all([loadConnectedApps(), getMyApiTokens(supabase)])

  return (
    <SectionFrame>
      <div className="flex flex-col gap-3">
        <RecommendedTitle />
        <McpConnectorUrl url={absoluteUrl(MCP_PATH)} />
        <ConnectedAppsList result={apps} />
      </div>
      <PersonalTokens tokens={tokens} />
    </SectionFrame>
  )
}

function RecommendedTitle() {
  const t = useTranslations('account.ai.recommended')
  return <h3 className="text-sm font-semibold text-ink">{t('title')}</h3>
}

/**
 * Le repli par jeton personnel, dans un `<details>` natif : il s'ouvre au
 * clavier, s'annonce seul et fonctionne avant que le JavaScript n'arrive.
 * Les jetons existants se lisent par leur nom et leurs derniers caractères,
 * jamais en entier : la base n'en garde que l'empreinte.
 */
async function PersonalTokens({ tokens }: { tokens: ApiTokenSummary[] }) {
  const [t, rawLocale] = await Promise.all([getTranslations('account.ai'), getLocale()])
  const locale = isLocale(rawLocale) ? rawLocale : 'fr'

  return (
    <details open={tokens.length > 0} className="group rounded-md ring-1 ring-line">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-2 rounded-md px-3 py-2.5 outline-none focus-visible:ring-3 focus-visible:ring-brand [&::-webkit-details-marker]:hidden">
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-ink">{t('token.title')}</span>
          <span className="text-xs text-muted-foreground">{t('token.summary')}</span>
        </span>
        <RiArrowDownSLine
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>

      <div className="flex flex-col gap-4 border-t border-line p-3">
        <p className="text-sm text-ink-2">{t('token.scope')}</p>
        <AiTokenCreator endpoint={absoluteUrl(MCP_PATH)} />

        {tokens.length > 0 && (
          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-medium text-ink">{t('tokens.title')}</h4>
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
                  <RevokeAiTokenButton tokenId={token.id} label={token.label} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  )
}

/** Titre et présentation : les mêmes pour tout le monde, silhouette comprise. */
function SectionFrame({ children, busy }: { children: React.ReactNode; busy?: boolean }) {
  const t = useTranslations('account.ai')
  return (
    <section
      aria-busy={busy || undefined}
      aria-labelledby="ai-assistants-title"
      className="flex flex-col gap-4 rounded-lg bg-surface p-4 ring-1 ring-line"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="ai-assistants-title"
          className="flex items-center gap-2 font-display text-base font-semibold"
        >
          <RiSparkling2Line aria-hidden="true" className="size-4.5 text-muted-foreground" />
          {t('title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
        <p className="text-sm text-ink-2 italic">{t('example')}</p>
      </div>
      {children}
    </section>
  )
}

/** Silhouette : l'explication est la même pour tout le monde. */
export function AccountAiFallback() {
  return (
    <SectionFrame busy>
      <Skeleton className="h-9 w-full rounded-md" />
      <Skeleton className="h-14 w-full rounded-md" />
      <Skeleton className="h-11 w-full rounded-md" />
    </SectionFrame>
  )
}
