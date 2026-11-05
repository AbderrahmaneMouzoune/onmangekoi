'use client'

import { RiKey2Line } from '@remixicon/react'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

import { createApiTokenAction } from '@/actions/ai-tokens'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { FormMessage } from '@/components/ui/form-message'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { claudeCodeCommand, mcpJsonConfig, mcpSecretUrl } from '@/lib/mcp/endpoint'

/**
 * Crée un jeton et montre, une seule fois, de quoi le coller dans son IA :
 * l'URL secrète (Claude.ai, ChatGPT), la commande Claude Code, le bloc JSON
 * des autres clients. Une fois la page quittée, le jeton ne se relit plus.
 */
export function AiTokenCreator({ endpoint }: { endpoint: string }) {
  const t = useTranslations('account.ai')
  const [label, setLabel] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createApiTokenAction(label)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setToken(result.data.token)
      setLabel('')
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={create} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="ai-token-label">{t('form.label')}</Label>
          <Input
            id="ai-token-label"
            value={label}
            maxLength={60}
            placeholder={t('form.placeholder')}
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? <Spinner /> : <RiKey2Line aria-hidden="true" />}
          {t('form.submit')}
        </Button>
      </form>
      <FormMessage error={error} />

      {token && (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-md bg-brand-soft p-3 ring-1 ring-brand/30"
        >
          <p className="text-sm font-medium text-ink">{t('created.warning')}</p>

          <Snippet
            title={t('created.urlTitle')}
            hint={t('created.urlHint')}
            value={mcpSecretUrl(endpoint, token)}
          />
          <Snippet
            title={t('created.claudeCodeTitle')}
            value={claudeCodeCommand(endpoint, token)}
          />
          <Snippet
            title={t('created.jsonTitle')}
            hint={t('created.jsonHint')}
            value={mcpJsonConfig(endpoint, token)}
          />
        </div>
      )}
    </div>
  )
}

function Snippet({ title, hint, value }: { title: string; hint?: string; value: string }) {
  const t = useTranslations('account.ai.created')
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink">{title}</span>
        <CopyButton value={value} label={t('copy')} size="sm" variant="outline" />
      </div>
      {hint && <p className="text-xs text-ink-2">{hint}</p>}
      <pre className="overflow-x-auto rounded-sm bg-surface p-2 font-mono text-xs break-all whitespace-pre-wrap text-ink ring-1 ring-line">
        {value}
      </pre>
    </div>
  )
}
