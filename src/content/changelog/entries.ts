import type { ReleaseNote } from './types'

/**
 * Notes de version produit, de la plus récente à la plus ancienne.
 *
 * Une entrée par version publiée. Elle s'écrit **après** la release (le
 * workflow « Release » ouvre l'issue de rédaction avec les commits déjà
 * classés) et elle s'écrit pour quelqu'un qui n'a jamais lu une ligne de code :
 * pas de nom de fichier, pas de numéro d'issue, pas de « refacto ». Si un
 * changement ne se voit pas à l'usage, il n'a rien à faire ici — il est déjà
 * dans le `CHANGELOG.md`.
 */
export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    version: '0.1.0',
    date: '2026-09-07',
    title: 'Le premier service',
    summary:
      'Choisir des restaurants, lancer une session, voter chacun de son côté et laisser le classement trancher.',
    changes: [
      {
        kind: 'new',
        title: 'Décider à plusieurs en deux minutes',
        description:
          'Tu choisis des restaurants, tu lances une session, tu envoies le code à six caractères, le lien ou le QR code. Chacun vote depuis son téléphone et le classement s’affiche dès que tout le monde a terminé — ou dès que tu clôtures.',
      },
      {
        kind: 'new',
        title: 'Un coup de cœur et un veto par session',
        description:
          'Quatre réponses — bof, ça me va, coup de cœur, veto — dont deux jokers utilisables une seule fois. De quoi peser vraiment sur le résultat sans que personne ne puisse tout bloquer.',
      },
      {
        kind: 'new',
        title: 'Des listes de favoris à rejouer',
        description:
          'Les restos du midi, ceux du quartier, ceux qui livrent : on garde une liste, on la partage par lien, et on la ressort à la session suivante sans tout resaisir.',
      },
      {
        kind: 'new',
        title: 'Ajouter le restaurant qui manque',
        description:
          'À la main, ou en l’important depuis Google : la photo, l’adresse, les horaires et l’itinéraire arrivent avec, et la fiche reste lisible pendant le vote.',
      },
      {
        kind: 'new',
        title: 'Sans compte, et sans traceur',
        description:
          'Un pseudo suffit pour tout faire. L’email reste optionnel, la mesure d’audience attend ton accord, et l’export comme la suppression de tes données tiennent en un clic depuis « Mon compte ».',
      },
    ],
  },
]
