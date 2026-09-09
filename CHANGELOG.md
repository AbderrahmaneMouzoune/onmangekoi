# Changelog

## [0.2.0](https://github.com/AbderrahmaneMouzoune/onmangekoi/compare/v0.1.0...v0.2.0) (2026-09-09)


### Nouveautés

* **[db]:** bootstrap Supabase schema and typed clients ([1178c49](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/1178c4920ff313e72c08566ef4b1c86c3db2b32f))
* **[session]:** add session creation, invite system and waiting room ([a7959c6](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/a7959c660ece45196e67b29dccb9c09594aa5f49))
* **a11y:** audit axe en CI, deck au clavier et charte au contraste AA ([#44](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/44)) ([4cfe90e](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/4cfe90eadc8bf8efb1ab3b49d01d752f61824899))
* add Supabase skill documentation and feedback templates ([16d9dac](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/16d9dac1b3cf1830f016d68051eac22bdab9662e))
* **analytics:** mesurer l'entonnoir création → invitation → vote → résultats ([#26](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/26)) ([fc79adc](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/fc79adc78024bda873eab992535fb55ea84c0f58)), closes [#18](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/18)
* **changelog:** annoncer les nouvelles versions aux utilisateurs ([#35](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/35)) ([62097df](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/62097df18d444758d5157c76492dd1b0eb7e7f1f))
* **db:** purge automatique des anonymes inactifs et des sessions périmées ([#24](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/24)) ([3a2d8fa](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/3a2d8fab25b7e0787c65265e203334314b50bb51))
* initialize project structure with components, hooks, and utilities ([0a89a87](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/0a89a87c7ebf6c2ad97d13f78217a38162b0efe3))
* rebuild the MVP on a hardened Supabase core with a new visual identity ([#1](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/1)) ([d11407e](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/d11407e434ed9e8c94df55aec627b473fe160ae5))
* **restaurants:** ajout manuel et import Google Places ([#28](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/28)) ([5ee12d4](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/5ee12d4361b48b7e1b0f5ebf7528dced7f2a4a96))
* **restaurants:** enrich the restaurant record with photo, hours and directions ([#23](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/23)) ([f6187b7](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/f6187b7a60d2f5e2b186b4689ea201cb09001683)), closes [#17](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/17)
* rewrite README to outline MVP features and user flows ([1a6fd45](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/1a6fd452278d5e3810becd637751ed0b43cc204f))
* **rgpd:** suppression du compte et export de ses données ([#25](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/25)) ([fd3d40b](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/fd3d40b5dfdce6deb54155aa0a9f0afdeb965a8c))
* **routing:** adresser sessions et listes par leur code court plutôt qu'un uuid ([#27](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/27)) ([caa7255](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/caa725529a400b1f9f2311e211b538d491b1be78))
* **sessions:** clôturer le vote à l'heure dite ([#42](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/42)) ([dbf81f4](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/dbf81f4819b8ce3763577fe729ac7db143752970)), closes [#9](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/9)
* **session:** wire supabase session flows and typed db updates ([e7ee016](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/e7ee0162bfb03b8c6a18f475f1efc25c6cf73b17))
* **ui:** des silhouettes de chargement qui disent le vrai ([#34](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/34)) ([658742e](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/658742e960b9ce61f09d2787aabf3f2c6eef8206))
* update theme tokens and color variables in globals.css ([c6b9ae5](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/c6b9ae5d07f3ac6ac39712e65a74971fd380309e))


### Corrections

* **[db]:** move session_participants-dependent policies after table creation ([6858f43](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/6858f43103139d5f45cc80bca160eb290c345859))
* **places:** distinguer les pannes Google au lieu d'un « réessaie » unique ([#33](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/33)) ([85c07a0](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/85c07a061e2412157a27d4f3f1fe898b62731557))


### Performance

* **rendu:** prérendre chaque route avec les Cache Components ([#29](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues/29)) ([9f08a2d](https://github.com/AbderrahmaneMouzoune/onmangekoi/commit/9f08a2d21c2898e6517c0ebc44570ffaaa332490))

## Changelog technique

Ce fichier est **généré** par [release-please](https://github.com/googleapis/release-please) à partir des commits [Conventional Commits](https://www.conventionalcommits.org/fr/) fusionnés sur `main`. Il ne se modifie pas à la main.

Les nouveautés racontées **côté produit** — ce qui change pour qui utilise l'app — vivent ailleurs : sur [`/nouveautes`](https://github.com/AbderrahmaneMouzoune/onmangekoi/blob/main/src/content/changelog/entries.ts), et sur le site. Voir [`docs/changelog.md`](docs/changelog.md).
