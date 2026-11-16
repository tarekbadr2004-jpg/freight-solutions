/** Decode one image before revealing it; failed media keeps its reserved, clean background. */
export function loadImage(image) {
  return new Promise(resolve => {
    let settled = false;
    const finish = async ok => {
      if (settled) return;
      settled = true;
      if (ok) { try { await image.decode?.(); } catch {} }
      else { image.removeAttribute('src'); image.setAttribute('data-load-error', ''); }
      image.removeAttribute('data-src');
      resolve();
    };
    image.addEventListener('load', () => finish(true), { once: true });
    image.addEventListener('error', () => finish(false), { once: true });
    if (image.dataset.src) {
      image.loading = 'eager'; image.fetchPriority = 'low'; image.src = image.dataset.src;
    }
    if (image.complete) finish(image.naturalWidth > 0);
  });
}

/** Hero first, then each chapter in DOM order; heavy journey warmup waits for document media. */
export function loadLandingMedia(root, { visible = el => getComputedStyle(el).display !== 'none' } = {}) {
  const hero = root.querySelector('.hero-backdrop');
  const heroReady = hero ? loadImage(hero) : Promise.resolve();
  let lastRun = heroReady;
  const refresh = () => (lastRun = lastRun.then(async () => {
    const main = root.querySelector('main');
    for (const section of main?.children ?? []) {
      if (!visible(section)) continue;
      await Promise.all([...section.querySelectorAll('img[data-src]')].map(loadImage));
    }
  }));
  const contentReady = refresh();
  return { heroReady, contentReady, refresh };
}

const coverOwners = new WeakMap();
/** Entry and return reuse the warm page under the same loading screen. */
export async function withPageCover(cover, action, { reduced = false,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  frame = () => new Promise(resolve => requestAnimationFrame(resolve)) } = {}) {
  if (!cover) return action();
  const owner = {}; coverOwners.set(cover, owner);
  cover.removeAttribute('data-done'); cover.setAttribute('data-leaving', '');
  try {
    await wait(reduced ? 0 : 340);
    await action();
    await frame(); await frame();
  } finally {
    if (coverOwners.get(cover) === owner) {
      cover.removeAttribute('data-leaving'); cover.setAttribute('data-done', '');
      coverOwners.delete(cover);
    }
  }
}
