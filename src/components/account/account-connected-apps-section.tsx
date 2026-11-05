import { useTranslations } from 'next-intl'
import { getFormatter, getTranslations } from 'next-intl/server'

import { toConnectedApps, type ConnectedApp } from '@/components/account/oauth'
import { RevokeGrantButton } from '@/components/account/revoke-grant-button'
import { Badge } from '@/components/ui/badge'
import { CopyButton } from '@/components/ui/copy-button'
import { createServerClient } from '@/data-access/supabase/server'

type GrantsResult = { ok: true; apps: ConnectedApp[] } | { ok: false }

/**
 * Les apps autorisées par la personne. Le serveur OAuth peut ne pas être
 * activé sur le projet Supabase (stack locale, préprod) : `listGrants` répond
 * alors en erreur, voire lève. La zone le dit sobrement, sans casser la page
 * compte.
 */
export async function loadConnectedApps(): Promise<GrantsResult> {
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
 * La connexion recommandée : l'adresse du serveur MCP à coller telle quelle
 * dans les connecteurs de Claude ou ChatGPT. Le client découvre seul le
 * serveur d'autorisation et la personne consent sur onmangekoi : aucune clé ne
 * transite par le presse-papier.
 */
export function McpConnectorUrl({ url }: { url: string }) {
  const t = useTranslations('oauth.connectedApps')
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">{t('howTo')}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md bg-surface-2 px-3 py-2 font-mono text-sm">
          {url}
        </code>
        <CopyButton value={url} label={t('copy')} variant="outline" size="sm" />
      </div>
    </div>
  )
}

/**
 * Apps connectées par OAuth (assistants branchés sur le serveur MCP) : chaque
 * autorisation, révocable d'un « Déconnecter ». Rendue dans la zone
 * « Assistants IA » de la page compte, qui charge les autorisations.
 */
export async function ConnectedAppsList({ result }: { result: GrantsResult }) {
  const [t, format] = await Promise.all([getTranslations('oauth.connectedApps'), getFormatter()])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-medium text-ink">{t('title')}</h3>
        <p className="text-xs text-muted-foreground">{t('description')}</p>
      </div>

      {!result.ok ? (
        <p className="text-sm text-muted-foreground">{t('unavailable')}</p>
      ) : result.apps.length === 0 ? (
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
    </div>
  )
}
