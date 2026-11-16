import { initQuoteForms } from './quote-runtime.js';
import { initJourneyPortal, JOURNEY_DESKTOP_QUERY } from './journey.mjs';
import { loadLandingMedia } from './loading.mjs';

const hasDom = typeof document !== 'undefined' && typeof document.querySelector === 'function';

/**
 * Stagger slot for each reveal element, counted within its own chapter. The first version used the
 * element's index in the page-wide list modulo five, so a chapter's heading could land on slot 4
 * while its third card landed on slot 0: the cards arrived before their title and the sixth card
 * before the fifth. The slot is now the element's position inside the nearest chapter (cap 6, so
 * a long list never waits more than 420ms) and a chapter always opens top-down.
 */
export const STAGGER_CAP = 6;
export function staggerOrders(elements, chapterOf) {
  const seen = new Map();
  return elements.map((element) => {
    const chapter = chapterOf(element) ?? element;
    const n = seen.get(chapter) ?? 0;
    seen.set(chapter, n + 1);
    return Math.min(n, STAGGER_CAP);
  });
}

if (hasDom) {
initQuoteForms(document);
const media = loadLandingMedia(document);
initJourneyPortal(document, { warmupReady: media.contentReady });
window.matchMedia(JOURNEY_DESKTOP_QUERY).addEventListener('change', () => media.refresh());
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const header = $('[data-header]');
const menuButton = $('[data-menu-toggle]');
const menu = $('[data-mobile-menu]');
menuButton?.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(open));
  menu.hidden = !open;
  header.toggleAttribute('data-menu-open', open);
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || menu?.hidden) return;
  menu.hidden = true;
  menuButton?.setAttribute('aria-expanded', 'false');
  header?.removeAttribute('data-menu-open');
  menuButton?.focus();
});

$$('[data-language-link]').forEach((link) => {
  if (location.hash) link.href = `${link.href.split('#')[0]}${location.hash}`;
});
// The phone route card marks the chapter in view. Purely additive: the links work without it.
const route = $('[data-mobile-route]');
if (route && typeof IntersectionObserver !== 'undefined') {
  const links = $$('a[href^="#"]', route);
  const setCurrent = (id) => links.forEach((link) => {
    const current = link.getAttribute('href') === `#${id}`;
    if (current) link.setAttribute('aria-current', 'true'); else link.removeAttribute('aria-current');
    // Centre the current link by scrolling the CARD, never the document. `scrollIntoView` honours
    // the page's scroll-padding-top (188px, so anchor jumps clear the header and this card), and
    // the card sticks at 84px, inside that padding: every chapter change dragged the page back up
    // ~100px, which on a phone felt like rubber-banding at the services grid.
    if (current) {
      const box = route.getBoundingClientRect();
      const at = link.getBoundingClientRect();
      route.scrollBy({ left: (at.left + at.width / 2) - (box.left + box.width / 2), behavior: 'smooth' });
    }
  });
  /**
   * THE CURRENT CHAPTER IS THE LAST ONE WHOSE TOP HAS PASSED THE READING LINE. The observer this
   * replaces watched a 15% band and ranked by intersection ratio, which favours short sections:
   * a tall one (services, case studies) intersected the band at a ratio of ~0.05 and lost to
   * whatever short neighbour was still in it, so the card skipped items 2 and 5 (client,
   * 2026-09-19). A scroll-driven pick has no ratio to lose on and no batch of entries to miss.
   */
  const targets = links.map((link) => document.getElementById(link.getAttribute('href').slice(1))).filter(Boolean);
  let ticking = false;
  let currentId = null;
  const pick = () => {
    ticking = false;
    const line = innerHeight * 0.42;
    let id = targets[0]?.id ?? null;
    for (const target of targets) if (target.getBoundingClientRect().top <= line) id = target.id;
    if (id && id !== currentId) { currentId = id; setCurrent(id); }
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(pick); } }, { passive: true });
  addEventListener('resize', pick);
  pick();
}
const targetedFaq = location.hash && document.getElementById(location.hash.slice(1));
if (targetedFaq?.tagName === 'DETAILS') targetedFaq.open = true;

