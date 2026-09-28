/*
 * r8 proposal behaviour. Vanilla JS standing in for motion/react so the proposals
 * open from disk with no build. Timings come from tokens.css (read at runtime).
 * Proposal-only controls live in the blue ".proto" bar and are not part of the design.
 */
(function () {
  const root = document.documentElement
  const params = new URLSearchParams(location.search)
  const reduced = () => root.dataset.motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches
  const cssMs = (name) => parseFloat(getComputedStyle(root).getPropertyValue(name)) || 0

  // ── Theme: follows the OS unless the viewer chose (F-13); ?theme= for the index frames
  function initialTheme() {
    if (params.get('theme')) return params.get('theme')
    try { const saved = localStorage.getItem('boa-theme'); if (saved) return saved } catch (e) {}
    return 'dark' // dark first (Vipin, 28 Sep); light is a choice in the operator menu
  }
  root.dataset.theme = initialTheme()
  try { const f = localStorage.getItem('boa-font'); if (f) root.style.setProperty('--f-body-pick', `'${f}'`) } catch (e) {}
  if (params.get('frame')) document.addEventListener('DOMContentLoaded', () => document.body.classList.add('in-frame'))
  if (params.get('state')) root.dataset.state = params.get('state')
  if (params.get('motion')) root.dataset.motion = params.get('motion')

  const R8 = (window.R8 = {})

  R8.setTheme = (t) => { root.dataset.theme = t; try { localStorage.setItem('boa-theme', t) } catch (e) {} ; R8.syncProto() }

  // ── Shell: nav + footer, shared by every desk/gate screen ─────────────────
  const DESK = [
    ['control', 'Control room', 'r8-control-room.html'],
    ['master', 'Master list', 'r8-master.html'],
    ['passes', 'Passes', 'r8-passes.html'],
    ['orgs', 'Organisations', 'r8-orgs.html'],
    ['gate', 'Gate', 'r8-gate.html'],
  ]
  R8.shell = function ({ active, badges = {}, operator = { name: 'Bhoopesh S', role: 'Lead', initials: 'BS' }, gate = null } = {}) {
    const nav = document.createElement('header')
    nav.className = 'nav'
    const links = DESK.map(([id, label, href]) =>
      `<li><a href="${href}"${id === active ? ' aria-current="page"' : ''}>${label}${badges[id] ? ` <span class="badge" aria-label="${badges[id]} need attention">${badges[id]}</span>` : ''}</a></li>`).join('')
    const sheetLinks = DESK.map(([id, label, href]) => `<a href="${href}"${id === active ? ' aria-current="page"' : ''}>${label}${badges[id] ? `<span class="badge">${badges[id]}</span>` : ''}</a>`).join('')
    const syncHtml = gate
      ? `<span class="sync label-sm" data-state="${gate.online ? 'online' : 'offline'}" id="sync"><span class="dot"></span><span class="sync-text">${gate.online ? 'Synced 2 min ago' : 'Offline'}${gate.queued ? ` · ${gate.queued} waiting` : ''}</span></span>`
      : ''
    nav.innerHTML = `<div class="frame">
      <a class="nav-logo" href="r8-control-room.html" aria-label="Bangalore Open Air accreditation, Control room"><img src="../../../public/assets/boa-logo.png" alt=""></a>
      <nav aria-label="Desk"><ul class="nav-links" id="nav-links"><span class="nav-pill" aria-hidden="true"></span>${links}</ul></nav>
      <div class="nav-end">${syncHtml}
        <div style="position:relative">
          <button class="avatar" id="avatar" aria-haspopup="menu" aria-expanded="false" aria-label="Operator menu, ${operator.name}">${operator.initials}</button>
          <div class="pop" id="pop" role="menu" data-open="false">
            <div class="pop-head"><div class="label">${operator.name}</div><div class="body-sm ink-3">${operator.role}${gate ? ` · ${gate.label}` : ''}</div></div>
            <button role="menuitem" data-theme-toggle><i class="ph ph-sun"></i><span>Light theme</span></button>
            <a role="menuitem" href="r8-users.html"><i class="ph ph-users-three"></i>Users</a>
            <a role="menuitem" href="r8-cold.html#signed-out"><i class="ph ph-sign-out"></i>Sign out</a>
          </div>
        </div>
        <button class="nav-burger" id="burger" aria-label="Menu" aria-expanded="false" aria-controls="nav-sheet"><i class="ph ph-list"></i></button>
      </div></div>
      <div class="nav-sheet" id="nav-sheet" data-open="false">${sheetLinks}</div>`
    document.body.querySelector('.app').prepend(nav)
    const amb = document.createElement('div'); amb.className = 'ambient'; amb.setAttribute('aria-hidden', 'true'); document.body.prepend(amb)

    const footer = document.createElement('footer')
    footer.className = 'footer'
    footer.innerHTML = `<div class="frame"><div class="footer-in">
      <div class="footer-brand"><img src="../../../public/assets/boa-logo.png" alt="Bangalore Open Air"><p class="footer-date">Show <span>10 Oct</span> 2026</p></div>
      <div class="footer-cols"><div><h2 class="label">Build</h2><p>5 to 9 October.</p></div><div><h2 class="label">Need help</h2><p>Message the accreditation desk.</p></div><div><h2 class="label">Your data</h2><p>We keep your name, phone, role and vehicle number. Nothing else.</p></div></div>
      </div><div class="footer-base label-sm"><span>Signed in as ${operator.name} (${operator.role})</span><a href="https://rocknrolloriginals.com">rocknrolloriginals.com</a></div></div>`
    document.body.querySelector('.app').append(footer)

    // nav pill slides between items (spring)
    const ul = nav.querySelector('#nav-links'), pill = nav.querySelector('.nav-pill')
    const place = (a, animate) => {
      if (!a) { pill.style.opacity = 0; return }
      if (!animate) pill.style.transition = 'none'
      pill.style.width = a.offsetWidth + 'px'; pill.style.transform = `translateX(${a.offsetLeft}px)`
      if (!animate) requestAnimationFrame(() => (pill.style.transition = ''))
    }
    const cur = ul.querySelector('[aria-current]')
    requestAnimationFrame(() => place(cur, false))
    document.fonts?.ready.then(() => place(cur, false))
    ul.querySelectorAll('a').forEach((a) => a.addEventListener('mouseenter', () => place(a, true)))
    ul.addEventListener('mouseleave', () => place(cur, true))
    addEventListener('resize', () => place(cur, false))

    const av = nav.querySelector('#avatar'), pop = nav.querySelector('#pop')
    const setPop = (open) => { pop.dataset.open = open; av.setAttribute('aria-expanded', open) }
    av.addEventListener('click', (e) => { e.stopPropagation(); setPop(pop.dataset.open !== 'true') })
    document.addEventListener('click', (e) => { if (!pop.contains(e.target)) setPop(false) })
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setPop(false); setSheet(false) } })
    pop.querySelector('[data-theme-toggle]').addEventListener('click', () => R8.setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'))
    const burger = nav.querySelector('#burger'), sheet = nav.querySelector('#nav-sheet')
    const setSheet = (open) => { sheet.dataset.open = open; burger.setAttribute('aria-expanded', open) }
    burger.addEventListener('click', () => setSheet(sheet.dataset.open !== 'true'))
  }

  // ── Proposal bar: theme, motion, data state, extra per-page buttons ──────
  R8.proto = function (extra = []) {
    const bar = document.createElement('div')
    bar.className = 'proto'
    bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Proposal controls (not part of the design)')
    const states = document.querySelector('[data-states]') ? (document.querySelector('[data-states]').dataset.states || 'ready,loading,empty,error').split(',') : []
    bar.dataset.collapsed = 'true'
    bar.innerHTML = `<button class="proto-toggle" data-toggle aria-label="Show proposal controls">r10 ▾</button><button data-t="dark">Dark</button><button data-t="light">Light</button><span class="sep"></span>
      <button data-m="full">Motion</button><button data-m="reduced">Reduced</button>
      ${states.length ? '<span class="sep"></span>' + states.map((s) => `<button data-s="${s}">${s[0].toUpperCase() + s.slice(1)}</button>`).join('') : ''}
      <span class="sep"></span><button data-f="Instrument Sans">Instrument</button><button data-f="Hanken Grotesk">Hanken</button><button data-f="Manrope">Manrope</button>
      ${extra.length ? '<span class="sep"></span>' + extra.map((x, i) => `<button data-x="${i}">${x.label}</button>`).join('') : ''}`
    document.body.append(bar)
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return
      if (b.hasAttribute('data-toggle')) { bar.dataset.collapsed = bar.dataset.collapsed === 'true' ? 'false' : 'true'; return }
      if (b.dataset.f) { root.style.setProperty('--f-body-pick', `'${b.dataset.f}'`); try { localStorage.setItem('boa-font', b.dataset.f) } catch (e) {} ; R8.syncProto() }
      if (b.dataset.t) R8.setTheme(b.dataset.t)
      if (b.dataset.m) { root.dataset.motion = b.dataset.m; R8.syncProto() }
      if (b.dataset.s) R8.setState(b.dataset.s)
      if (b.dataset.x) extra[+b.dataset.x].run()
    })
    R8.syncProto()
  }
  R8.syncProto = function () {
    document.querySelectorAll('.proto [data-t]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.t === root.dataset.theme))
    const f = (root.style.getPropertyValue('--f-body-pick') || "'Instrument Sans'").replace(/'/g, '')
    document.querySelectorAll('.proto [data-f]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.f === f))
    document.querySelectorAll('.proto [data-m]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === (root.dataset.motion || 'full')))
    document.querySelectorAll('.proto [data-s]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.s === (root.dataset.state || 'ready')))
  }
  R8.setState = function (s) {
    root.dataset.state = s; R8.syncProto()
    if (s === 'ready') { document.querySelectorAll('.when-ready').forEach((el) => { el.classList.remove('fade-in'); void el.offsetWidth; el.classList.add('fade-in') }); R8.countUp(true) }
  }

  // ── CountUp (React Bits CountUp): first load of a session only ──────────
  R8.countUp = function (force) {
    let seen = false
    try { seen = sessionStorage.getItem('boa-counted') === '1' } catch (e) {}
    const els = document.querySelectorAll('[data-count]')
    els.forEach((el) => {
      const to = +el.dataset.count
      const fmt = (n) => Math.round(n).toLocaleString('en-IN')
      if (reduced() || (seen && !force)) { el.textContent = fmt(to); return }
      const dur = 900, t0 = performance.now()
      const step = (t) => { const k = Math.min(1, (t - t0) / dur); const e = 1 - Math.pow(1 - k, 4); el.textContent = fmt(to * e); if (k < 1) requestAnimationFrame(step) }
      requestAnimationFrame(step)
    })
    try { sessionStorage.setItem('boa-counted', '1') } catch (e) {}
  }

  // ── SpotlightCard: pointer position into --mx/--my ─────────────────────
  document.addEventListener('pointermove', (e) => {
    const c = e.target.closest && e.target.closest('.spot'); if (!c) return
    const r = c.getBoundingClientRect(); c.style.setProperty('--mx', e.clientX - r.left + 'px'); c.style.setProperty('--my', e.clientY - r.top + 'px')
  })

  // ── Sheet: right on desktop, bottom on phone, drag down to close ───────
  let scrim
  R8.openSheet = function (id) {
    const sheet = document.getElementById(id); if (!sheet) return
    if (!scrim) { scrim = document.createElement('div'); scrim.className = 'scrim'; document.body.append(scrim); scrim.addEventListener('click', R8.closeSheets) }
    scrim.dataset.open = 'true'; sheet.dataset.open = 'true'
    sheet._return = document.activeElement
    setTimeout(() => (sheet.querySelector('[autofocus]') || sheet.querySelector('.sheet-close'))?.focus(), 30)
    const grab = sheet.querySelector('.grabber')
    if (grab && !grab._wired) {
      grab._wired = true
      let y0 = null
      sheet.addEventListener('pointerdown', (e) => { if (e.target.closest('.sheet-head, .grabber') && innerWidth <= 700) { y0 = e.clientY; sheet.style.transition = 'none'; sheet.setPointerCapture(e.pointerId) } })
      sheet.addEventListener('pointermove', (e) => { if (y0 === null) return; const dy = Math.max(0, e.clientY - y0); sheet.style.transform = `translateY(${dy}px)` })
      const end = (e) => { if (y0 === null) return; const dy = e.clientY - y0; y0 = null; sheet.style.transition = ''; sheet.style.transform = ''; if (dy > 120) R8.closeSheets() }
      sheet.addEventListener('pointerup', end); sheet.addEventListener('pointercancel', end)
    }
  }
  R8.closeSheets = function () {
    document.querySelectorAll('.sheet[data-open="true"]').forEach((s) => { s.dataset.open = 'false'; s._return?.focus?.() })
    if (scrim) scrim.dataset.open = 'false'
  }
  document.addEventListener('click', (e) => { if (e.target.closest('.sheet-close,[data-close-sheet]')) R8.closeSheets() })
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') R8.closeSheets() })

  // ── Toast ───────────────────────────────────────────────────────────────
  R8.toast = function (text, { icon = 'check-circle', bad = false } = {}) {
    let box = document.querySelector('.toasts')
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.append(box) }
    const t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : '')
    t.innerHTML = `<i class="ph ph-${icon}"></i><span>${text}</span>`
    box.append(t)
    let timer = setTimeout(() => leave(), 4000)
    const leave = () => { t.classList.add('out'); setTimeout(() => t.remove(), cssMs('--d-quick') + 20) }
    t.addEventListener('mouseenter', () => clearTimeout(timer)); t.addEventListener('mouseleave', () => (timer = setTimeout(leave, 1500)))
  }

  // ── HoldButton (React Bits pattern): hold for N ms, release early cancels ─
  R8.hold = function (btn, { ms = 700, onDone }) {
    const fill = document.createElement('span'); fill.className = 'hold-fill'; btn.prepend(fill); btn.classList.add('hold')
    let raf, t0
    const reset = () => { cancelAnimationFrame(raf); btn.dataset.holding = 'false'; btn.style.setProperty('--p', 0) }
    const start = (e) => {
      if (btn.disabled) return
      if (e.type === 'keydown' && e.key !== ' ' && e.key !== 'Enter') return
      if (e.type === 'keydown' && e.repeat) return
      e.preventDefault(); t0 = performance.now(); btn.dataset.holding = 'true'
      const tick = (t) => { const k = Math.min(1, (t - t0) / ms); btn.style.setProperty('--p', k); if (k < 1) raf = requestAnimationFrame(tick); else { reset(); navigator.vibrate?.(30); onDone() } }
      raf = requestAnimationFrame(tick)
    }
    btn.addEventListener('pointerdown', start); btn.addEventListener('keydown', start)
    ;['pointerup', 'pointerleave', 'pointercancel', 'keyup', 'blur'].forEach((ev) => btn.addEventListener(ev, reset))
    btn.setAttribute('aria-description', `Press and hold for ${ms / 1000} seconds`)
  }

  // ── StatusMark SVGs ─────────────────────────────────────────────────────
  R8.markSvg = (kind) => ({
    ok: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M10 21l7 7 14-15"/></svg>',
    wait: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 9v14"/><path d="M20 30v.5"/></svg>',
    bad: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M12 12l16 16"/><path d="M28 12L12 28"/></svg>',
  })[kind]

  // ── A deterministic QR-like pattern (NOT a real code) for the ticket ────
  R8.fakeQr = function (seed = 'BOA26') {
    let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0
    const n = 25, cells = []
    const rnd = () => ((h = (h * 1103515245 + 12345) >>> 0) / 4294967296)
    const finder = (x, y) => { for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) if (i === 0 || i === 6 || j === 0 || j === 6 || (i > 1 && i < 5 && j > 1 && j < 5)) cells.push([x + i, y + j]) }
    finder(0, 0); finder(n - 7, 0); finder(0, n - 7)
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) {
      const inF = (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9)
      if (!inF && rnd() > .52) cells.push([x, y])
    }
    return `<svg viewBox="-1 -1 ${n + 2} ${n + 2}" aria-label="Pass code (illustration, not a real code)" role="img" shape-rendering="crispEdges">${cells.map(([x, y]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="#0A0A0A"/>`).join('')}</svg>`
  }

  // ── Festival data shared by every proposal ──────────────────────────────
  R8.TIERS = {
    aaa: { label: 'AAA', band: 'Green', c: 'var(--tier-aaa)', printed: 100, img: 'aaa' },
    artist: { label: 'Artist', band: 'Magenta', c: 'var(--tier-artist)', printed: 100, img: 'artist' },
    stage: { label: 'Stage', band: 'Orange', c: 'var(--tier-stage)', printed: 50, img: 'stage' },
    promoters: { label: 'Promoters Lounge', band: 'Royal blue', c: 'var(--tier-promoters)', printed: 50, img: 'promoters_lounge' },
    crew: { label: 'Crew', band: 'Purple', c: 'var(--tier-crew)', printed: 500, img: 'crew' },
    photo: { label: 'Photo', band: 'Yellow', c: 'var(--tier-photo)', printed: null, img: 'photo' },
    eddies: { label: "Eddie's Lounge", band: 'Red', c: 'var(--tier-eddies)', printed: 50, img: 'eddies_lounge' },
    ga: { label: 'General Admission', band: 'Black / grey / white', c: 'var(--tier-ga)', printed: 3000, img: 'general_admission' },
  }
  R8.ZONES = { festival: ['Festival Area', 'var(--zone-green)'], eddies: ["Eddie's Lounge", 'var(--zone-red)'], promoters: ['Promoters Lounge', 'var(--zone-blue)'], photo: ['Photo Pit', 'var(--zone-yellow)'], backstage: ['Backstage', 'var(--zone-purple)'], stage: ['Main Stage', 'var(--zone-orange)'] }
  R8.HELD = {
    aaa: ['festival', 'eddies', 'promoters', 'photo', 'backstage', 'stage'], artist: ['festival', 'eddies', 'promoters', 'photo', 'backstage', 'stage'],
    stage: ['festival', 'photo', 'backstage', 'stage'], promoters: ['festival', 'promoters', 'backstage'], crew: ['festival', 'photo'],
    photo: ['festival', 'photo'], eddies: ['festival', 'eddies'], ga: ['festival'],
  }
  R8.zonesHtml = (tier) => tier === 'aaa' ? '<ul class="zones"><li>All zones</li></ul>' : `<ul class="zones">${R8.HELD[tier].map((z) => `<li><i style="--c:${R8.ZONES[z][1]}"></i>${R8.ZONES[z][0]}</li>`).join('')}</ul>`
  R8.band = (tier) => `../../../public/assets/bands/${R8.TIERS[tier].img}.webp`

  document.addEventListener('DOMContentLoaded', () => R8.countUp(false))
})()
