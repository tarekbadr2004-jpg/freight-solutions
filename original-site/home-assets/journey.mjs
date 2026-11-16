import { withPageCover } from './loading.mjs';
const CHANNEL = 'fs-journey';
export const JOURNEY_DESKTOP_QUERY = '(min-width:48.0625rem) and (hover:hover) and (pointer:fine)';
const clamp = n => Math.max(-1, Math.min(1, n));

/** One iframe stays mounted throughout preview and entry; only its canvas zooms. */
export function initJourneyPortal(root = document, { warmupReady } = {}) {
  const section = root.querySelector('[data-journey-section]');
  if (!section) return;
  const desktop = matchMedia(JOURNEY_DESKTOP_QUERY);
  const destination = new URL(section.dataset.journeyUrl, location.href);
  if (destination.origin !== location.origin) return;
  const windowEl = section.querySelector('[data-journey-window]');
  const frameHost = section.querySelector('[data-journey-frame]');
  const start = section.querySelector('[data-start-journey]');
  const plane = section.querySelector('[data-journey-plane]');
  const display = section.querySelector('.journey-display');
  const status = section.querySelector('[data-journey-status]');
  const wait = section.querySelector('[data-journey-wait]');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const landingHref = location.href;
  let iframe, ready = false, failed = false, opened = false, phase = 'preview', cinematic = false;
  let visible = false, timeout, lastFocus, lockedScroll = 0, entryRect, ticket = 0;
  let overflow, padding, displayHeight, inertElements = [], retreatAnimations = [], planeAnimation;
  let mouseX = 0, mouseY = 0, pointerFrame = 0;
  let entryCover, releaseEntryCover;
  const releaseCover = () => { releaseEntryCover?.(); releaseEntryCover = undefined; };
  const send = (action, extra = {}) => iframe?.contentWindow?.postMessage({ channel: CHANNEL, action, ...extra }, destination.origin);
  const size = () => { if (!opened) windowEl.style.setProperty('--journey-scale', String(windowEl.clientWidth / 1000)); };
  new ResizeObserver(size).observe(windowEl); size();
  const visibility = () => send('visibility', { visible: desktop.matches && !document.hidden && (visible || opened) });
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; visibility(); }, { threshold: .05 }).observe(windowEl);
  document.addEventListener('visibilitychange', visibility);
  const parallax = () => {
    pointerFrame = 0;
    if (!desktop.matches || opened || motion.matches || !visible) return;
    const r = windowEl.getBoundingClientRect();
    const scroll = clamp((r.top + r.height / 2 - innerHeight / 2) / innerHeight) * .35;
    windowEl.style.setProperty('--journey-tilt-x', `${2 - (mouseY + scroll) * 1.8}deg`);
    windowEl.style.setProperty('--journey-tilt-y', `${-5 + mouseX * 3}deg`);
    plane.style.setProperty('--plane-x', `${mouseX * 18}px`);
    plane.style.setProperty('--plane-y', `${mouseY * 10}px`);
    if (ready) send('parallax', { x: mouseX, y: mouseY + scroll });
  };
  const queueParallax = () => { if (!pointerFrame) pointerFrame = requestAnimationFrame(parallax); };
  section.addEventListener('pointermove', event => {
    const r = windowEl.getBoundingClientRect();
    mouseX = clamp((event.clientX - r.left - r.width / 2) / Math.max(1, r.width / 2));
    mouseY = clamp((event.clientY - r.top - r.height / 2) / Math.max(1, r.height / 2));
    queueParallax();
  });
  section.addEventListener('pointerleave', () => { mouseX = mouseY = 0; queueParallax(); });
  window.addEventListener('scroll', queueParallax, { passive: true });
  const fail = () => {
    ready = false; failed = true; clearTimeout(timeout);
    releaseCover();
    windowEl.removeAttribute('data-ready'); windowEl.removeAttribute('data-active');
    status.textContent = status.dataset.error;
    if (opened) {
      wait.replaceChildren(document.createTextNode(status.dataset.error));
      const fallback = document.createElement('a'); fallback.href = destination.href; fallback.textContent = start.textContent.trim();
      wait.append(fallback); wait.hidden = false;
    }
  };
  const load = () => {
    if (!desktop.matches || iframe) return;
    const embedded = new URL(destination); embedded.searchParams.set('embed', 'preview');
    iframe = document.createElement('iframe'); iframe.title = section.querySelector('.journey-poster').alt;
    iframe.tabIndex = -1; iframe.inert = true; iframe.setAttribute('aria-hidden', 'true');
    iframe.addEventListener('error', fail); iframe.src = embedded.href; frameHost.append(iframe);
    timeout = setTimeout(fail, 30000);
  };
  const setInert = () => {
    const elements = [...root.querySelectorAll('body > .skip-link, body > header, body > footer, main > section, [data-mobile-route], .journey-copy')]
      .filter(el => el !== section && !el.contains(section));
    inertElements = elements.map(el => [el, el.inert]); elements.forEach(el => { el.inert = true; });
  };
  const retreat = () => {
    if (motion.matches) return;
    const actors = inertElements.map(([el]) => el).filter(el => {
      const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && el.animate;
    });
    actors.forEach(el => el.getAnimations?.({ subtree: true }).forEach(a => {
      if (a.effect?.getKeyframes().some(frame => 'opacity' in frame)) a.cancel();
    }));
    retreatAnimations = actors.map(el => el.matches('body > header')
      ? el.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-110%)' }],
        { duration: 420, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' })
      : el.animate([{ transform: 'perspective(1600px) translateZ(0) scale(1)' },
        { transform: 'perspective(1600px) translateZ(-150px) translateY(4vh) scale(.94)' }],
        { duration: 700, easing: 'cubic-bezier(.333333,0,.666667,1)', fill: 'forwards' }));
  };
  const beginScene = async () => {
    if (!opened || !ready || phase !== 'waiting') return;
    phase = 'departing'; const run = ticket;
    wait.hidden = true; status.textContent = '';
    // A cold section entry waits under the logo, then starts its scene-only zoom.
    // Direct entry keeps the cover until the iframe confirms its hero is painted.
    if (cinematic && entryCover) {
      releaseCover(); await entryCover;
      if (!opened || run !== ticket) return;
    }
    if (!cinematic) {
      plane.hidden = true;
      phase = 'entering'; windowEl.classList.add('is-open');
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (opened && run === ticket) send('activate');
      return;
    }
    send('departure'); retreat();
    if (!motion.matches && plane.animate) {
      const mir = root.documentElement.dir === 'rtl' ? -1 : 1;
      planeAnimation = plane.animate([{ transform: getComputedStyle(plane).transform },
        { transform: `translate3d(${mir * innerWidth * 1.4}px,${-innerHeight * .8}px,0) rotate(${-12 * mir}deg) scale(.7) scaleX(${mir})` }],
        { duration: 720, easing: 'cubic-bezier(.55,0,.75,.5)', fill: 'forwards' });
      planeAnimation.finished.then(() => { if (opened && run === ticket) plane.hidden = true; }, () => {});
    } else plane.hidden = true;
    if (!motion.matches) await new Promise(resolve => setTimeout(resolve, 180));
    if (!opened || run !== ticket || !desktop.matches) return;
    phase = 'entering'; windowEl.classList.add('is-open');
    // Two frames let the iframe adopt the actual desktop dimensions before its FLIP is measured.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (opened && run === ticket) send('enter', { rect: entryRect });
  };
  const close = () => {
    if (!opened) return;
    releaseCover(); entryCover = undefined;
    ticket += 1; opened = false; phase = 'preview';
    retreatAnimations.forEach(a => a.cancel()); retreatAnimations = [];
    planeAnimation?.cancel(); planeAnimation = undefined; plane.hidden = false;
    windowEl.classList.remove('is-open'); windowEl.removeAttribute('data-active'); windowEl.removeAttribute('data-entry-started');
    windowEl.removeAttribute('data-direct-entry');
    display.style.height = displayHeight;
    wait.hidden = true;
    iframe.inert = true; iframe.setAttribute('aria-hidden', 'true'); iframe.tabIndex = -1;
    send('preview');
    inertElements.forEach(([el, wasInert]) => { el.inert = wasInert; }); inertElements = [];
    document.body.style.overflow = overflow; document.body.style.paddingInlineEnd = padding;
    scrollTo({ top: lockedScroll, behavior: 'instant' }); size(); visibility();
    lastFocus?.focus({ preventScroll: true });
  };
  // Iframe chapter links add entries to the browser's joint history. Back can undo a chapter
  // instead of leaving the journey, so explicit return closes immediately and restores the URL.
  const leave = (loading = false) => {
    const restore = () => {
      close();
      history.replaceState({ ...history.state, fsJourney: false }, '', landingHref);
    };
    return loading ? withPageCover(root.querySelector('[data-cover]'), restore, { reduced: motion.matches }) : restore();
  };
  const enter = async (link = start, push = true, zoom = link === start) => {
    if (!desktop.matches || opened || phase !== 'preview' || failed) return;
    phase = 'seating'; load(); lastFocus = link; cinematic = zoom;
    let r = windowEl.getBoundingClientRect();
    if (cinematic && (r.bottom < 0 || r.top > innerHeight - 80)) {
      scrollTo({ top: scrollY + section.getBoundingClientRect().top - 100, behavior: 'instant' });
      await new Promise(resolve => requestAnimationFrame(resolve));
      if (!desktop.matches) { phase = 'preview'; return; }
      r = windowEl.getBoundingClientRect();
    }
    entryRect = { left: r.left, top: r.top, width: r.width, height: r.height };
    for (const [key, value] of Object.entries(entryRect)) windowEl.style.setProperty(`--entry-${key}`, `${value}px`);
    opened = true; phase = 'waiting'; ticket += 1; lockedScroll = scrollY;
    if (!cinematic || !ready) {
      const untilSeated = new Promise(resolve => { releaseEntryCover = resolve; });
      entryCover = withPageCover(root.querySelector('[data-cover]'), () => untilSeated, { reduced: motion.matches });
    } else entryCover = undefined;
    if (!cinematic) {
      windowEl.setAttribute('data-direct-entry', '');
      windowEl.classList.add('is-open');
    }
    displayHeight = display.style.height; display.style.height = `${display.clientHeight}px`;
    overflow = document.body.style.overflow; padding = document.body.style.paddingInlineEnd;
    const scrollbar = innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden'; if (scrollbar) document.body.style.paddingInlineEnd = `${scrollbar}px`;
    setInert(); wait.hidden = true; status.textContent = '';
    visibility(); if (push) history.pushState({ ...history.state, fsJourney: true }, '', destination.href);
    beginScene();
  };
  window.addEventListener('message', event => {
    if (event.origin !== destination.origin || event.source !== iframe?.contentWindow || event.data?.channel !== CHANNEL) return;
    if (event.data.action === 'ready') {
      ready = true; failed = false; clearTimeout(timeout); windowEl.setAttribute('data-ready', '');
      status.textContent = ''; visibility(); queueParallax(); beginScene();
    } else if (event.data.action === 'entry-started' && opened) windowEl.setAttribute('data-entry-started', '');
    else if (event.data.action === 'entered' && opened) {
      phase = 'active'; windowEl.setAttribute('data-active', '');
      releaseCover();
      windowEl.setAttribute('data-entry-started', '');
      iframe.inert = false; iframe.removeAttribute('aria-hidden'); iframe.tabIndex = 0;
      // Focus the browsing context for arrow keys, never the logo inside it.
      iframe.focus();
    } else if (event.data.action === 'close' && opened) leave(Boolean(event.data.loading));
    else if (event.data.action === 'error') fail();
    else if (['location', 'navigate'].includes(event.data.action) && opened && typeof event.data.href === 'string') {
      try {
        const target = new URL(event.data.href, destination); if (target.origin !== destination.origin) return;
        if (event.data.action === 'navigate') location.assign(target.href);
        else if (/^\/(ar\/)?$/.test(target.pathname) && target.searchParams.get('experience') === 'journey') history.replaceState(history.state, '', target.href);
      } catch { /* Ignore malformed messages without disrupting the current view. */ }
    }
  });
  root.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const link = event.target.closest?.('a[href]');
    if (!desktop.matches || !link || link.target || link.hasAttribute('download') || link.href !== destination.href || failed) return;
    event.preventDefault(); enter(link);
  });
  document.addEventListener('keydown', event => { if (opened && event.key === 'Escape') leave(); });
  window.addEventListener('popstate', () => {
    if (history.state?.fsJourney && desktop.matches) enter(start, false, false);
    else { close(); if (history.state?.fsJourney) history.replaceState({ ...history.state, fsJourney: false }, '', landingHref); }
  });
  motion.addEventListener('change', () => { if (motion.matches) { retreatAnimations.forEach(a => a.finish()); planeAnimation?.finish(); } });
  const schedule = () => {
    if (!desktop.matches) return;
    if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 1500 }); else setTimeout(load, 300);
  };
  desktop.addEventListener('change', () => {
    if (desktop.matches) { schedule(); return; }
    if (opened) leave(); close(); phase = 'preview'; clearTimeout(timeout);
    iframe?.remove(); iframe = undefined; ready = false; failed = false;
    windowEl.removeAttribute('data-ready'); status.textContent = '';
  });
  const warm = () => { if (warmupReady) warmupReady.then(schedule); else schedule(); };
  if (document.readyState === 'complete') warm(); else addEventListener('load', warm, { once: true });
}
