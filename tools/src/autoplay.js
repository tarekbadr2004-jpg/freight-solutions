/*
 * Freight Solutions journey: automatic playback.
 *
 * The journey was built to be driven by the page's scroll position: every scene, panel and
 * camera move reads `scrollTop`. Rather than rewrite that, this module moves the scroll position
 * itself, from the opening scene to the last one, without ever stopping. Each information box sets the
 * truck's speed while it is on show, so that its text stays up long enough to read (3 to 10 seconds,
 * by its length); between boxes the truck drives on briskly. Speed changes are spread over about two
 * seconds. Everything the design does on scroll still happens, as designed.
 *
 * The reader can step back and forward between the boxes and pause: with the buttons beside the
 * "Back to the website" button, the mouse wheel or a swipe (one step each), or the keyboard
 * (arrows and Page Up / Page Down step, the space bar pauses).
 *
 * It also takes the two costs that used to freeze the journey mid-drive (shader programs compiled
 * on first sight, and large pictures uploaded to the graphics card on first sight) and pays them
 * once, while the opening scene is on screen, before the drive starts.
 *
 *   ?autoplay=off   leaves the page scroll-driven (for comparison and testing).
 *   ?autoplay=2     plays twice as fast, ?autoplay=0.5 half as fast (testing only).
 */
const J = window.__fsJourney;
const html = document.documentElement;
const params = new URLSearchParams(location.search);

/* Pace, in the journey's own screens (the design gives every scene its length in screens, and the
   truck covers the same distance in every screen, so screens a second is the truck's speed). */
const PACE = {
  fast: 0.95,      // screens a second between boxes, once a box has been on show for its reading time
  slow: 0.25,      // the slowest the truck goes, for the longest texts
  skip: 1.52,      // screens a second when skipping ahead to a box not seen yet
  startHold: 1,    // seconds the truck stands still after a fresh page load before it sets off
  // Seconds each box stays on show, by how much there is to read: base + words x perWord, 3 to 10 s.
  read: { base: 0.5, perWord: 1 / 8.5, min: 3, max: 10 },
  ease: 0.9,       // seconds for a change of speed to settle: about two seconds from one pace to the next
  easeQuick: 0.35, // the same when pausing, or slowing down after a skip
  decel: 0.32,     // screens a second, per second: how gently the truck slows down ahead of a box
  endBrake: 0.76,  // screens over which the truck comes to rest at the end of the journey
  stepPast: 0.08,  // a step back or forward lands this many screens past where the box appears
  // Seconds for a step back or forward to a box already seen: base + screens x perScreen.
  step: { base: 0.6, perScreen: 0.25, min: 0.8, max: 2 },
};

const SPEED = Math.max(0.25, Math.min(16, Number(params.get('autoplay')) || 1));
if (J && params.get('autoplay') !== 'off') init();

