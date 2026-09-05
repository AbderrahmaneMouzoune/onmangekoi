/**
 * Cache mémoire à durée de vie, borné en taille.
 *
 * Sert à ne pas repayer un appel Google pour la même recherche : le contenu
 * est purement dérivé d'une API publique, jamais lié à un utilisateur, donc
 * partageable entre les requêtes d'une même instance. Une instance froide
 * repart simplement d'un cache vide.
 *
 * L'éviction est LRU : `get` remet l'entrée en fin de `Map`, et c'est la
 * première clé (la plus ancienne) qui saute quand `maxEntries` est atteint.
 */
export class TtlCache<T> {
  readonly #ttlMs: number
  readonly #maxEntries: number
  readonly #entries = new Map<string, { value: T; expiresAt: number }>()

  constructor(options: { ttlMs: number; maxEntries?: number }) {
    this.#ttlMs = options.ttlMs
    this.#maxEntries = options.maxEntries ?? 100
  }

  get(key: string, now = Date.now()): T | undefined {
    const entry = this.#entries.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= now) {
      this.#entries.delete(key)
      return undefined
    }
    // Remise en fin de file : l'entrée redevient la plus récemment utilisée.
    this.#entries.delete(key)
    this.#entries.set(key, entry)
    return entry.value
  }

  set(key: string, value: T, now = Date.now()): void {
    this.#entries.delete(key)
    this.#entries.set(key, { value, expiresAt: now + this.#ttlMs })
    while (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next()
      if (oldest.done) break
      this.#entries.delete(oldest.value)
    }
  }

  get size(): number {
    return this.#entries.size
  }

  clear(): void {
    this.#entries.clear()
  }
}
