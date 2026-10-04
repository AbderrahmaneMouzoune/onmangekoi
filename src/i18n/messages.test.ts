import { readdirSync } from 'node:fs'
import path from 'node:path'

import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser'
import { describe, expect, it } from 'vitest'

import { LOCALES } from './config'
import { MESSAGES } from './messages'

type Tree = { [key: string]: string | Tree }

/** `{ a: { b: 'x' } }` → `[['a.b', 'x']]` */
function flatten(tree: Tree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const id = prefix ? `${prefix}.${key}` : key
    return typeof value === 'string' ? [[id, value] as [string, string]] : flatten(value, id)
  })
}

/**
 * Signature ICU d'un message : ses arguments avec leur type (`count:plural`,
 * `name:argument`) et ses balises (`<brand>`). Deux traductions d'une même clé
 * doivent avoir la même, sinon l'appel `t('clé', { … })` casse dans l'une.
 */
function signature(message: string): string[] {
  const found = new Set<string>()
  const visit = (elements: MessageFormatElement[]) => {
    for (const element of elements) {
      switch (element.type) {
        case TYPE.argument:
        case TYPE.number:
        case TYPE.date:
        case TYPE.time:
          found.add(`${element.value}:${TYPE[element.type]}`)
          break
        case TYPE.select:
        case TYPE.plural:
          found.add(`${element.value}:${TYPE[element.type]}`)
          for (const option of Object.values(element.options)) visit(option.value)
          break
        case TYPE.tag:
          found.add(`<${element.value}>`)
          visit(element.children)
          break
        default:
          break
      }
    }
  }
  visit(parse(message))
  return [...found].sort()
}

const MESSAGES_DIR = path.resolve(import.meta.dirname, '../../messages')

describe('messages', () => {
  const reference = new Map(flatten(MESSAGES.fr as Tree))

  it('should load every namespace file of every locale', () => {
    // Un fichier ajouté dans `messages/<langue>/` mais oublié dans
    // `messages.ts` ne serait jamais servi.
    for (const locale of LOCALES) {
      const files = readdirSync(path.join(MESSAGES_DIR, locale))
        .filter((file) => file.endsWith('.json'))
        .map((file) => file.replace(/\.json$/, ''))
        .sort()
      expect(files).toEqual(Object.keys(MESSAGES[locale]).sort())
    }
  })

  it.each(LOCALES.filter((locale) => locale !== 'fr'))(
    'should give %s exactly the keys of the French reference',
    (locale) => {
      const keys = flatten(MESSAGES[locale] as Tree).map(([key]) => key)
      expect(keys.sort()).toEqual([...reference.keys()].sort())
    }
  )

  it.each(LOCALES.filter((locale) => locale !== 'fr'))(
    'should give %s the same ICU arguments as French',
    (locale) => {
      for (const [key, message] of flatten(MESSAGES[locale] as Tree)) {
        const french = reference.get(key)
        if (french === undefined) continue
        expect({ key, args: signature(message) }).toEqual({ key, args: signature(french) })
      }
    }
  )

  it.each(LOCALES)('should only hold valid ICU messages in %s', (locale) => {
    for (const [key, message] of flatten(MESSAGES[locale] as Tree)) {
      expect(() => parse(message), key).not.toThrow()
    }
  })

  it.each(LOCALES)('should use the typographic apostrophe in %s', (locale) => {
    // En ICU, l'apostrophe droite échappe les accolades : `l'{name}` perdrait
    // son argument. La typographie du produit est de toute façon `’`.
    for (const [key, message] of flatten(MESSAGES[locale] as Tree)) {
      expect(message.includes("'"), key).toBe(false)
    }
  })
})
