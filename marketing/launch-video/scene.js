/* global document, window */
/**
 * Film de lancement onmangekoi — 49 s, 1920×1080.
 *
 * Tout est une fonction du temps : `window.render(t)` pose l'image exacte de
 * l'instant `t` (en secondes). `render.mjs` appelle cette fonction image par
 * image, ce qui rend le film déterministe — pas d'animation CSS, pas d'horloge.
 * Les coupes tombent sur la grille du morceau (120 BPM, un temps = 0,5 s) que
 * `soundtrack.py` synthétise sur la même minuterie.
 */
;(function () {
  const DURATION = 49
  const stage = document.getElementById('stage')
  const grain = document.getElementById('grain')

  // ── Outils ──────────────────────────────────────────────────
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
  const prog = (t, a, b) => clamp((t - a) / (b - a))
  const lerp = (a, b, k) => a + (b - a) * k
  const E = {
    outCubic: (k) => 1 - Math.pow(1 - k, 3),
    inCubic: (k) => k * k * k,
    inOutCubic: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    outExpo: (k) => (k === 1 ? 1 : 1 - Math.pow(2, -10 * k)),
    inExpo: (k) => (k === 0 ? 0 : Math.pow(2, 10 * k - 10)),
    outBack: (k) => {
      const c1 = 1.70158
      const c3 = c1 + 1
      return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2)
    },
    outElastic: (k) =>
      k === 0 || k === 1
        ? k
        : Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
  }

  function rng(seed) {
    return function () {
      seed |= 0
      seed = (seed + 0x6d2b79f5) | 0
      let r = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296
    }
  }

  function el(tag, cls, parent, html) {
    const node = document.createElement(tag)
    if (cls) node.className = cls
    if (html !== undefined) node.innerHTML = html
    if (parent) parent.appendChild(node)
    return node
  }

  function css(node, styles) {
    for (const k in styles) node.style[k] = styles[k]
  }

  const tf = (x = 0, y = 0, s = 1, r = 0) => `translate(${x}px, ${y}px) scale(${s}) rotate(${r}deg)`

  const AVATAR = ['#d42c17', '#2c794b', '#b07a0c', '#3f5f8a', '#7a4a8f', '#1b1a17', '#c0623a']

  /** Lettres masquées, révélées une à une par le bas. */
  function maskedWord(parent, text, cls) {
    const wrap = el('span', cls || '', parent)
    const letters = []
    for (const ch of text) {
      const m = el('span', 'mask', wrap)
      letters.push(el('span', '', m, ch === ' ' ? '&nbsp;' : ch))
    }
    return letters
  }

  function revealLetters(letters, t, start, step = 0.035, dur = 0.55) {
    letters.forEach((l, i) => {
      const k = E.outExpo(prog(t, start + i * step, start + i * step + dur))
      l.style.transform = `translateY(${(1 - k) * 110}%)`
    })
  }

  function makeIcon(parent, size) {
    const icon = el('div', 'icon', parent)
    icon.style.fontSize = size + 'px'
    el('span', 'k', icon, 'k')
    const dot = el('span', 'dot', icon)
    return { icon, dot }
  }

  const scenes = []
  function scene(start, end, bg, build) {
    const root = el('div', 'scene', stage)
    root.style.background = bg
    const update = build(root)
    scenes.push({ start, end, root, update })
  }

  // ════════════════════════════════════════════════════════════
  // 1 · MIDI  (0 → 6)
  // ════════════════════════════════════════════════════════════
  scene(0, 6, 'var(--slate)', (root) => {
    const glow = el('div', 'abs', root)
    css(glow, {
      left: '50%',
      top: '42%',
      width: '1400px',
      height: '1400px',
      marginLeft: '-700px',
      marginTop: '-700px',
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(232,65,44,0.45) 0%, rgba(232,65,44,0) 60%)',
    })
    const clockWrap = el('div', 'center', root)
    const clock = el('div', 'clock', clockWrap)
    const seq = [
      [
        [0, '1'],
        [3, '1'],
      ],
      [
        [0, '1'],
        [3, '2'],
      ],
      null,
      [
        [0, '5'],
        [3, '0'],
      ],
      [
        [0, '8'],
        [1.5, '9'],
        [3, '0'],
      ],
    ]
    const slots = seq.map((s) => {
      if (!s) {
        el('div', 'colon', clock, ':')
        return null
      }
      const slot = el('div', 'slot', clock)
      return { s, a: el('span', '', slot), b: el('span', '', slot) }
    })
    const colon = clock.children[2]
    const ring = el('div', 'center', root)
    css(ring, {
      width: '400px',
      height: '400px',
      borderRadius: '50%',
      border: '6px solid var(--brand)',
      top: '42%',
    })

    const l1 = el('div', 'line', root, 'Il est midi.')
    const l2 = el('div', 'line', root, 'Tout le monde a faim.')
    const l3 = el('div', 'line', root, 'Et personne ne veut choisir.')
    css(l1, { top: '640px', fontSize: '84px' })
    css(l2, { top: '740px', fontSize: '60px', color: 'var(--chalk-muted)' })
    css(l3, { top: '820px', fontSize: '60px', color: 'var(--chalk-muted)' })

    return (t) => {
      // Horloge : chaque chiffre roule vers le haut quand il change
      slots.forEach((slot) => {
        if (!slot) return
        const { s, a, b } = slot
        let i = 0
        while (i + 1 < s.length && t >= s[i + 1][0]) i++
        const cur = s[i]
        const prev = s[Math.max(0, i - 1)]
        const k = i > 0 && cur[1] !== prev[1] ? E.outBack(prog(t, cur[0], cur[0] + 0.45)) : 1
        a.textContent = prev[1]
        b.textContent = cur[1]
        a.style.transform = `translateY(${-k * 105}%)`
        b.style.transform = `translateY(${(1 - k) * 105}%)`
        a.style.opacity = i > 0 && cur[1] !== prev[1] ? 1 - k : 0
      })
      const noon = prog(t, 3, 3.25)
      const color = noon > 0 ? 'var(--brand)' : 'var(--chalk)'
      clock.style.color = color
      colon.style.opacity = t < 3 ? (Math.floor(t * 2) % 2 === 0 ? 1 : 0.25) : 1

      const intro = E.outExpo(prog(t, 0, 1.2))
      const lift = E.inOutCubic(prog(t, 3.3, 4.0))
      const pulse = t > 3 ? 1 + 0.08 * Math.exp(-(t - 3) * 6) * Math.cos((t - 3) * 18) : 1
      const scale = lerp(1.25 - intro * 0.25, 0.62, lift) * pulse
      clockWrap.style.transform = `translate(-50%, calc(-50% + ${lift * -210}px)) scale(${scale})`
      clockWrap.style.opacity = intro * (1 - E.inCubic(prog(t, 5.5, 6)))

      glow.style.opacity = E.outCubic(prog(t, 3, 3.3)) * (0.9 - 0.5 * prog(t, 3.3, 6))
      const rk = prog(t, 3, 4.1)
      ring.style.transform = `translate(-50%, calc(-50% - ${lift * 60}px)) scale(${0.8 + E.outCubic(rk) * 3.2})`
      ring.style.opacity = t < 3 ? 0 : (1 - rk) * 0.9

      ;[
        [l1, 3.5],
        [l2, 4.1],
        [l3, 4.6],
      ].forEach(([n, s]) => {
        const k = E.outExpo(prog(t, s, s + 0.7))
        n.style.opacity = k * (1 - E.inCubic(prog(t, 5.5, 6)))
        n.style.transform = `translateY(${(1 - k) * 50}px)`
        n.style.filter = `blur(${(1 - k) * 12}px)`
      })
    }
  })

  // ════════════════════════════════════════════════════════════
  // 2 · LE CHAOS  (6 → 13)
  // ════════════════════════════════════════════════════════════
  scene(6, 13, 'var(--bg)', (root) => {
    const cam = el('div', 'abs', root)
    css(cam, { inset: '0' })
    const messages = [
      ['Léa', 'On mange où ?'],
      ['Karim', 'Je sais pas, comme tu veux'],
      ['Tom', 'Pas japonais, on y était hier'],
      ['Inès', 'Moi tout me va'],
      ['Yanis', 'Burger ?'],
      ['Léa', 'Trop lourd…'],
      ['Sarah', 'Le libanais ?'],
      ['Tom', "C'est loin, non ?"],
      ['Karim', 'Vous décidez'],
      ['Inès', "Quelqu'un a une idée ?"],
      ['Yanis', 'Pas de pizza svp'],
      ['Sarah', 'Le thaï a fermé'],
      ['Léa', 'On refait le bistrot ?'],
      ['Tom', 'Encore ?!'],
      ['Karim', 'Bon… ?'],
      ['Inès', "J'ai 45 min max"],
      ['Yanis', 'Faut réserver ?'],
      ['Sarah', 'Déjà 12h20…'],
      ['Léa', 'Comme vous voulez'],
      ['Tom', 'Je sais pas moi'],
      ['Karim', 'Allez on se décide'],
      ['Inès', 'Bof'],
      ['Yanis', '???'],
      ['Sarah', 'Je vais au kebab'],
      ['Tom', 'Attendez-moi !'],
      ['Léa', '…'],
    ]
    const names = ['Léa', 'Karim', 'Tom', 'Inès', 'Yanis', 'Sarah']
    const r = rng(7)
    // Grille 5 × 6 mélangée : les bulles couvrent tout l'écran sans s'empiler
    const cells = []
    for (let row = 0; row < 6; row++) for (let col = 0; col < 5; col++) cells.push([col, row])
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1))
      ;[cells[i], cells[j]] = [cells[j], cells[i]]
    }
    const N = messages.length
    const bubbles = messages.map(([who, text], i) => {
      const b = el('div', 'bubble' + (r() < 0.22 ? ' dark' : ''), cam)
      const ai = names.indexOf(who)
      const av = el('div', 'avatar', b, who[0])
      av.style.background = AVATAR[ai % AVATAR.length]
      el('div', 'bubble-body', b, `<small>${who}</small>${text}`)
      const [col, row] = cells[i]
      const x = 70 + col * 360 + (r() - 0.5) * 70 + (row % 2) * 36
      const y = 170 + row * 148 + (r() - 0.5) * 30
      css(b, { left: x + 'px', top: y + 'px' })
      return {
        b,
        t0: 6.15 + 5.9 * Math.pow(i / N, 1.7),
        rot: (r() - 0.5) * 7,
        vx: (r() - 0.5) * 900,
        vy: -300 - r() * 500,
        spin: (r() - 0.5) * 240,
      }
    })
    const timer = el('div', 'timer', root)
    const rec = el('span', 'rec', timer)
    el('span', '', timer, 'Temps perdu à décider')
    const tv = el('b', '', timer, '00:00')

    return (t) => {
      const chaos = prog(t, 9.5, 12.5)
      const shake = chaos * chaos * 14
      const sx = Math.sin(t * 91) * shake
      const sy = Math.cos(t * 73) * shake
      const zoom = 1.04 + 0.06 * E.inCubic(prog(t, 6, 12.6))
      cam.style.transform = tf(sx, sy, zoom)
      cam.style.transformOrigin = '50% 50%'

      bubbles.forEach((q) => {
        if (!q.fitted) {
          // Une bulle trop large pour sa colonne recule jusqu'au bord de l'écran
          const right = q.b.offsetLeft + q.b.offsetWidth
          if (right > 1880) q.b.style.left = 1880 - q.b.offsetWidth + 'px'
          q.fitted = true
        }
        const k = prog(t, q.t0, q.t0 + 0.35)
        if (t < q.t0) {
          q.b.style.opacity = 0
          return
        }
        const fall = Math.max(0, t - 12.35)
        const s = E.outBack(k) * (1 - E.inCubic(prog(t, 12.6, 13)) * 0.3)
        const x = q.vx * fall
        const y = q.vy * fall + 2600 * fall * fall
        q.b.style.opacity = clamp(k * 3)
        q.b.style.transform = tf(x, y + (1 - E.outCubic(k)) * 30, s, q.rot + q.spin * fall)
        q.b.style.transformOrigin = '0 100%'
      })

      // Le chrono s'emballe : 10 min 47 perdues en six secondes
      const secs = Math.floor(647 * Math.pow(prog(t, 6.3, 12.3), 1.6))
      tv.textContent =
        String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0')
      rec.style.opacity = Math.floor(t * 4) % 2 ? 1 : 0.3
      const tin = E.outBack(prog(t, 6.3, 6.8))
      timer.style.transform = `translateX(-50%) translateY(${(1 - tin) * -140}px) scale(${1 + chaos * 0.15 + Math.sin(t * 40) * chaos * 0.03})`
      timer.style.opacity = 1 - E.inCubic(prog(t, 12.5, 12.9))
    }
  })

  // ════════════════════════════════════════════════════════════
  // 3 · STOP  (13 → 16)
  // ════════════════════════════════════════════════════════════
  scene(13, 16.05, 'var(--slate)', (root) => {
    const stop = el('div', 'line', root, 'Stop.')
    css(stop, { top: '340px', fontSize: '360px', letterSpacing: '-0.035em' })
    const q1 = el('div', 'line', root, 'Et si, pour une fois,')
    const q2 = el('div', 'line', root, 'le groupe votait<span class="q">&nbsp;?</span>')
    css(q1, { top: '360px', fontSize: '118px', color: 'var(--chalk-muted)' })
    css(q2, { top: '490px', fontSize: '118px' })
    const dot = el('div', 'abs', root)
    css(dot, {
      width: '60px',
      height: '60px',
      borderRadius: '50%',
      background: 'var(--brand)',
      left: '930px',
      top: '800px',
    })
    return (t) => {
      const ks = E.outExpo(prog(t, 13, 13.35))
      const out = E.inCubic(prog(t, 13.85, 14.1))
      stop.style.transform = `scale(${lerp(1.6, 1, ks) * (1 - out * 0.3)})`
      stop.style.opacity = ks * (1 - out)
      stop.style.filter = `blur(${out * 20}px)`
      ;[
        [q1, 14.05],
        [q2, 14.3],
      ].forEach(([n, s]) => {
        const k = E.outExpo(prog(t, s, s + 0.6))
        const o = E.inCubic(prog(t, 15.35, 15.6))
        n.style.opacity = k * (1 - o)
        n.style.transform = `translateY(${(1 - k) * 60 - o * 40}px)`
      })
      // Le point tomate apparaît, puis avale l'écran
      const pop = E.outBack(prog(t, 15.0, 15.3))
      const grow = E.inExpo(prog(t, 15.45, 16.0))
      dot.style.transform = `translateY(${-lerp(0, 290, E.inOutCubic(prog(t, 15.3, 15.9)))}px) scale(${pop * (1 + grow * 45)})`
    }
  })

  // ════════════════════════════════════════════════════════════
  // 4 · LE LOGO  (16 → 21)
  // ════════════════════════════════════════════════════════════
  let logoMetrics = null
  scene(16, 21.6, 'var(--brand)', (root) => {
    const wipe = el('div', 'abs', root)
    css(wipe, { inset: '0', background: 'var(--slate)' })
    const zoomLayer = el('div', 'abs', root)
    css(zoomLayer, { inset: '0' })
    const halo = el('div', 'center', zoomLayer)
    css(halo, {
      width: '1600px',
      height: '1600px',
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(232,65,44,0.28) 0%, rgba(232,65,44,0) 55%)',
    })
    const row = el('div', 'abs', zoomLayer)
    css(row, {
      left: '0',
      right: '0',
      top: '380px',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '56px',
    })
    const { icon, dot } = makeIcon(row, 190)
    const word = el('div', 'wordmark', row)
    word.style.fontSize = '172px'
    const a = maskedWord(word, 'onmange')
    const b = maskedWord(word, 'koi', 'red')
    const letters = a.concat(b)
    const tag = el('div', 'line', zoomLayer, 'Décidez où manger ensemble, sans débat.')
    css(tag, {
      top: '690px',
      fontSize: '58px',
      fontWeight: '600',
      letterSpacing: '-0.02em',
      color: 'var(--chalk-muted)',
    })

    return (t) => {
      if (!logoMetrics) {
        const ri = icon.getBoundingClientRect()
        const rr = row.getBoundingClientRect()
        const rd = dot.getBoundingClientRect()
        logoMetrics = {
          iconShift: rr.left + rr.width / 2 - (ri.left + ri.width / 2),
          dotX: rd.left + rd.width / 2,
          dotY: rd.top + rd.height / 2,
        }
      }
      const w = E.inOutCubic(prog(t, 16.0, 16.55))
      wipe.style.clipPath = `circle(${w * 75}% at 50% 50%)`

      const ip = E.outElastic(prog(t, 16.3, 17.3))
      const slide = E.inOutCubic(prog(t, 17.0, 17.6))
      icon.style.transform = `translateX(${logoMetrics.iconShift * (1 - slide)}px) scale(${ip}) rotate(${(1 - ip) * -30}deg)`
      word.style.opacity = t > 17.1 ? 1 : 0
      revealLetters(letters, t, 17.15)
      halo.style.opacity = E.outCubic(prog(t, 16.4, 17.5))

      const tk = E.outExpo(prog(t, 18.2, 19))
      tag.style.opacity = tk
      tag.style.transform = `translateY(${(1 - tk) * 40}px)`
      tag.style.letterSpacing = `${lerp(0.04, -0.02, tk)}em`

      // Plongée dans le point tomate de l'icône
      const z = E.inExpo(prog(t, 20.35, 21.0))
      zoomLayer.style.transformOrigin = `${logoMetrics.dotX}px ${logoMetrics.dotY}px`
      zoomLayer.style.transform = `scale(${1 + z * 90})`
      const breathe = 1 + 0.015 * Math.sin((t - 17) * 2)
      row.style.scale = t < 20.35 ? breathe : 1
    }
  })

  // ════════════════════════════════════════════════════════════
  // 5 · COMMENT ÇA MARCHE  (21 → 34)
  // ════════════════════════════════════════════════════════════
  scene(21, 34.05, 'var(--bg)', (root) => {
    const eyebrow = el('div', 'abs step-eyebrow', root, 'Comment ça marche')
    css(eyebrow, { left: '160px', top: '250px' })
    const progress = el('div', 'progress', root)
    css(progress, { left: '160px', top: '820px' })
    const bars = [0, 1, 2].map(() => el('b', '', el('i', '', progress)))

    const stepsWrap = el('div', 'abs', root)
    css(stepsWrap, { left: '160px', top: '320px', width: '860px', height: '480px' })
    const stepData = [
      [
        '01',
        'Choisis<br>tes restos.',
        'Tes favoris, ceux du quartier, ou le tien en deux secondes.',
      ],
      ['02', 'Partage<br>le code.', 'Un lien, un code, un QR. Pas de compte, juste un pseudo.'],
      ['03', 'Chacun<br>vote.', 'Bof, ça me va, coup de cœur ou veto. Un seul joker de chaque.'],
    ]
    const steps = stepData.map(([n, h, p]) => {
      const s = el('div', 'step', stepsWrap)
      el('div', 'num', s, n + ' / 03')
      el('h2', '', s, h)
      el('p', '', s, p)
      return s
    })
    const T = [21, 25, 29, 34]

    // Téléphone
    const phoneWrap = el('div', 'abs', root)
    css(phoneWrap, { left: '1150px', top: '90px', width: '440px', height: '900px' })
    const phone = el('div', 'phone', phoneWrap)
    const screen = el('div', 'screen', phone)
    el('div', 'notch', screen)

    // Écran 1 — la sélection
    const p1 = el('div', 'pane', screen)
    el('div', 'pane-eyebrow', p1, 'Nouvelle session')
    el('div', 'pane-title', p1, 'Vos restos')
    const restos = [
      ['Chez Mimi', 'Bistrot · 350 m', '#d42c17'],
      ['Sushi Kaz', 'Japonais · 500 m', '#1b1a17'],
      ['La Piadina', 'Italien · 200 m', '#2c794b'],
      ['Le Cèdre', 'Libanais · 650 m', '#b07a0c'],
      ['Burger Club', 'Burgers · 400 m', '#3f5f8a'],
    ]
    const rows = restos.map(([n, c, col]) => {
      const rw = el('div', 'row', p1)
      const th = el('div', 'thumb', rw, n.replace(/^(Chez |La |Le )/, '')[0])
      th.style.background = col
      el('div', 'row-text', rw, `<b>${n}</b><span>${c}</span>`)
      const ck = el('div', 'check', rw, '✓')
      return { rw, ck }
    })
    const cta1 = el('div', 'cta', p1, 'Lancer la session')

    // Écran 2 — l'invitation
    const p2 = el('div', 'pane', screen)
    el('div', 'pane-eyebrow', p2, 'Salle d’attente')
    el('div', 'pane-title', p2, 'Invite ton équipe')
    const codeRow = el('div', 'code', p2)
    const codeChars = '7K3M9P'.split('').map((c) => el('span', '', codeRow, c))
    const qr = el('div', 'qr', p2)
    const qrCells = []
    const qrR = rng(42)
    const finder = (x, y, ox, oy) => {
      const dx = x - ox
      const dy = y - oy
      if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return null
      const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3))
      return ring !== 2
    }
    for (let y = 0; y < 25; y++)
      for (let x = 0; x < 25; x++) {
        let on = finder(x, y, 0, 0)
        if (on === null) on = finder(x, y, 18, 0)
        if (on === null) on = finder(x, y, 0, 18)
        const isFinder = on !== null
        if (on === null) on = x === 7 || y === 7 || x === 17 || y === 17 ? false : qrR() < 0.5
        const cell = el('i', '', qr)
        cell.style.background = on ? 'var(--ink)' : 'transparent'
        cell.style.borderRadius = isFinder ? '1px' : '2px'
        qrCells.push({ cell, d: Math.hypot(x - 12, y - 12) })
      }
    const people = el('div', 'people', p2)
    const who = [
      ['L', 0],
      ['K', 3],
      ['T', 1],
      ['I', 2],
      ['Y', 4],
      ['S', 6],
    ]
    const avs = who.map(([c, i]) => {
      const a = el('div', 'avatar', people, c)
      a.style.background = AVATAR[i]
      return a
    })
    const count = el('div', 'people-count', p2, '')

    // Écran 3 — le vote
    const p3 = el('div', 'pane', screen)
    el('div', 'pane-eyebrow', p3, 'Vote · 4 restos')
    const done = el('div', 'abs', p3, '<b>C’est voté.</b><span>En attente des autres…</span>')
    css(done, { left: '0', right: '0', top: '330px', textAlign: 'center' })
    const doneB = done.querySelector('b')
    css(doneB, {
      display: 'block',
      fontFamily: 'var(--display)',
      fontSize: '52px',
      fontWeight: '800',
      letterSpacing: '-0.04em',
      color: 'var(--ink)',
    })
    css(done.querySelector('span'), { fontSize: '22px', color: 'var(--ink-muted)' })
    const deck = [
      ['Chez Mimi', 'Bistrot · plat du jour 14 €', ['#e8412c', '#8f2318'], 'M'],
      ['Sushi Kaz', 'Japonais · 500 m', ['#3a3f45', '#1b1a17'], 'S'],
      ['Le Cèdre', 'Libanais · 650 m', ['#d09a2a', '#91640a'], 'C'],
      ['Burger Club', 'Burgers · 400 m', ['#4f74a6', '#2b4466'], 'B'],
    ]
    const actions = [
      { i: 2, label: 'Coup de cœur', color: '#f2c24e', dx: 0, dy: -1300, rot: 0 },
      { i: 1, label: 'Ça me va', color: '#7cc495', dx: 900, dy: 80, rot: 22 },
      { i: 3, label: 'Veto', color: '#f08a7c', dx: 0, dy: 1300, rot: -8 },
      { i: 0, label: 'Bof', color: '#c9c6bc', dx: -900, dy: 80, rot: -22 },
    ]
    const cards = deck
      .map(([n, c, [g1, g2], big], i) => {
        const card = el('div', 'card', p3)
        const art = el('div', 'card-art', card)
        art.style.background = `linear-gradient(135deg, ${g1}, ${g2})`
        el('div', 'big', art, big)
        el('div', 'card-body', card, `<b>${n}</b><span>${c}</span>`)
        const stamp = el('div', 'stamp', card, actions[i].label)
        stamp.style.color = actions[i].color
        return { card, stamp, i }
      })
      .reverse()
    cards.forEach((c) => p3.appendChild(c.card))
    cards.reverse()
    const votes = el('div', 'votes', p3)
    const btnDefs = [
      ['–', 'Bof', '#6e6a62', ''],
      ['+1', 'Ça me va', '#2c794b', ''],
      ['♥', 'Coup de cœur', '#b07a0c', '1 joker'],
      ['✕', 'Veto', '#8f2318', '1 joker'],
    ]
    const btns = btnDefs.map(([g, l, c, s]) => {
      const b = el(
        'div',
        'vbtn',
        votes,
        `<span class="glyph">${g}</span>${l}${s ? `<small>${s}</small>` : ''}`
      )
      b.style.color = c
      return { b, c }
    })
    const swipeAt = [29.9, 30.95, 31.95, 32.9]

    // Pastilles flottantes « X a rejoint »
    const chips = [
      ['Léa', 0, 'a rejoint', -200, 300, 26.3],
      ['Karim', 3, 'a rejoint', 385, 420, 26.8],
      ['Tom', 1, 'a rejoint', -215, 560, 27.25],
      ['Inès', 2, 'a rejoint', 390, 680, 27.65],
      ['Yanis', 4, 'a rejoint', -190, 790, 28.0],
    ].map(([n, ci, what, x, y, at]) => {
      const c = el('div', 'chip', phoneWrap)
      const a = el('div', 'avatar', c, n[0])
      a.style.background = AVATAR[ci]
      el('span', '', c, `${n} <em>${what}</em>`)
      css(c, { left: x + 'px', top: y + 'px' })
      return { c, at }
    })

    return (t) => {
      // Rideau tomate qui se referme depuis la plongée du logo
      const open = E.inOutCubic(prog(t, 21.0, 21.55))
      root.style.clipPath = open < 1 ? `circle(${open * 75}% at 50% 50%)` : 'none'
      const cur = t < T[1] ? 0 : t < T[2] ? 1 : 2
      bars.forEach((b, i) => {
        b.style.width = `${clamp(prog(t, T[i], T[i + 1])) * 100}%`
      })
      const intro = E.outExpo(prog(t, 21.05, 21.8))
      eyebrow.style.opacity = intro
      eyebrow.style.transform = `translateY(${(1 - intro) * 30}px)`
      progress.style.opacity = intro

      steps.forEach((s, i) => {
        const kin =
          i === 0 ? E.outExpo(prog(t, 21.15, 21.9)) : E.outExpo(prog(t, T[i] + 0.05, T[i] + 0.75))
        const kout =
          i === 2 ? E.inCubic(prog(t, 33.6, 34)) : E.inCubic(prog(t, T[i + 1] - 0.3, T[i + 1]))
        s.style.opacity = kin * (1 - kout)
        s.style.transform = `translateY(${(1 - kin) * 80 - kout * 80}px)`
        s.style.filter = `blur(${(1 - kin) * 10 + kout * 10}px)`
      })

      // Le téléphone arrive, flotte, et pivote légèrement
      const pin = E.outExpo(prog(t, 21.1, 22.1))
      const bob = Math.sin((t - 21) * 1.6) * 10
      const pout = E.inCubic(prog(t, 33.55, 34.05))
      phoneWrap.style.transform = `perspective(2000px) translateY(${(1 - pin) * 700 + bob + pout * 900}px) rotateY(${-10 + pin * 4 + Math.sin((t - 21) * 0.8) * 3}deg) rotateZ(${(1 - pin) * 8}deg)`

      // Écrans : glissement horizontal entre étapes
      const panes = [p1, p2, p3]
      panes.forEach((p, i) => {
        const a = i === 0 ? 0 : E.inOutCubic(prog(t, T[i] - 0.2, T[i] + 0.35))
        const bb = i === 2 ? 0 : E.inOutCubic(prog(t, T[i + 1] - 0.2, T[i + 1] + 0.35))
        const x = (1 - a) * 100 - bb * 100
        p.style.transform = `translateX(${i === 0 ? -bb * 100 : x}%)`
        p.style.display =
          i === cur || Math.abs(t - T[i]) < 0.4 || Math.abs(t - T[i + 1]) < 0.4 ? 'block' : 'none'
      })

      // Écran 1
      rows.forEach(({ rw, ck }, i) => {
        const k = E.outBack(prog(t, 21.6 + i * 0.12, 22.1 + i * 0.12))
        rw.style.opacity = clamp(k)
        rw.style.transform = `translateY(${(1 - k) * 40}px)`
        const c = E.outBack(prog(t, 22.6 + i * 0.28, 22.85 + i * 0.28))
        const on = t >= 22.6 + i * 0.28 && i !== 4
        ck.style.background = on ? 'var(--brand-deep)' : 'transparent'
        ck.style.borderColor = on ? 'var(--brand-deep)' : '#c9c6bb'
        ck.style.transform = `scale(${on ? 0.6 + c * 0.4 : 1})`
        ck.style.color = on ? '#fff' : 'transparent'
      })
      const press = prog(t, 24.3, 24.6)
      cta1.style.transform = `scale(${1 - Math.sin(press * Math.PI) * 0.06})`
      cta1.style.opacity = E.outCubic(prog(t, 22.2, 22.6))

      // Écran 2
      codeChars.forEach((c, i) => {
        const k = E.outBack(prog(t, 25.3 + i * 0.1, 25.55 + i * 0.1))
        c.style.transform = `scale(${k})`
        c.style.opacity = clamp(k)
      })
      qrCells.forEach(({ cell, d }) => {
        const k = prog(t, 25.7 + d * 0.035, 25.9 + d * 0.035)
        cell.style.opacity = k
        cell.style.transform = `scale(${E.outBack(k)})`
      })
      let joined = 0
      avs.forEach((a, i) => {
        const at = i === 0 ? 25.4 : chips[i - 1] ? chips[i - 1].at + 0.15 : 28.4
        const k = E.outBack(prog(t, at, at + 0.35))
        if (t >= at) joined++
        a.style.transform = `scale(${k})`
        a.style.opacity = clamp(k * 2)
        a.style.display = k > 0 ? 'grid' : 'none'
      })
      count.textContent = `${joined} participant${joined > 1 ? 's' : ''} · prêts à voter`
      chips.forEach(({ c, at }) => {
        const k = E.outBack(prog(t, at, at + 0.45))
        const o = E.inCubic(prog(t, 28.7, 29.05))
        c.style.opacity = clamp(k * 2) * (1 - o)
        c.style.transform = `translateY(${(1 - k) * 40 - o * 30}px) scale(${0.6 + k * 0.4})`
      })

      // Écran 3 — les cartes s'envolent, chacune dans la direction de son vote
      cards.forEach(({ card, stamp, i }) => {
        const a = actions[i]
        const at = swipeAt[i]
        const pre = E.outBack(prog(t, at - 0.35, at - 0.05))
        const go = E.inCubic(prog(t, at, at + 0.45))
        const depth = swipeAt.filter((s) => t < s + 0.2).indexOf(at)
        const dScale = depth < 0 ? 1 : 1 - depth * 0.05
        const dY = depth < 0 ? 0 : depth * -22
        const tilt = pre * (a.dx ? Math.sign(a.dx) * 6 : 0)
        card.style.transform = `translate(${go * a.dx + pre * Math.sign(a.dx) * 20}px, ${dY + go * a.dy + pre * Math.sign(a.dy) * 20}px) scale(${dScale}) rotate(${tilt + go * a.rot}deg)`
        card.style.opacity = depth > 2 ? 0 : 1
        stamp.style.opacity = pre
        stamp.style.transform = `translateX(-50%) scale(${1.6 - pre * 0.6}) rotate(${-8}deg)`
      })
      const dk = E.outBack(prog(t, 33.3, 33.7))
      done.style.opacity = clamp(dk)
      done.style.transform = `scale(${0.7 + 0.3 * dk})`
      btns.forEach(({ b, c }, bi) => {
        let hit = 0
        actions.forEach((a, ci) => {
          if (a.i === bi)
            hit = Math.max(hit, Math.sin(prog(t, swipeAt[ci] - 0.35, swipeAt[ci] + 0.15) * Math.PI))
        })
        b.style.transform = `scale(${1 - hit * 0.1})`
        b.style.background = hit > 0.3 ? c : 'var(--surface)'
        b.style.color = hit > 0.3 ? '#fff' : c
      })
    }
  })

  // ════════════════════════════════════════════════════════════
  // 6 · LE PODIUM  (34 → 40)
  // ════════════════════════════════════════════════════════════
  scene(34, 40.05, 'var(--slate)', (root) => {
    const spot = el('div', 'abs', root)
    css(spot, {
      left: '460px',
      top: '-200px',
      width: '1000px',
      height: '1400px',
      background:
        'radial-gradient(ellipse at 50% 30%, rgba(243,240,231,0.16) 0%, rgba(243,240,231,0) 60%)',
    })
    const title = el('div', 'line', root, 'Et le classement tranche.')
    css(title, { top: '96px', fontSize: '96px' })
    const verdict = el('div', 'line', root, 'Ce midi, on mange <span class="red">chez Mimi.</span>')
    css(verdict, { top: '96px', fontSize: '96px' })

    const base = el('div', 'abs', root)
    css(base, { left: '0', right: '0', bottom: '0', height: '1080px' })
    const cols = [
      { rank: 2, name: 'Sushi Kaz', score: 5, h: 330, x: 405, bg: 'var(--slate-3)', at: 34.9 },
      { rank: 1, name: 'Chez Mimi', score: 7, h: 450, x: 790, bg: 'var(--brand)', at: 35.5 },
      { rank: 3, name: 'Le Cèdre', score: 3, h: 240, x: 1175, bg: 'var(--slate-2)', at: 34.5 },
    ]
    cols.forEach((c) => {
      const col = el('div', 'podium-col', base)
      css(col, { left: c.x + 'px', width: '340px', height: c.h + 'px' })
      const block = el('div', 'block', col, String(c.rank))
      block.style.background = c.bg
      if (c.rank === 1) block.style.boxShadow = '0 0 120px 10px rgba(232,65,44,0.45)'
      const label = el('div', 'label', base)
      label.innerHTML = `<b>${c.name}</b><span>+0</span>`
      css(label, { left: c.x + 'px', width: '340px', right: 'auto' })
      Object.assign(c, { block, label, num: label.querySelector('span') })
    })
    cols[1].label.querySelector('span').style.background = 'var(--brand)'

    // Confettis : 180 papiers, gravité et roulis
    const r = rng(11)
    const colors = ['#e8412c', '#f2c24e', '#7cc495', '#f3f0e7', '#ff6a55', '#4f74a6']
    const bits = Array.from({ length: 180 }, () => {
      const c = el('div', 'confetti', root)
      const w = 10 + r() * 14
      css(c, {
        width: w + 'px',
        height: w * (0.4 + r() * 0.5) + 'px',
        background: colors[Math.floor(r() * colors.length)],
      })
      const ang = -Math.PI / 2 + (r() - 0.5) * 2.4
      const sp = 900 + r() * 1400
      return {
        c,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        rot: r() * 360,
        vr: (r() - 0.5) * 1400,
        wob: r() * 6,
        delay: r() * 0.12,
      }
    })

    return (t) => {
      const tk = E.outExpo(prog(t, 34.1, 34.8))
      const swap = prog(t, 37.0, 37.5)
      title.style.opacity = tk * (1 - E.inCubic(swap))
      title.style.transform = `translateY(${(1 - tk) * 50 - E.inCubic(swap) * 60}px)`
      const vk = E.outExpo(prog(t, 37.3, 38.0))
      verdict.style.opacity = vk
      verdict.style.transform = `translateY(${(1 - vk) * 60}px) scale(${1 + (1 - vk) * 0.1})`
      spot.style.opacity = E.outCubic(prog(t, 35.6, 36.4))

      const camIn = E.outCubic(prog(t, 34, 40))
      base.style.transform = `scale(${1 + camIn * 0.04}) translateY(${camIn * 10}px)`
      base.style.transformOrigin = '50% 100%'

      cols.forEach((c) => {
        const k = E.outBack(prog(t, c.at, c.at + 0.6))
        c.block.parentNode.style.height = c.h * Math.max(0, k) + 'px'
        const lk = E.outExpo(prog(t, c.at + 0.3, c.at + 0.9))
        c.label.style.bottom = c.h * Math.max(0, k) + 28 + 'px'
        c.label.style.opacity = lk
        c.label.style.transform = `translateY(${(1 - lk) * 30}px)`
        c.num.textContent = '+' + Math.round(c.score * E.outCubic(prog(t, c.at + 0.3, c.at + 1.2)))
      })
      const win = cols[1]
      const winPulse =
        t > 36.2 ? 1 + 0.06 * Math.exp(-(t - 36.2) * 5) * Math.cos((t - 36.2) * 20) : 1
      win.label.style.transform += ` scale(${winPulse})`

      const burst = 36.2
      bits.forEach((b) => {
        const dt = t - burst - b.delay
        if (dt < 0) {
          b.c.style.opacity = 0
          return
        }
        const drag = Math.exp(-dt * 1.6)
        const x = 960 + (b.vx * (1 - drag)) / 1.6 + Math.sin(dt * b.wob + b.rot) * 30
        const y = 1080 - 470 + (b.vy * (1 - drag)) / 1.6 + 420 * dt * dt
        b.c.style.opacity = 1 - prog(dt, 3, 3.8)
        b.c.style.transform = `translate(${x}px, ${y}px) rotate(${b.rot + b.vr * dt}deg) rotateX(${dt * 540 * (b.wob / 6)}deg)`
      })
    }
  })

  // ════════════════════════════════════════════════════════════
  // 7 · MOTS-CHOCS  (40 → 44)
  // ════════════════════════════════════════════════════════════
  const punches = [
    [40, 'var(--bg)', 'var(--ink)', 'Sans compte.'],
    [41, 'var(--brand)', 'var(--chalk)', 'Sans débat.'],
    [42, 'var(--slate)', 'var(--chalk)', 'En <span class="red">deux minutes.</span>'],
    [43, 'var(--bg)', 'var(--ink)', 'Et tout le monde<br>est <span class="red">content.</span>'],
  ]
  punches.forEach(([at, bg, fg, html], i) => {
    scene(at, at + 1.001, bg, (root) => {
      const line = el('div', 'line', root, html)
      css(line, {
        top: '50%',
        fontSize: i === 3 ? '170px' : '230px',
        color: fg,
        letterSpacing: '-0.035em',
      })
      return (t) => {
        const k = E.outExpo(prog(t, at, at + 0.45))
        line.style.transform = `translateY(-50%) scale(${lerp(1.25, 1, k) + (t - at) * 0.04})`
        line.style.opacity = clamp(k * 1.5)
        line.style.filter = `blur(${(1 - k) * 16}px)`
      }
    })
  })

  // ════════════════════════════════════════════════════════════
  // 8 · FIN  (44 → 49)
  // ════════════════════════════════════════════════════════════
  scene(44, 49, 'var(--slate)', (root) => {
    const halo = el('div', 'center', root)
    css(halo, {
      width: '1800px',
      height: '1800px',
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(232,65,44,0.3) 0%, rgba(232,65,44,0) 55%)',
    })
    const row = el('div', 'abs', root)
    css(row, {
      left: '0',
      right: '0',
      top: '250px',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '40px',
    })
    const { icon } = makeIcon(row, 150)
    const word = el('div', 'wordmark', row)
    word.style.fontSize = '140px'
    const letters = maskedWord(word, 'onmange').concat(maskedWord(word, 'koi', 'red'))

    const q = el('div', 'line', root, 'Alors, on mange <span class="red">koi</span> ce midi ?')
    css(q, { top: '500px', fontSize: '84px' })
    const ctaWrap = el('div', 'abs', root)
    css(ctaWrap, { left: '0', right: '0', top: '660px', textAlign: 'center' })
    const pill = el('div', 'pill', ctaWrap, 'Lancer une session <span>→</span>')
    const arrow = pill.querySelector('span')
    const small = el('div', 'line', root, 'Gratuit · Sans compte · Dès maintenant')
    css(small, {
      top: '818px',
      fontSize: '34px',
      fontFamily: 'var(--sans)',
      fontWeight: '600',
      letterSpacing: '0.02em',
      color: 'var(--chalk-muted)',
    })
    const fade = el('div', 'abs', root)
    css(fade, { inset: '0', background: '#0d0e0f' })

    return (t) => {
      const ik = E.outElastic(prog(t, 44.05, 45.0))
      icon.style.transform = `scale(${ik}) rotate(${(1 - ik) * -25}deg)`
      revealLetters(letters, t, 44.3, 0.03)
      halo.style.opacity = E.outCubic(prog(t, 44, 45.5)) * (0.85 + 0.15 * Math.sin(t * 2))
      halo.style.transform = `translate(-50%, -50%) scale(${1 + 0.05 * Math.sin(t * 1.3)})`

      const qk = E.outExpo(prog(t, 45.0, 45.7))
      q.style.opacity = qk
      q.style.transform = `translateY(${(1 - qk) * 50}px)`
      q.style.filter = `blur(${(1 - qk) * 12}px)`

      const pk = E.outBack(prog(t, 45.6, 46.1))
      pill.style.transform = `scale(${pk * (1 + 0.025 * Math.sin((t - 46) * 5) * prog(t, 46.2, 46.6))})`
      pill.style.opacity = clamp(pk * 2)
      arrow.style.transform = `translateX(${Math.max(0, Math.sin((t - 46) * 5)) * 10}px)`
      arrow.style.display = 'inline-block'

      const sk = E.outExpo(prog(t, 46.0, 46.7))
      small.style.opacity = sk
      small.style.transform = `translateY(${(1 - sk) * 30}px)`

      fade.style.opacity = E.inCubic(prog(t, 47.9, 49))
    }
  })

  // ── Rendu ───────────────────────────────────────────────────
  window.DURATION = DURATION
  window.render = function (t) {
    scenes.forEach((s) => {
      const on = t >= s.start && t < s.end
      s.root.style.display = on ? 'block' : 'none'
      if (on) s.update(t)
    })
    // Le grain bouge à chaque image, comme sur de la pellicule
    const f = Math.floor(t * 30)
    const gr = rng(f + 1)
    grain.style.transform = `translate(${Math.floor(gr() * 200 - 100)}px, ${Math.floor(gr() * 200 - 100)}px)`
  }
  window.ready = Promise.all(
    [
      '800 100px "Bricolage Grotesque"',
      '600 100px "Bricolage Grotesque"',
      '400 100px "Instrument Sans"',
      '700 100px "Instrument Sans"',
      '700 100px "Geist Mono"',
    ].map((f) => document.fonts.load(f, 'onmangekoi œ’…→'))
  ).then(() => {
    window.render(0)
    return true
  })
})()
