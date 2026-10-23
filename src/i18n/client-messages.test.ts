import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { CLIENT_NAMESPACES, pickClientMessages } from './client-messages'
import { LOCALES } from './config'
import { MESSAGES } from './messages'

const SRC = path.join(process.cwd(), 'src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name)
    if (statSync(file).isDirectory()) return sourceFiles(file)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [file] : []
  })
}

function resolveImport(specifier: string, from: string): string | null {
  let base: string
  if (specifier.startsWith('@/')) base = path.join(SRC, specifier.slice(2))
  else if (specifier.startsWith('.')) base = path.resolve(path.dirname(from), specifier)
  else return null
  const candidates = [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), base]
  return candidates.find((file) => existsSync(file) && statSync(file).isFile()) ?? null
}

/** Imports de valeurs (les `import type` ne passent pas dans le bundle). */
const IMPORT =
  /(?:^|\n)\s*(import|export)(?!\s+type\b)[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

const SOURCES = new Map(sourceFiles(SRC).map((file) => [file, readFileSync(file, 'utf8')]))

const isClient = (code: string) => /^\s*['"]use client['"]/.test(code)
const isServerAction = (code: string) => /^\s*['"]use server['"]/.test(code)

function imports(file: string): string[] {
  return [...SOURCES.get(file)!.matchAll(IMPORT)]
    .map((match) => resolveImport(match[2] ?? match[3], file))
    .filter((target): target is string => target !== null && SOURCES.has(target))
}

/**
 * Modules du bundle navigateur atteints depuis `entries` : les `'use client'`
 * et tout ce qu'ils importent. Les modules serveur sont traversés sans être
 * comptés ; une Server Action (`'use server'`) n'entre dans le bundle que
 * comme référence, le parcours s'arrête donc à elle.
 */
function clientModules(entries: string[] = [...SOURCES.keys()]): Map<string, string> {
  const client = new Map<string, string>()
  const seenServer = new Set<string>()
  const queue = entries.map((file) => ({ file, client: isClient(SOURCES.get(file)!) }))
  while (queue.length > 0) {
    const { file, client: inClient } = queue.pop()!
    const code = SOURCES.get(file)!
    if (isServerAction(code)) continue
    const nowClient = inClient || isClient(code)
    if (nowClient ? client.has(file) : seenServer.has(file)) continue
    if (nowClient) client.set(file, code)
    else seenServer.add(file)
    // Sans `'use client'`, on ne suit que les modules serveur ; un module
    // client atteint depuis le serveur entre dans le bundle par son propre
    // `'use client'`.
    for (const target of imports(file)) queue.push({ file: target, client: nowClient })
  }
  return client
}

const covered = (namespace: string) =>
  CLIENT_NAMESPACES.some((picked) => namespace === picked || namespace.startsWith(`${picked}.`))

describe('messages envoyés au navigateur', () => {
  const modules = clientModules()

  it('couvrent chaque espace de noms lu par un Client Component', () => {
    const missing: string[] = []
    for (const [file, code] of modules) {
      for (const match of code.matchAll(/useTranslations\(\s*(?:['"]([^'"]*)['"])?\s*\)/g)) {
        const namespace = match[1]
        if (namespace === undefined || !covered(namespace)) {
          missing.push(`${path.relative(SRC, file)} : useTranslations(${namespace ?? ''})`)
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('ne lisent pas les traductions autrement que par useTranslations', () => {
    const others = [...modules]
      .filter(([, code]) => /\b(useMessages|getMessages)\b|useTranslations\(\s*[^'")\s]/.test(code))
      .map(([file]) => path.relative(SRC, file))
    expect(others).toEqual([])
  })

  it.each(LOCALES)('existent tous en %s', (locale) => {
    const picked = pickClientMessages(MESSAGES[locale]) as Record<string, unknown>
    for (const namespace of CLIENT_NAMESPACES) {
      const value = namespace
        .split('.')
        .reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], picked)
      expect(value, namespace).toBeDefined()
    }
  })

  it('laissent les textes rendus côté serveur hors du navigateur', () => {
    const picked = pickClientMessages(MESSAGES.fr)
    expect(picked).not.toHaveProperty('og')
    expect(picked).not.toHaveProperty('metadata')
    expect(picked).not.toHaveProperty('legal')
    expect(JSON.stringify(picked).length).toBeLessThan(JSON.stringify(MESSAGES.fr).length * 0.8)
  })
})

/** Ce que charge chaque page : le layout racine, l'en-tête, le pied de page, l'accueil. */
const EVERY_PAGE = [
  'app/[locale]/layout.tsx',
  'app/[locale]/(app)/layout.tsx',
  'app/[locale]/page.tsx',
].map((file) => path.join(SRC, file))

describe('JavaScript envoyé à chaque page', () => {
  it('n’embarque ni zod ni la validation des variables d’environnement', () => {
    const offenders = [...clientModules(EVERY_PAGE)]
      .filter(([, code]) => /from\s+['"](@\/env|zod|@t3-oss\/env-nextjs)['"]/.test(code))
      .map(([file]) => path.relative(SRC, file))
    expect(offenders).toEqual([])
  })
})