// Motion only enhances visible document blocks. It never hides content before JavaScript, and
// selectors intentionally stop at leaf blocks so a parent and child cannot reveal together.
const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
let reducedMotion = Boolean(motionQuery?.matches);
let motionObserver;
let countObserver;
let imageObserver;
let motionStarted = false;
const activeCounters = new Set();
const activeReveals = new Set();
const stopMotion = () => {
  motionObserver?.disconnect();
  countObserver?.disconnect();
  imageObserver?.disconnect();
  activeReveals.forEach((animation) => animation.cancel());
  activeReveals.clear();
  activeCounters.forEach((cancel) => cancel());
  activeCounters.clear();
  $$('.motion-image-enter').forEach((image) => image.classList.remove('motion-image-enter'));
  $('.home-hero')?.classList.remove('is-ready');
  document.documentElement.classList.remove('motion-enabled');
  motionStarted = false;
};
const reveal = (element, delay = 0) => {
  if (reducedMotion || element.dataset.motionRevealed) return;
  element.dataset.motionRevealed = 'true';
  const phone = window.matchMedia?.('(max-width:48rem)').matches;
  const animation = element.animate([{ opacity: .32, transform: 'translateY(' + (phone ? 10 : 18) + 'px)' }, { opacity: 1, transform: 'translateY(0)' }],
    { duration: phone ? 480 : 620, delay, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' });
  activeReveals.add(animation);
  animation.finished.then(() => { activeReveals.delete(animation); animation.cancel(); }, () => activeReveals.delete(animation));
};
const numberIn = (value) => Number(String(value)
  .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/[^0-9]/g, '')) || 0;
const countUp = (element) => {
  if (reducedMotion || element.dataset.motionCounted) return;
  const final = element.textContent.trim();
  // Count only a self-contained integer plus the published unit. Ratios, ranges and decimal
  // figures are facts, not progress indicators, and must remain literally stable.
  if (!/^[0-9٠-٩][0-9٠-٩,٬]*[+%]?$/.test(final)) return;
  const value = numberIn(final);
  if (!value) return;
  element.dataset.motionCounted = 'true';
  element.dataset.motionCount = final;
  element.setAttribute('aria-label', final);
  element.style.minWidth = element.getBoundingClientRect().width + 'px';
  const format = new Intl.NumberFormat(/[٠-٩]/.test(final) ? 'ar-EG' : 'en-US');
  const suffix = final.replace(/^[0-9٠-٩,٬.]+/, '');
  const started = performance.now();
  let frame;
  const restore = () => {
    cancelAnimationFrame(frame);
    element.textContent = final;
    element.style.removeProperty('min-width');
  };
  const cancel = () => restore();
  activeCounters.add(cancel);
  const tick = (now) => {
    if (reducedMotion) return cancel();
    const p = Math.min(1, (now - started) / 1000);
    element.textContent = format.format(Math.round(value * (1 - Math.pow(1 - p, 4)))) + suffix;
    if (p < 1) frame = requestAnimationFrame(tick);
    else { restore(); activeCounters.delete(cancel); }
  };
  frame = requestAnimationFrame(tick);
};
const startMotion = () => {
  if (reducedMotion || motionStarted) return;
  motionStarted = true;
  document.documentElement.classList.add('motion-enabled');
  $('.home-hero')?.classList.add('is-ready');
  const selectors = [
    '.page-hero-copy > *',
    '.home-about-copy > *', '.section-services .section-heading', '.section-services .service-card',
    '.why-band > h2', '.why-band > div:not(.fact-row)', '.why-band .fact-row > div',
    '.industries-section > div', '.industries-section .industry-list > li',
    '.process-heading', '.step-list > li', '.process-list > li',
    '.home-projects .section-heading', '.home-projects .project-tile',
    '.testimonials-section .section-heading', '.testimonial-card',
    '.detail-content > section', '.related > div > *', '.quote-band > *'
  ];
  const elements = selectors.flatMap((selector) => $$(selector))
    .filter((element, index, all) => all.indexOf(element) === index)
    .filter((element) => !element.matches('.chapter-mark'))
    .filter((element) => !element.matches('.detail-content > section') || !element.querySelector('.step-list, .process-list'));
  const orders = staggerOrders(elements, (element) => element.closest('section, .why-band, .quote-band'));
  // Anything already on screen when motion starts is left exactly as painted. Animating it would
  // pull a visible block down to 32% and fade it back: that blink, not a missing reveal, was what
  // "broken animations" looked like. Only blocks below the fold get the pre-reveal state.
  const fold = window.innerHeight;
  elements.forEach((element, index) => {
    element.dataset.motion = 'reveal';
    element.dataset.motionOrder = String(orders[index]);
    if (element.getBoundingClientRect().top < fold) element.dataset.motionRevealed = 'true';
    if (element.matches('.step-list > li, .process-list > li')) element.classList.add('motion-step');
  });
  if (typeof IntersectionObserver === 'undefined') return;
  motionObserver = new IntersectionObserver((entries, observer) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    reveal(entry.target, Number(entry.target.dataset.motionOrder) * 70);
    observer.unobserve(entry.target);
  }), { rootMargin: '0px 0px -10%', threshold: .15 });
  elements.forEach((element) => { if (!element.dataset.motionRevealed) motionObserver.observe(element); });
  const images = $$('.home-about figure img, .page-hero figure img, .service-card figure img, .project-tile figure img');
  images.forEach((image) => {
    image.dataset.motionImage = 'true';
  });
  imageObserver = new IntersectionObserver((entries, observer) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    const image = entry.target;
    const enter = () => {
      image.classList.add('motion-image-enter');
      image.addEventListener('animationend', () => image.classList.remove('motion-image-enter'), { once: true });
    };
    if (image.complete) enter(); else image.addEventListener('load', enter, { once: true });
    observer.unobserve(image);
  }), { rootMargin: '0px 0px -10%', threshold: .12 });
  images.forEach((image) => imageObserver.observe(image));
  const figures = $$('.fact-row strong');
  figures.forEach((figure) => { figure.dataset.motionCount = figure.textContent.trim(); });
  countObserver = new IntersectionObserver((entries, observer) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    countUp(entry.target);
    observer.unobserve(entry.target);
  }), { rootMargin: '0px 0px -18%', threshold: .35 });
  figures.forEach((figure) => countObserver.observe(figure));
};
motionQuery?.addEventListener('change', (event) => {
  reducedMotion = event.matches;
  stopMotion();
  if (!reducedMotion) startMotion();
});

