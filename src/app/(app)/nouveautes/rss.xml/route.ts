import { router } from '@/config/router.config'
import { getReleaseNotes } from '@/content/changelog'
import { SITE_NAME } from '@/lib/brand'
import { absoluteUrl } from '@/lib/site'

import type { ReleaseNote } from '@/content/changelog'

/**
 * Flux RSS des nouveautés : de quoi suivre les versions sans revenir sur le
 * site, et sans laisser d'adresse email.
 *
 * Le contenu vient du dépôt, pas de la base : rien à lire par requête, la
 * réponse est la même pour tout le monde et se met en cache.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function itemFor(note: ReleaseNote): string {
  const url = `${absoluteUrl(router.changelog())}#v${note.version}`
  const body = [
    note.summary,
    ...note.changes.map((change) => `• ${change.title} — ${change.description}`),
  ].join('\n\n')

  return [
    '    <item>',
    `      <title>${escapeXml(`v${note.version} — ${note.title}`)}</title>`,
    `      <link>${escapeXml(url)}</link>`,
    `      <guid isPermaLink="false">${escapeXml(`${SITE_NAME}-v${note.version}`)}</guid>`,
    `      <pubDate>${new Date(`${note.date}T09:00:00Z`).toUTCString()}</pubDate>`,
    `      <description>${escapeXml(body)}</description>`,
    '    </item>',
  ].join('\n')
}

export async function GET() {
  const notes = getReleaseNotes()
  const feed = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '  <channel>',
    `    <title>${escapeXml(`${SITE_NAME} — Nouveautés`)}</title>`,
    `    <link>${escapeXml(absoluteUrl(router.changelog()))}</link>`,
    `    <description>${escapeXml(`Les nouvelles versions de ${SITE_NAME}, racontées côté produit.`)}</description>`,
    '    <language>fr</language>',
    ...notes.map(itemFor),
    '  </channel>',
    '</rss>',
  ].join('\n')

  return new Response(feed, {
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
