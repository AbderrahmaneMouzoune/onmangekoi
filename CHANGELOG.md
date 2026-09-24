# Changelog

## [0.2.0](https://github.com/AbderrahmaneMouzoune/onmangekoi/compare/v0.1.0...v0.2.0) (2026-09-24)


### Nouveautés

* **[db]:** bootstrap Supabase schema and typed clients ([1178c49](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/1178c4920ff313e72c08566ef4b1c86c3db2b32f))
* **[session]:** add session creation, invite system and waiting room ([a7959c6](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/a7959c660ece45196e67b29dccb9c09594aa5f49))
* **a11y:** audit axe en CI, deck au clavier et charte au contraste AA ([#44](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/44)) ([4cfe90e](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/4cfe90eadc8bf8efb1ab3b49d01d752f61824899))
* add Supabase skill documentation and feedback templates ([16d9dac](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/16d9dac1b3cf1830f016d68051eac22bdab9662e))
* **analytics:** mesurer l'entonnoir création → invitation → vote → résultats ([#26](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/26)) ([fc79adc](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/fc79adc78024bda873eab992535fb55ea84c0f58)), closes [#18](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/18)
* **changelog:** annoncer les nouvelles versions aux utilisateurs ([#35](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/35)) ([62097df](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/62097df18d444758d5157c76492dd1b0eb7e7f1f))
* **compte:** ouvrir un menu sous la pastille plutôt que changer de page ([#62](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/62)) ([319ad96](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/319ad96b6d809295cf1ecc217b3870333773c1bf))
* **db:** purge automatique des anonymes inactifs et des sessions périmées ([#24](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/24)) ([3a2d8fa](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/3a2d8fab25b7e0787c65265e203334314b50bb51))
* **groups:** réinviter « l'équipe du déjeuner » en un clic ([#50](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/50)) ([7180a46](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/7180a46aef0e5f60d8fbf4d12ac93f98157462a7)), closes [#8](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/8)
* initialize project structure with components, hooks, and utilities ([0a89a87](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/0a89a87c7ebf6c2ad97d13f78217a38162b0efe3))
* **listes:** une liste publique, présentable et prête à lancer une session ([#64](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/64)) ([1690e5e](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/1690e5e30217d606528e8c088767cc9866734981)), closes [#57](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/57)
* rebuild the MVP on a hardened Supabase core with a new visual identity ([#1](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/1)) ([d11407e](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/d11407e434ed9e8c94df55aec627b473fe160ae5))
* **restaurants:** ajout manuel et import Google Places ([#28](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/28)) ([5ee12d4](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/5ee12d4361b48b7e1b0f5ebf7528dced7f2a4a96))
* **restaurants:** amorcer son quartier en un geste ([#63](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/63)) ([3541020](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/3541020655bb19d0b58aa56952f24b7178bc7830)), closes [#56](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/56)
* **restaurants:** cartes illustrées, distance et panier sur une ligne ([#36](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/36)) ([2b2611d](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/2b2611d2aceedc0368d9947dcd3c828f23d4259e))
* **restaurants:** enrich the restaurant record with photo, hours and directions ([#23](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/23)) ([f6187b7](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/f6187b7a60d2f5e2b186b4689ea201cb09001683)), closes [#17](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/17)
* **restaurants:** filtrer le carnet par budget, régime et distance ([#51](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/51)) ([6715fe0](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/6715fe0384366388891ce741b5808201a706f968)), closes [#4](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/4)
* **restaurants:** sources au même niveau, Google autour de soi, listes et sessions distinctes ([#47](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/47)) ([e8607b4](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/e8607b42cc0169aeec64745c84615c577de50292))
* rewrite README to outline MVP features and user flows ([1a6fd45](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/1a6fd452278d5e3810becd637751ed0b43cc204f))
* **rgpd:** suppression du compte et export de ses données ([#25](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/25)) ([fd3d40b](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/fd3d40b5dfdce6deb54155aa0a9f0afdeb965a8c))
* **routing:** adresser sessions et listes par leur code court plutôt qu'un uuid ([#27](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/27)) ([caa7255](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/caa725529a400b1f9f2311e211b538d491b1be78))
* **security:** limite les essais de code et pose un captcha à l'onboarding ([#37](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/37)) ([2812c72](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/2812c72c7458e1c9596674b4abbf3699a3407a96)), closes [#12](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/12)
* **session:** QR d’invitation en grand, et deux restaurants minimum pour lancer ([#46](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/46)) ([5c032eb](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/5c032eb9762c2487355ebf62e63e8b26e74b0f32))
* **sessions:** chacun apporte son resto en salle d'attente ([#45](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/45)) ([707dcd5](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/707dcd58f4692ab7c6611b944fc1db1712b13550))
* **sessions:** clôturer le vote à l'heure dite ([#42](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/42)) ([dbf81f4](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/dbf81f4819b8ce3763577fe729ac7db143752970)), closes [#9](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/9)
* **sessions:** départager une égalité par second tour ou tirage au sort ([#43](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/43)) ([3af7d0e](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/3af7d0ec31db366dea776e35e75d96057bf1a519)), closes [#10](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/10)
* **sessions:** historique consultable et statistiques personnelles ([#41](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/41)) ([0070785](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/0070785ea8ed92fb46f0f34e1cbda72b53e18ba6)), closes [#6](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/6)
* **sessions:** régler les jokers et le seuil de clôture par session ([#49](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/49)) ([524e818](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/524e81824d29cea3a40f4938e1579963729de0a4)), closes [#16](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/16)
* **sessions:** signaler les restos qui ont déjà gagné récemment ([#52](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/52)) ([ede20b2](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/ede20b2bc1d0c3417e386ab658446b1568710aa7)), closes [#5](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/5)
* **sessions:** un lien public pour le podium, ouvert par le host ([0685630](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/068563064a2b98e7b3afc6f68084898df4799d30)), closes [#19](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/19)
* **session:** wire supabase session flows and typed db updates ([e7ee016](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/e7ee0162bfb03b8c6a18f475f1efc25c6cf73b17))
* **ui:** des silhouettes de chargement qui disent le vrai ([#34](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/34)) ([658742e](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/658742e960b9ce61f09d2787aabf3f2c6eef8206))
* **ui:** grilles desktop, raccourcis clavier et flèches sur toute l'app ([#38](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/38)) ([e5cdabe](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/e5cdabe5127ad2bed12fa8836ef5370870398e00))
* update theme tokens and color variables in globals.css ([c6b9ae5](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/c6b9ae5d07f3ac6ac39712e65a74971fd380309e))


### Corrections

* **[db]:** move session_participants-dependent policies after table creation ([6858f43](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/6858f43103139d5f45cc80bca160eb290c345859))
* **places:** distinguer les pannes Google au lieu d'un « réessaie » unique ([#33](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/33)) ([85c07a0](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/85c07a061e2412157a27d4f3f1fe898b62731557))


### Performance

* **deploy:** exécuter les fonctions à Paris, au plus près de la base ([#54](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/54)) ([4edb085](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/4edb08523b4cbe9255ef285afedb5e8f3cacca4d))
* **rendu:** prérendre chaque route avec les Cache Components ([#29](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/29)) ([9f08a2d](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/9f08a2d21c2898e6517c0ebc44570ffaaa332490))

## Changelog technique

Ce fichier est **généré** par [release-please](https://github.com/googleapis/release-please) à partir des commits [Conventional Commits](https://www.conventionalcommits.org/fr/) fusionnés sur `main`. Il ne se modifie pas à la main.

Les nouveautés racontées **côté produit** — ce qui change pour qui utilise l'app — vivent ailleurs : sur [`/nouveautes`](https://github.com/AbderrahmaneMouzoune/onmangekoi/blob/main/src/content/changelog/entries.ts), et sur le site. Voir [`docs/changelog.md`](docs/changelog.md).
