# Film de lancement

`onmangekoi-launch.mp4` — 49 s, 1920×1080, 30 i/s, son stéréo.

## Le découpage

| Temps   | Scène             | Ce qu'on voit                                                                                  |
| ------- | ----------------- | ---------------------------------------------------------------------------------------------- |
| 0 → 6   | Midi              | L'horloge roule jusqu'à **12:00**, vire au tomate. « Il est midi. Tout le monde a faim. »      |
| 6 → 13  | Le chaos          | 26 bulles de discussion envahissent l'écran, le chrono « temps perdu à décider » s'emballe     |
| 13 → 16 | Stop.             | Coupure sèche, silence, impact. « Et si, pour une fois, le groupe votait ? » — le point tomate |
| 16 → 21 | Le logo           | Le point avale l'écran, drop musical, l'icône rebondit, le wordmark se révèle lettre à lettre  |
| 21 → 34 | Comment ça marche | Téléphone animé : choisir ses restos, partager le code (QR, arrivées), voter carte par carte   |
| 34 → 40 | Le podium         | Les blocs montent, roulement de tambour, confettis : « Ce midi, on mange chez Mimi. »          |
| 40 → 44 | Mots-chocs        | Sans compte. Sans débat. En deux minutes. Et tout le monde est content.                        |
| 44 → 49 | Fin               | Logo, « Alors, on mange koi ce midi ? », bouton « Lancer une session »                         |

Tout reprend la charte « L'ardoise » de `src/app/globals.css` — pierre, encre, ardoise, rouge tomate, les couleurs des quatre votes — et les polices du site (Bricolage Grotesque, Instrument Sans, Geist Mono), embarquées dans `fonts/`.

## Comment c'est fait

Aucun logiciel de montage, aucun sample : tout est du code, donc tout se retouche.

- `scene.html` / `scene.css` / `scene.js` — le film est une page web dont chaque image est une fonction du temps : `window.render(t)` pose l'instant `t`. Pas d'animation CSS ni d'horloge, le rendu est déterministe.
- `render.mjs` — ouvre la page dans Chromium (Playwright), appelle `render(t)` image par image et pousse les captures dans ffmpeg.
- `soundtrack.py` — synthétise la musique (120 BPM, F – C – Dm – Bb) et les bruitages avec numpy/scipy. Chaque son est calé sur l'instant où l'image l'appelle ; les coupes tombent sur les temps.

## Régénérer

Prérequis : `bun install` à la racine (fournit `playwright-core`), un Chromium, `ffmpeg`, Python 3 avec `numpy` et `scipy`.

```sh
cd marketing/launch-video
python3 soundtrack.py soundtrack.wav
CHROMIUM=/chemin/vers/chrome node render.mjs silent.mp4
ffmpeg -i silent.mp4 -i soundtrack.wav -c:v copy -c:a aac -b:a 192k -shortest onmangekoi-launch.mp4
```

Pour itérer sur une scène sans tout rendre, quelques images suffisent :

```sh
node render.mjs --stills ./stills 3.2 14.5 36.8
```

Ouvrir `scene.html` dans un navigateur et appeler `render(12.5)` dans la console marche aussi.
