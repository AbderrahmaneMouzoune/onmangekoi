import 'server-only'

import { z } from 'zod'

import type { McpServer } from '@modelcontextprotocol/server'

/**
 * Prompts MCP : des raccourcis que les clients proposent à l'utilisateur
 * (« / » dans Claude). Ils ne font qu'écrire une demande en son nom ; ce sont
 * les tools qui agissent, avec leurs garde-fous. Rédigés en français, comme
 * l'utilisateur les lit dans le menu de son client ; le modèle répondra dans
 * la langue de la conversation (voir les consignes du serveur).
 */

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'jai-mange',
    {
      title: "J'ai mangé à…",
      description: 'Note un resto que tu as aimé et range-le dans tes listes.',
      argsSchema: z.object({
        restaurant: z.string().trim().min(1).max(200).describe('Le resto, et la ville si tu veux'),
        avis: z.string().trim().max(500).optional().describe('Ce que tu en as pensé'),
      }),
    },
    ({ restaurant, avis }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `J'ai mangé à ${restaurant}${avis ? ` : ${avis}` : ''}. Ajoute-le à mes listes onmangekoi s'il n'y est pas déjà.`,
          },
        },
      ],
    })
  )

  server.registerPrompt(
    'partager-une-liste',
    {
      title: 'Partager une liste',
      description: 'Prépare un message pour partager une de tes listes de restos.',
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: "Montre-moi mes listes onmangekoi, puis rédige un court message pour partager celle que je choisis, avec son lien et les restos qu'elle contient.",
          },
        },
      ],
    })
  )
}
