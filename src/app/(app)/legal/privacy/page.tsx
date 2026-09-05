import { RiDownloadLine, RiEyeOffLine, RiUserSettingsLine } from '@remixicon/react'
import Link from 'next/link'

import { PageHeader } from '@/components/layout/page-header'
import { Shell } from '@/components/layout/shell'
import { buttonVariants } from '@/components/ui/button'
import { router } from '@/config/router.config'
import { CONTACT_URL, SITE_NAME } from '@/lib/brand'
import { cn } from '@/lib/utils'

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Confidentialité',
  description: `Les données que ${SITE_NAME} conserve, pourquoi, combien de temps, et comment les récupérer ou les supprimer.`,
}

/** Dernière révision du texte — à remonter à chaque modification de fond. */
const LAST_UPDATED = '5 septembre 2026'

const RETENTION = [
  {
    data: 'Pseudo',
    why: 'T’identifier auprès des autres participants d’une session',
    kept: 'Jusqu’à la suppression du compte',
  },
  {
    data: 'Email et mot de passe',
    why: 'Optionnels — retrouver ses listes depuis un autre appareil',
    kept: 'Jusqu’à la suppression du compte',
  },
  {
    data: 'Listes de restaurants',
    why: 'Rejouer une sélection d’une session à l’autre',
    kept: 'Jusqu’à la suppression du compte ou de la liste',
  },
  {
    data: 'Sessions et participations',
    why: 'Faire fonctionner le vote et afficher le classement',
    kept: 'Tant que la session existe',
  },
  {
    data: 'Votes',
    why: 'Calculer le classement — jamais affichés individuellement',
    kept: 'Conservés en agrégat, détachés de leur auteur à la suppression du compte',
  },
  {
    data: 'Compte invité sans email',
    why: 'Permettre d’utiliser l’app sans inscription',
    kept: 'Supprimé après 90 jours sans activité',
  },
] as const

export default function PrivacyPage() {
  return (
    <Shell wide>
      <PageHeader
        eyebrow="Vie privée"
        title="Confidentialité"
        description={`Ce que ${SITE_NAME} sait de toi, pourquoi, et comment reprendre la main dessus.`}
        back={{ href: router.home(), label: 'Accueil' }}
      />

      <p className="text-sm text-muted-foreground">Dernière mise à jour : {LAST_UPDATED}.</p>

      <section className="flex flex-col gap-3 rounded-lg bg-surface p-4 ring-1 ring-line">
        <h2 className="font-display text-base font-semibold">En résumé</h2>
        <ul className="flex flex-col gap-2.5 text-sm text-ink-2">
          <li className="flex gap-2.5">
            <RiUserSettingsLine aria-hidden="true" className="mt-0.5 size-4.5 shrink-0" />
            <span>
              Un pseudo suffit pour tout faire. L’email et le mot de passe sont facultatifs et ne
              servent qu’à retrouver ses listes ailleurs.
            </span>
          </li>
          <li className="flex gap-2.5">
            <RiEyeOffLine aria-hidden="true" className="mt-0.5 size-4.5 shrink-0" />
            <span>
              Aucune publicité, aucune revente, aucun traceur tiers. Les votes ne sont jamais
              montrés individuellement : seul le classement agrégé est affiché.
            </span>
          </li>
          <li className="flex gap-2.5">
            <RiDownloadLine aria-hidden="true" className="mt-0.5 size-4.5 shrink-0" />
            <span>
              L’export et la suppression sont en libre-service depuis « Mon compte », sans avoir à
              écrire à qui que ce soit.
            </span>
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold">Ce qu’on conserve</h2>
        <div className="overflow-x-auto rounded-lg ring-1 ring-line">
          <table className="w-full min-w-lg border-collapse text-left text-sm">
            <thead className="bg-surface-2 text-xs text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Donnée</th>
                <th className="px-3 py-2.5 font-semibold">Pourquoi</th>
                <th className="px-3 py-2.5 font-semibold">Combien de temps</th>
              </tr>
            </thead>
            <tbody>
              {RETENTION.map((row) => (
                <tr key={row.data} className="border-t border-line bg-surface align-top">
                  <th scope="row" className="px-3 py-3 font-medium">
                    {row.data}
                  </th>
                  <td className="px-3 py-3 text-ink-2">{row.why}</td>
                  <td className="px-3 py-3 text-ink-2">{row.kept}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold">Ce qui se passe à la suppression</h2>
        <p className="text-sm text-ink-2">
          Supprimer un compte ne doit pas réécrire l’histoire des autres. Concrètement :
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-ink-2 marker:text-line-strong">
          <li>
            Le profil, le pseudo, l’email, le mot de passe et les listes sont supprimés
            définitivement.
          </li>
          <li>
            Les votes déjà comptés dans une session terminée sont conservés dans le classement, mais
            détachés de leur auteur : les autres participants voient «&nbsp;Participant
            supprimé&nbsp;».
          </li>
          <li>
            Les sessions en attente ou en cours de vote hébergées par le compte sont supprimées :
            sans host, elles ne peuvent plus aboutir.
          </li>
          <li>Les votes d’une session non terminée sont supprimés avec la participation.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold">Qui héberge ces données</h2>
        <p className="text-sm text-ink-2">
          La base de données et l’authentification sont opérées par{' '}
          <strong className="font-semibold text-ink">Supabase</strong>, l’application est hébergée
          par <strong className="font-semibold text-ink">Vercel</strong>, dans la région choisie
          pour le projet. Ces deux prestataires n’utilisent les données que pour fournir leur
          service. Aucun autre destinataire n’y a accès.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold">Tes droits</h2>
        <p className="text-sm text-ink-2">
          Le RGPD te donne un droit d’accès, de rectification, de portabilité et d’effacement. Les
          trois derniers sont directement dans l’app : le pseudo se change depuis «&nbsp;Mon
          compte&nbsp;», l’export renvoie l’intégralité de tes données en JSON, et la suppression
          est immédiate et définitive.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href={router.account()}
            className={cn(buttonVariants({ variant: 'outline' }), 'sm:flex-1')}
          >
            Aller à « Mon compte »
          </Link>
          <a
            href={CONTACT_URL}
            target="_blank"
            rel="noreferrer noopener"
            className={cn(buttonVariants({ variant: 'ghost' }), 'sm:flex-1')}
          >
            Poser une question
          </a>
        </div>
      </section>
    </Shell>
  )
}
