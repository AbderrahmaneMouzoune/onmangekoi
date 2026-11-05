import { RiPlugLine } from '@remixicon/react'
import { useTranslations } from 'next-intl'
import { getFormatter, getTranslations } from 'next-intl/server'

import { toConnectedApps, type ConnectedApp } from '@/components/account/oauth'
import { RevokeGrantButton } from '@/components/account/revoke-grant-button'
import { Badge } from '@/components/ui/badge'
import { CopyButton } from '@/components/ui/copy-button'
import { Skeleton } from '@/components/ui/skeleton'
import { getCurrentUser } from '@/data-access/auth'
import { createServerClient } from '@/data-access/supabase/server'
import { absoluteUrl } from '@/lib/site'

/** Adresse du serveur MCP, celle qu'on colle dans les connecteurs de l'assistant. */
const MCP_PATH = '/api/mcp'

type GrantsResult = { ok: true; apps: ConnectedApp[] } | { ok: false }

/**
 * Les apps autorisées par la personne. Le serveur OAuth peut ne pas être
 * activé sur le projet Supabase (stack locale, préprod) : `listGrants` répond
 * alors en erreur, voire lève. La section le dit sobrement, sans casser la
 * page compte.
 */
async function loadConnectedApps(): Promise<GrantsResult> {
  try {
    const supabase = await createServerClient()
    const { data, error } = await supabase.auth.oauth.listGrants()
    if (error || !data) return { ok: false }
    return { ok: true, apps: toConnectedApps(data) }
  } catch {
    return { ok: false }
  }
}

/**
 * Apps connectées (assistants IA branchés sur le serveur MCP) : la liste des
 * autorisations, chacune révocable, et de quoi en connecter une nouvelle.
 */
export async function AccountConnectedAppsSection() {
  const user = await getCurrentUser()
  if (!user) return null

  const [result, t, format] = await Promise.all([
    loadConnectedApps(),
    getTranslations('oauth.connectedApps'),
    getFormatter(),
  ])
  const mcpUrl = absoluteUrl(MCP_PATH)

  return (
    <SectionFrame>
      {!result.ok ? (
        <p className="text-sm text-muted-foreground">{t('unavailable')}</p>
      ) : (
        <>
          {result.apps.length === 0 ? (
            <p className="rounded-md border border-dashed border-line-strong px-3 py-4 text-center text-sm text-muted-foreground">
              {t('empty')}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {result.apps.map((app) => {
                const name = app.name ?? app.host ?? t('unnamed')
                return (
                  <li
                    key={app.clientId}
                    className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="truncate font-semibold">{name}</p>
                      {app.host && app.host !== name && (
                        <p className="truncate text-xs text-muted-foreground">{app.host}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {t('grantedAt', {
                          date: format.dateTime(new Date(app.grantedAt), { dateStyle: 'long' }),
                        })}
                      </p>
                      {app.scopes.length > 0 && (
                        <ul aria-label={t('scopes')} className="flex flex-wrap gap-1">
                          {app.scopes.map((scope) => (
                            <li key={scope}>
                              <Badge variant="outline" className="font-mono">
                                {scope}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <RevokeGrantButton
                      clientId={app.clientId}
                      labels={{
                        disconnect: t('disconnect'),
                        confirm: t('confirmDisconnect'),
                        accessible: t('disconnectLabel', { client: name }),
                      }}
                    />
                  </li>
                )
              })}
            </ul>
          )}

          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">{t('howTo')}</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-surface-2 px-3 py-2 font-mono text-sm">
                {mcpUrl}
              </code>
              <CopyButton value={mcpUrl} label={t('copy')} variant="outline" size="sm" />
            </div>
          </div>
        </>
      )}
    </SectionFrame>
  )
}

/** Titre et présentation : les mêmes pour tout le monde, silhouette comprise. */
function SectionFrame({ children, busy }: { children: React.ReactNode; busy?: boolean }) {
  const t = useTranslations('oauth.connectedApps')
  return (
    <section
      aria-busy={busy || undefined}
      aria-labelledby="connected-apps-title"
      className="flex flex-col gap-3 rounded-lg bg-surface p-4 ring-1 ring-line"
    >
      <div className="flex flex-col gap-0.5">
        <h2
          id="connected-apps-title"
          className="flex items-center gap-2 font-display text-base font-semibold"
        >
          <RiPlugLine aria-hidden="true" className="size-4.5 text-muted-foreground" />
          {t('title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>
      {children}
    </section>
  )
}

export function AccountConnectedAppsFallback() {
  return (
    <SectionFrame busy>
      <Skeleton className="h-14 w-full rounded-md" />
      <Skeleton className="h-9 w-full rounded-md" />
    </SectionFrame>
  )
}