const nav = $('[data-section-nav]');
if (nav) {
  const links = new Map($$('a[href^="#"]', nav).map((link) => [link.hash.slice(1), link]));
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    links.forEach((link, id) => id === visible.target.id ? link.setAttribute('aria-current', 'true') : link.removeAttribute('aria-current'));
  }, { rootMargin: '-18% 0px -68%', threshold: [0, .25, .6] });
  $$('[data-observe-section]').forEach((section) => observer.observe(section));
}

// THE WAIT SCREEN. Static pages reload on every link, so the journey's paper cover with the
// released lockup stands between them: it rises on the click, the browser navigates under it, and
// the next document arrives already covered (the cover is in its HTML) and lets it fall once fonts
// are in. Only same-document-origin page links take it; hashes, downloads, new tabs and modified
// clicks keep the browser's own behaviour. Without JS the cover never shows (html.js gates it).
const cover = $('[data-cover]');
if (cover) {
  const settle = () => { cover.setAttribute('data-done', ''); };
  const fontsReady = document.fonts?.ready ?? Promise.resolve();
  const ready = Promise.all([fontsReady, media.heroReady]);
  Promise.race([ready, new Promise(r => setTimeout(r, 12000))]).then(() => setTimeout(() => {
    settle();
    startMotion();
  }, reducedMotion ? 0 : 120));
  window.addEventListener('pageshow', (event) => { if (event.persisted) settle(); });
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('a[href]');
    if (!link || link.target || link.hasAttribute('download') || link.origin !== location.origin) return;
    const same = link.pathname === location.pathname && link.search === location.search;
    if (same && link.hash) return;
    if (/^(mailto|tel):/.test(link.href)) return;
    event.preventDefault();
    cover.removeAttribute('data-done');
    cover.setAttribute('data-leaving', '');
    setTimeout(() => { location.href = link.href; }, reducedMotion ? 0 : 340);
  });
}

// Rendered fragments without the page-cover still receive the same non-blocking enhancement.
if (!cover) startMotion();

}
