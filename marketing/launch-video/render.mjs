/**
 * Rend `scene.html` image par image dans Chromium, puis encode avec ffmpeg.
 *
 *   node render.mjs film.mp4 [soundtrack.wav]   → film complet
 *   node render.mjs --stills dir t1 t2 …        → quelques images de contrôle
 *
 * Les images sont réparties entre plusieurs navigateurs (WORKERS, 3 par
 * défaut) : chaque image ne dépend que de `t`, l'ordre de rendu est libre.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { chromium } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg'
const executablePath = process.env.CHROMIUM
const FPS = 30
const WORKERS = Number(process.env.WORKERS ?? 3)

async function openScene() {
  const browser = await chromium.launch({ executablePath })
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  await page.goto(pathToFileURL(join(here, 'scene.html')).href)
  await page.evaluate(() => window.ready)
  return { browser, page }
}

async function shoot(page, t, path) {
  await page.evaluate((x) => window.render(x), t)
  await page.screenshot({
    path,
    type: path.endsWith('.png') ? 'png' : 'jpeg',
    quality: path.endsWith('.png') ? undefined : 96,
  })
}

const args = process.argv.slice(2)

if (args[0] === '--stills') {
  const dir = resolve(args[1])
  mkdirSync(dir, { recursive: true })
  const { browser, page } = await openScene()
  for (const t of args.slice(2)) await shoot(page, Number(t), join(dir, `t${t}.png`))
  await browser.close()
} else {
  const out = resolve(args[0] ?? 'film.mp4')
  const audio = args[1] && resolve(args[1])
  const frames = await (async () => {
    const { browser, page } = await openScene()
    const d = await page.evaluate(() => window.DURATION)
    await browser.close()
    return Math.round(d * FPS)
  })()
  const dir = mkdtempSync(join(process.env.FRAMES_DIR ?? tmpdir(), 'onmangekoi-frames-'))
  let done = 0
  await Promise.all(
    Array.from({ length: WORKERS }, async (_, w) => {
      const { browser, page } = await openScene()
      for (let f = w; f < frames; f += WORKERS) {
        await shoot(page, f / FPS, join(dir, `f${String(f).padStart(5, '0')}.jpg`))
        if (++done % 30 === 0) process.stderr.write(`\r${done}/${frames}`)
      }
      await browser.close()
    })
  )
  process.stderr.write(`\n`)
  const input = ['-framerate', String(FPS), '-i', join(dir, 'f%05d.jpg')]
  const sound = audio ? ['-i', audio, '-c:a', 'aac', '-b:a', '192k', '-shortest'] : []
  const enc = spawn(
    ffmpeg,
    [
      '-y',
      '-loglevel',
      'error',
      ...input,
      ...sound,
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '17',
      '-tune',
      'film',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      out,
    ],
    { stdio: 'inherit' }
  )
  const code = await new Promise((r) => enc.on('close', r))
  rmSync(dir, { recursive: true, force: true })
  if (code !== 0) process.exit(code)
  process.stderr.write(`${out}\n`)
}
