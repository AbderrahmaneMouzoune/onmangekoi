/**
 * Adresses et extraits de configuration du serveur MCP, pour la page compte
 * et `llms.txt`. Pur : importable du client comme du serveur.
 */

/** Chemin du serveur MCP (Streamable HTTP). */
export const MCP_PATH = '/api/mcp'

/**
 * Paramètre d'URL qui porte le jeton, pour les clients qui ne savent pas
 * ajouter d'en-tête (connecteurs personnalisés de Claude.ai, ChatGPT…).
 */
export const MCP_KEY_PARAM = 'key'

/** URL « secrète » : le jeton voyage dans l'adresse. À garder pour soi. */
export function mcpSecretUrl(endpoint: string, token: string): string {
  const url = new URL(endpoint)
  url.searchParams.set(MCP_KEY_PARAM, token)
  return url.toString()
}

/** Commande Claude Code : le jeton voyage en en-tête, hors de l'URL. */
export function claudeCodeCommand(endpoint: string, token: string): string {
  return `claude mcp add --transport http onmangekoi ${endpoint} --header "Authorization: Bearer ${token}"`
}

/** Bloc `mcpServers` : Cursor, Claude Desktop, Windsurf, VS Code… */
export function mcpJsonConfig(endpoint: string, token: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        onmangekoi: { url: endpoint, headers: { Authorization: `Bearer ${token}` } },
      },
    },
    null,
    2
  )
}
