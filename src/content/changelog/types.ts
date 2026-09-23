import { z } from 'zod'

/**
 * Forme d'une note de version **produit** : ce qui change pour qui utilise
 * l'app, pas ce qui change dans le code.
 *
 * Le `CHANGELOG.md` technique est généré depuis les commits par
 * release-please ; ces notes-là sont écrites à la main, dans la langue des
 * utilisateurs, et c'est ce qu'affiche `/nouveautes`. Le schéma est vérifié
 * par les tests : une note mal formée casse la CI, jamais la page.
 */

/** Nature d'un changement, du point de vue de qui l'utilise. */
export const CHANGE_KINDS = ['new', 'improved', 'fixed'] as const
export type ChangeKind = (typeof CHANGE_KINDS)[number]

export const ChangeSchema = z.object({
  kind: z.enum(CHANGE_KINDS),
  /** Ce que la personne peut faire, à l'infinitif ou au présent. */
  title: z.string().trim().min(1, 'Titre requis').max(80, 'Titre trop long'),
  /** Deux phrases au plus : ce que ça change concrètement. */
  description: z.string().trim().min(1, 'Description requise').max(400, 'Description trop longue'),
})

export const ReleaseNoteSchema = z.object({
  /** Version publiée, telle que taguée par release-please (`X.Y.Z`, sans `v`). */
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version attendue au format X.Y.Z'),
  /** Date de publication, `AAAA-MM-JJ`. */
  date: z.iso.date('Date attendue au format AAAA-MM-JJ'),
  /** Nom de la version, côté produit : « Le vote qui va au bout ». */
  title: z.string().trim().min(1, 'Titre requis').max(60, 'Titre trop long'),
  /** Une phrase qui résume la livraison. */
  summary: z.string().trim().min(1, 'Résumé requis').max(240, 'Résumé trop long'),
  changes: z.array(ChangeSchema).min(1, 'Au moins un changement à annoncer'),
})

export type Change = z.infer<typeof ChangeSchema>
export type ReleaseNote = z.infer<typeof ReleaseNoteSchema>