function init() {
  const stage = J.stage;
  const scroller = document.scrollingElement || html;
  const view = document.getElementById('view');
  const sheet = document.getElementById('sheet');
  const frame = () => new Promise(r => requestAnimationFrame(r));
  const maxScroll = () => Math.max(1, scroller.scrollHeight - innerHeight);
  const desktop = () => innerWidth > 760 && !matchMedia('(max-width: 760px), (max-height: 499px) and (pointer: coarse)').matches;
  const embedded = () => html.hasAttribute('data-journey-preview') || html.hasAttribute('data-journey-entering');
  const booted = () => Boolean(window.__bootLifted) || document.getElementById('boot')?.hasAttribute('data-done');
  const overlayOpen = () => view?.hasAttribute('data-open') || sheet?.hasAttribute('data-open');
  const editable = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
  const typing = () => document.activeElement?.matches?.(editable);
  const active = () => desktop() && booted() && !embedded();

  const style = document.createElement('style');
  style.textContent = 'html[data-autoplay]{scrollbar-width:none}html[data-autoplay]::-webkit-scrollbar{display:none}html[data-autoplay] .journey-cue{visibility:hidden}'
    // The controls: an ink pill the height of the red "Back to the website" pill, on the same line,
    // at the edge of the scene next to the information panel.
    + '.fs-player{pointer-events:auto;position:absolute;z-index:60;bottom:1.5rem;right:1.5rem;display:flex;align-items:center;gap:2px;padding:.3rem;border-radius:999px;background:var(--ink);color:var(--paper);box-shadow:0 6px 18px color-mix(in srgb,var(--ink) 22%,transparent);transition:opacity .28s ease,translate .28s ease,visibility 0s}'
    + '.fs-player[data-off]{opacity:0;translate:0 .5rem;visibility:hidden;pointer-events:none;transition:opacity .28s ease,translate .28s ease,visibility 0s .28s}'
    + '.fs-player button{appearance:none;display:grid;place-items:center;width:2.75rem;height:2.75rem;margin:0;padding:0;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;cursor:pointer;transition:background-color .18s ease,scale .18s cubic-bezier(.25,1,.5,1)}'
    + '.fs-player button:hover{background:color-mix(in srgb,var(--paper) 14%,transparent)}'
    + '.fs-player button:active{scale:.94}'
    + '.fs-player button:focus-visible{outline:2px solid var(--kraft-300);outline-offset:2px}'
    + '.fs-player button:disabled{opacity:.35;cursor:default;background:transparent;scale:1}'
    + '.fs-player svg{width:1.25rem;height:1.25rem;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}'
    + '.fs-player .fs-solid{fill:currentColor;stroke:none}'
    + '[dir=rtl] .fs-player .fs-flip{transform:scaleX(-1)}'
    + '@media (prefers-reduced-motion:reduce){.fs-player,.fs-player[data-off],.fs-player button{transition:none}}';
  document.head.append(style);

  /* ---- warm-up: compile every shader variant and upload every picture before the drive ---- */
  let warmed = false, warming = null;
  const warmUp = async () => {
    const r = stage?.renderer, seq = stage?.sequencer, beats = stage?.plan?.totalBeats;
    if (!r || !seq || !beats || typeof r.compileAsync !== 'function') return;
    try { await Promise.race([J.assetsSettled?.(), new Promise(res => setTimeout(res, 12000))]); } catch {}
    window.__fsWarming = true;
    stage.pause();
    try {
      // Visit the route at small steps so the materials take every state they take during the
      // drive (fades, wipes between scenes), and compile what each new state needs. A material's
      // `version` moves whenever its shader would change, so only materials that changed since
      // the last step are compiled again. Compiling runs in the graphics driver's own threads.
      const seen = new WeakMap(), textures = new Set();
      let fogSeen = null;
      const sweep = async () => { for (let b = 0; b < beats; b += 0.25) {
        seq.seatAt(b);
        const o = seq.resolve();
        stage._camSeated = false;
        stage._updateEnvironment?.(o);
        stage._updateScenes?.(o, 0);
        stage._updateScenePush?.(o);
        stage._updateVehicle?.(o);
        const fog = stage.scene.fog ? (stage.scene.fog.isFogExp2 ? 'exp2' : 'linear') : 'none';
        const changed = [], picked = new Set();
        stage.scene.traverse(obj => {
          if (!(obj.isMesh || obj.isPoints || obj.isLine || obj.isSprite)) return;
          for (const m of [].concat(obj.material || [])) {
            // Scenery pictures are attached only when their scene comes up: collect them here.
            if (m) {
              for (const key in m) { const v = m[key]; if (v && v.isTexture) textures.add(v); }
              for (const u of Object.values(m.uniforms || {})) {
                for (const v of [].concat(u?.value ?? [])) if (v && v.isTexture) textures.add(v);
              }
            }
            if (!m || picked.has(m) || (fog === fogSeen && seen.get(m) === m.version)) continue;
            seen.set(m, m.version); picked.add(m); changed.push(obj);
          }
        });
        fogSeen = fog;
        if (!changed.length) continue;
        stage._updateCamera?.(o, 0);
        const subset = { traverse: fn => changed.forEach(fn), traverseVisible() {} };
        await r.compileAsync(subset, stage.camera, stage.scene);
      } };
      // The first visit asks for the scenery that loads on demand. Scenery is attached to its
      // scene only once it has arrived, so after it arrives, visit again to collect it.
      await sweep();
      try { await Promise.race([J.assetsSettled?.(), new Promise(res => setTimeout(res, 15000))]); } catch {}
      await sweep();
      let since = performance.now(), uploaded = 0;
      for (const t of textures) {
        const img = t.image;
        if (!img || t.version === 0 || !(img.width > 0 || img.videoWidth > 0) || img.complete === false) continue;
        r.initTexture(t);
        uploaded++;
        if (performance.now() - since > 24) { await frame(); since = performance.now(); }
      }
      window.__fsWarmInfo = { textures: textures.size, uploaded };
    } catch (error) {
      console.warn('journey warm-up skipped:', error);
    } finally {
      J.resetToHero?.();
      window.__fsWarming = false;
      stage.resume();
    }
  };

  /* ---- the information boxes, as the reader meets them ---- */
  // The box on show is the panel's live slot, named `scene/beat`. The website decides when it
  // changes (often a little before its part of the road, as the box's sign comes into view), so the
  // drive watches it. Each box sets the truck's speed while it is on show: slow enough for its text
  // to be read in its reading time, never slower than `PACE.slow`; once that time is up, the truck
  // speeds up towards `PACE.fast` until the next box appears. The truck never stops.
  const panelHost = document.getElementById('panel');
  const liveSlot = () => panelHost?.querySelector('.panel-slot[data-live="true"]');
  const liveKey = () => {
    const s = liveSlot();
    return s?.dataset.scene ? `${s.dataset.scene}/${s.dataset.beat}` : '';
  };
  let pxKey = '', pxPerScreen = innerHeight;
  const px = () => {
    const key = `${innerWidth}x${innerHeight}|${scroller.scrollHeight}`;
    if (key !== pxKey) {
      pxKey = key;
      const rest = document.querySelector('.journey-rest'), screens = stage?.plan?.totalScreens;
      pxPerScreen = rest?.offsetTop && screens ? rest.offsetTop / screens : innerHeight;
    }
    return pxPerScreen;
  };
  // A box's text and length come from its section of the page (`scene-beat`), which carries the
  // same words; once the truck has driven through a box, its real length on the road is known.
  const section = key => document.getElementById(key.replace('/', '-'));
  const readSeconds = key => {
    const words = (section(key)?.textContent || liveSlot()?.textContent || '').trim().split(/\s+/).filter(Boolean).length;
    return clamp(PACE.read.base + words * PACE.read.perWord, PACE.read.min, PACE.read.max);
  };
  const seen = new Map([['hero/0', 0]]); // box -> screen where it appeared, driving forward
  const lengths = new Map();             // box -> screens it stayed on show, driving forward
  const boxScreens = key => lengths.get(key) ?? (section(key)?.offsetHeight || px()) / px();
  const neighbour = (key, dir) => {
    const from = seen.get(key) ?? scroller.scrollTop / px();
    let best = null;
    for (const [k, s] of seen) {
      if (dir > 0 ? s > from + 0.01 && (!best || s < best.s) : s < from - 0.01 && (!best || s > best.s)) best = { key: k, s };
    }
    return best;
  };

  /* ---- the drive ---- */
  // mode: 'drive', 'skip' (fast forward to a box not seen yet), 'step' (back or forward to a box
  // already seen), 'done' (the end of the journey).
  let mode = 'drive', box = null, step = null, paused = false, pausedAt = 0, quick = false;
  let pos = 0, v = 0, lastSet = -1, last = performance.now(), lastKey = '', odd = null, expect = null;
  let yielding = false, stableSince = 0, lastSeen = 0;
  let ema = 16.7, slowSince = 0, settleUntil = 0;
  // A fresh page load holds the truck still for a moment before it sets off.
  let holdUntil = 0;

  const paceOf = (key, seconds = readSeconds(key)) => clamp(boxScreens(key) / Math.max(0.1, seconds), PACE.slow, PACE.fast);
  // The box after `key`, and where it should appear (where it did last time, or its section's start).
  const nextBox = key => {
    const [scene, beat] = key.split('/');
    let next = section(`${scene}/${Number(beat) + 1}`) ? `${scene}/${Number(beat) + 1}` : null;
    const scenes = stage?.plan?.scenes ?? [];
    for (let i = sceneIndex(scene) + 1; !next && i > 0 && i < scenes.length; i += 1) {
      if ((scenes[i].scene?.kind ?? 'content') !== 'transition') next = `${scenes[i].id}/0`;
    }
    const el = next && section(next);
    if (!el) return null;
    const at = seen.get(next) ?? (el.getBoundingClientRect().top + scroller.scrollTop) / px();
    return { key: next, at, speed: paceOf(next) };
  };
  // A box comes on show: its reading time, the speed that keeps it on show that long, and the next box
  // to slow down for in good time.
  const meet = (key, now, seconds = readSeconds(key)) => {
    box = { key, t0: now, read: Math.max(0, seconds), speed: paceOf(key, seconds), next: nextBox(key) };
  };
  const goTo = (to, key) => {
    const from = scroller.scrollTop;
    const seconds = clamp(PACE.step.base + Math.abs(to - from) / px() * PACE.step.perScreen, PACE.step.min, PACE.step.max) / SPEED;
    yielding = false;
    step = { from, to, t0: performance.now(), ms: seconds * 1000, key };
    mode = 'step'; v = 0; pos = from; lastSet = from;
    sync();
  };
  const ready = () => active() && warmed && !window.__fsWarming && Boolean(box);
  // The box the reader is at. (The panel itself follows the 3D scene, which catches up with the page
  // a moment after each move.)
  const currentBox = () => step?.key ?? box?.key ?? 'hero/0';
  // Is `key` the box that comes after `from`? The website sometimes flashes a later box for a moment
  // (the fifth testimonial, as the first billboard comes into view); that does not count as a box.
  const sceneIndex = id => stage?.plan?.scenes?.findIndex(s => s.id === id) ?? -1;
  const comesNext = (key, from) => {
    const [a, x] = key.split('/'), [b, y] = from.split('/');
    return a === b ? Number(x) === Number(y) + 1 : sceneIndex(a) > sceneIndex(b) && Number(x) === 0;
  };
  const stepBy = dir => {
    if (!ready()) return;
    const n = neighbour(currentBox(), dir);
    // A box seen before: just after the place where it appeared.
    if (n) { goTo(n.s < 0.01 ? 0 : (n.s + PACE.stepPast) * px(), n.key); return; }
    if (dir > 0) {
      if (mode !== 'done') { step = null; mode = 'skip'; sync(); }
      return;
    }
    // Back to a box not seen yet (after a jump ahead): go back a screen and a half.
    const y = step ? step.to : scroller.scrollTop;
    if (y > 1) goTo(Math.max(0, y - 1.5 * px()), null);
  };
  const setPaused = on => {
    if (on === paused) return;
    paused = on;
    const now = performance.now();
    if (on) pausedAt = now;
    else if (box) box.t0 += now - pausedAt; // the reading time waits while paused
    sync();
  };
  const replay = () => {
    J.resetToHero?.();
    step = null; yielding = false; v = 0; paused = false;
    pos = scroller.scrollTop; lastSet = pos; mode = 'drive';
    meet('hero/0', performance.now());
    sync();
  };
  const toggle = () => {
    if (!ready()) return;
    if (mode === 'done') replay(); else setPaused(!paused);
  };

  /* ---- the controls: back, pause / play, forward ---- */
  const LABELS = {
    en: { group: 'Journey controls', prev: 'Previous', next: 'Next', pause: 'Pause', play: 'Play', replay: 'Play again' },
    ar: { group: 'التحكم في الرحلة', prev: 'السابق', next: 'التالي', pause: 'إيقاف مؤقت', play: 'تشغيل', replay: 'التشغيل من البداية' },
  };
  const ICONS = {
    prev: '<svg class="fs-flip" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    next: '<svg class="fs-flip" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect class="fs-solid" x="6" y="5" width="4" height="14" rx="1"/><rect class="fs-solid" x="14" y="5" width="4" height="14" rx="1"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="fs-solid" d="M8 5.6v12.8a1 1 0 0 0 1.53.85l10.1-6.4a1 1 0 0 0 0-1.7L9.53 4.75A1 1 0 0 0 8 5.6z"/></svg>',
    replay: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 2.64-6.36L3 8.25"/><path d="M3 3.5v4.75h4.75"/></svg>',
  };
  const player = document.createElement('div');
  player.className = 'fs-player';
  player.setAttribute('role', 'group');
  player.setAttribute('data-off', '');
  const button = act => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.act = act;
    player.append(b);
    return b;
  };
  const prevBtn = button('prev'), playBtn = button('play'), nextBtn = button('next');
  prevBtn.innerHTML = ICONS.prev; nextBtn.innerHTML = ICONS.next;
  prevBtn.addEventListener('click', () => stepBy(-1));
  nextBtn.addEventListener('click', () => stepBy(1));
  playBtn.addEventListener('click', toggle);
  (document.getElementById('stage') || document.body).append(player);

  let shownState = '';
  const sync = () => {
    // From the first box after the opening one (the opening scene has its labels where the controls go).
    const live = liveKey();
    const on = ready() && !overlayOpen() && Boolean(live) && live !== 'hero/0' && currentBox() !== 'hero/0';
    const canPrev = on && (Boolean(neighbour(currentBox(), -1)) || (step ? step.to : scroller.scrollTop) > 1);
    const canNext = on && mode !== 'done';
    const icon = mode === 'done' ? 'replay' : paused ? 'play' : 'pause';
    const lang = html.lang === 'ar' ? 'ar' : 'en';
    const state = `${on}|${canPrev}|${canNext}|${icon}|${lang}`;
    if (state === shownState) return;
    shownState = state;
    const L = LABELS[lang];
    player.toggleAttribute('data-off', !on);
    player.setAttribute('aria-label', L.group);
    prevBtn.disabled = !canPrev; nextBtn.disabled = !canNext;
    prevBtn.setAttribute('aria-label', L.prev); nextBtn.setAttribute('aria-label', L.next);
    if (playBtn.dataset.icon !== icon) { playBtn.dataset.icon = icon; playBtn.innerHTML = ICONS[icon]; }
    playBtn.setAttribute('aria-label', L[icon]);
    // A focused button that becomes hidden would take the keyboard focus nowhere.
    if (!on && player.contains(document.activeElement)) document.activeElement.blur();
  };

  /* ---- the wheel, a swipe and the keyboard step between the boxes (no free scrolling) ---- */
  const blocking = () => active() && !overlayOpen();
  let wheelSum = 0, wheelAt = 0, wheelLock = 0;
  addEventListener('wheel', e => {
    if (!blocking() || e.ctrlKey) return;
    e.preventDefault();
    const now = performance.now();
    if (now - wheelAt > 250) wheelSum = 0;
    wheelAt = now;
    // One step per turn of the wheel: wait until it (or a trackpad's glide) has stopped.
    if (now < wheelLock) { wheelLock = Math.max(wheelLock, now + 200); return; }
    wheelSum += e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
    if (Math.abs(wheelSum) < 40) return;
    stepBy(Math.sign(wheelSum));
    wheelSum = 0; wheelLock = now + 600;
  }, { passive: false, capture: true });
  let touchY = null;
  addEventListener('touchstart', e => { touchY = blocking() && e.touches.length === 1 ? e.touches[0].clientY : null; }, { passive: true, capture: true });
  addEventListener('touchmove', e => { if (blocking()) e.preventDefault(); }, { passive: false, capture: true });
  addEventListener('touchend', e => {
    if (touchY === null || !blocking()) return;
    const dy = (e.changedTouches[0]?.clientY ?? touchY) - touchY;
    touchY = null;
    if (Math.abs(dy) > 50) stepBy(dy < 0 ? 1 : -1);
  }, { capture: true });
  const SCROLL_KEYS = new Set(['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'PageDown', 'PageUp', 'Home', 'End', ' ']);
  addEventListener('keydown', e => {
    if (!blocking() || !SCROLL_KEYS.has(e.key) || e.altKey) return;
    const t = e.target instanceof Element ? e.target : null;
    if (t?.closest(editable)) return;
    // The space bar presses a focused link or button, except on the controls, where it pauses.
    if (e.key === ' ' && t?.closest('a, button, summary') && !player.contains(t)) return;
    e.preventDefault();
    if (e.repeat || e.ctrlKey || e.metaKey) return;
    const rtl = html.dir === 'rtl';
    if (e.key === ' ') toggle();
    else if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) stepBy(1);
    else if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) stepBy(-1);
  }, true);

  const tick = now => {
    requestAnimationFrame(tick);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    const interval = now - last;
    last = now;

    if (!active()) {               // preview on the home page, phone layout, or still loading
      html.removeAttribute('data-autoplay');
      v = 0; lastSet = -1; step = null;
      sync();
      return;
    }
    html.setAttribute('data-autoplay', '');
    if (!warmed) {
      if (!warming) {
        const began = performance.now();
        warming = warmUp().finally(() => {
          warmed = true;
          // The opening box was already on screen while the scenes were being prepared; its
          // reading time is credited for that, and for the one-second hold that follows.
          const t = performance.now();
          meet('hero/0', t, readSeconds('hero/0') - (t - began) / 1000 + PACE.startHold);
          // Hold the truck still for a second after loading, then let it move.
          holdUntil = t + PACE.startHold * 1000;
        });
      }
      return;
    }
    if (window.__fsWarming || !box) return;

    const top = scroller.scrollTop, max = maxScroll(), unit = px() * SPEED;
    // Someone else moved the page (a chapter link, the website's own navigation, a view closing).
    // Let that finish, then carry on from wherever it landed, with the box on show there.
    if (lastSet >= 0 && Math.abs(top - lastSet) > 2) {
      yielding = true; stableSince = now; lastSeen = top; lastSet = -1; step = null;
    }
    if (yielding) {
      if (Math.abs(top - lastSeen) > 0.5) { lastSeen = top; stableSince = now; }
      if (now - stableSince < 400) { sync(); return; }
      yielding = false; pos = top; v = 0;
      mode = top >= max - 1 ? 'done' : 'drive';
      meet(liveKey() || box.key, now);
    }
    if (lastSet < 0) pos = top;

    // A new box on show while going forward.
    const key = liveKey();
    if (expect && (key === expect.key || now > expect.until)) expect = null;
    if (key !== lastKey) { lastKey = key; odd = null; }
    if (key && key !== box.key && !step && !expect && (mode === 'drive' || mode === 'skip') && v > 0) {
      // A box out of order counts only once it has stayed on show for a screen and a half.
      let take = comesNext(key, box.key);
      if (!take) {
        odd ??= { key, from: pos };
        take = pos - odd.from > 1.5 * px();
      }
      if (take) {
        const s = pos / px(), was = seen.get(box.key);
        if (was !== undefined && s > was) lengths.set(box.key, s - was);
        if (!(seen.get(key) <= s)) seen.set(key, s); // keep the earliest sighting
        if (mode === 'skip') { mode = 'drive'; quick = true; }
        meet(key, now);
      }
    }

    if (step) {
      const k = Math.min(1, (now - step.t0) / step.ms);
      pos = step.from + (step.to - step.from) * (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
      if (k >= 1) {
        pos = step.to; const to = step.key; step = null; mode = 'drive';
        meet(to || liveKey() || box.key, now);
        // The 3D scene (and with it the panel) catches up with a quick move within a second or two.
        expect = to ? { key: to, until: now + 4000 } : null;
      }
    } else {
      // The box's own pace while its reading time lasts, then on at the fast pace.
      const reading = (now - box.t0) / 1000 * SPEED < box.read;
      let want = (mode === 'skip' ? PACE.skip : reading ? box.speed : PACE.fast) * unit, braking = false;
      // Slow down gently ahead of the next box, to reach its pace as it comes on show.
      if (mode === 'drive' && box.next) {
        const cap = Math.sqrt((box.next.speed * unit) ** 2 + 2 * PACE.decel * px() * SPEED * SPEED * Math.max(0, box.next.at * px() - pos));
        if (cap < want) { want = cap; braking = true; }
      }
      // The one-second hold on a fresh page load: stand still, but keep ticking so the
      // 3D scene keeps drawing; once the hold is past, the drive picks up as normal.
      if (now < holdUntil) { want = 0; braking = false; }
      // Paused: stand still, except to go forward to the next box when asked.
      if ((paused && mode !== 'skip') || mode === 'done' || overlayOpen() || typing()) { want = 0; braking = false; }
      // Come to rest gently at the very end of the journey.
      const endBrake = (PACE.fast * unit) ** 2 / (2 * PACE.endBrake * px());
      want = Math.min(want, Math.max(6, Math.sqrt(2 * endBrake * Math.max(0, max - pos))));
      // Speed changes settle over about two seconds; slowing down after a skip, or for a pause, quicker.
      if (quick && v <= want * 1.05) quick = false;
      const ease = quick || paused || want === 0 ? PACE.easeQuick : PACE.ease;
      if (braking && want < v) v = want; // follow the slowing-down curve exactly
      else v += (want - v) * (1 - Math.exp(-dt / ease));
      if (want === 0 && v < 1) v = 0;
      pos = Math.min(max, pos + v * dt);
      if (max - pos < 0.5 && mode !== 'done') { pos = max; mode = 'done'; v = 0; }
    }
    if (Math.abs(pos - top) >= 0.5) scroller.scrollTop = pos;
    lastSet = scroller.scrollTop;
    sync();

    // If this computer cannot keep up, draw the 3D scene at a slightly lower resolution.
    ema += (interval - ema) * 0.05;
    if (now > settleUntil && ema > 28) {
      slowSince ||= now;
      if (now - slowSince > 2500 && (stage._dprCap ?? 1.5) > 1) {
        stage._dprCap = Math.max(1, (stage._dprCap ?? 1.5) - 0.25);
        setResolution(stage);
        slowSince = 0; settleUntil = now + 3000;
      } else if (now - slowSince > 2500 && !stage._minFrame) {
        // Still short of time at the lowest resolution: a steady 30 frames a second moves more
        // smoothly than an uneven 30-40.
        stage._minFrame = 28;
        slowSince = 0; settleUntil = now + 3000;
      }
    } else slowSince = 0;
  };
  // For tests: the current state, the boxes seen so far, and the same steps the controls take.
  window.__fsAutoplay = {
    get mode() { return mode; }, get reading() { return box?.key ?? ''; }, get paused() { return paused; },
    get speed() { return v / px(); }, get box() { return box && { ...box }; },
    seen: () => [...seen].map(([key, screen]) => ({ key, screen: +screen.toFixed(2), length: lengths.has(key) ? +lengths.get(key).toFixed(2) : null })).sort((a, b) => a.screen - b.screen),
    next: () => stepBy(1), prev: () => stepBy(-1), toggle,
  };
  requestAnimationFrame(tick);
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

// Change only the drawing resolution. The stage's own resize() also lays every scene out again,
// which re-uploads all scenery pictures (seconds of freezing on a modest graphics chip).
function setResolution(stage) {
  const r = stage.renderer, el = r?.domElement;
  if (!r || !el) return;
  const w = el.clientWidth || stage.clientWidth, h = el.clientHeight || stage.clientHeight;
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, stage._dprCap));
  if (w && h) r.setSize(w, h, false);
}
