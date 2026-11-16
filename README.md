# Freight Solutions — copy of the live site, made lighter

The original: https://freight-solutions.pages.dev/ (copied 2026-11-10).

## Contents

| Path | What it is |
|---|---|
| `original-site/` | The whole site as it is on the server, byte for byte: 225 files, about 20 MB. Never edited. |
| `site/` | The lighter version that is served. Built from `original-site/` by `tools/build.py` — do not edit it by hand. |
| `tools/build.py` | Builds `site/`: a short list of named edits, each must match exactly once or the build stops. |
| `tools/src/autoplay.js` | Plays the 3D journey by itself (no scrolling), copied into `site/site/autoplay.js`. |
| `tools/serve.py` | A small server that runs a copy locally and behaves like Cloudflare Pages. |
| `tools/verify.py` | Compares every address between the live site and the local copy. |
| `tools/crawl.py` | The downloader that produced `original-site/`. |
| `*/_redirects`, `*/_headers` | Redirect rules and cache settings, worked out from the live site's behaviour. |

## What the build changes (design and animation unchanged)

1. **Journey plays by itself, without stopping.** Each information box sets the truck's speed while it is on
   show, so its text stays up 3–10 s by its length; between boxes the truck drives on briskly, and it starts
   slowing gently before the next box appears. Speed changes are spread over about two seconds. About 2.8 minutes
   in all. Back / pause / forward buttons sit beside "Back to the website" (from the first box after the
   opening); the mouse wheel, a swipe, the arrow keys and Page Up / Page Down step one box, the space bar
   pauses. Chapter links still work and it carries on from there. Phones keep normal scrolling. The pace is
   `PACE` at the top of `tools/src/autoplay.js` (`fast` / `slow` = speed range, `read` = seconds per box).
2. **Information on one side only**: the right (English and Arabic), sliding in place instead of switching sides.
3. **No freezes mid-journey.** While the opening scene shows (about 5 s), every 3D effect is prepared and every
   picture is sent to the graphics card once, instead of the first time it appears.
4. **Lighter drawing**: at most 60 frames a second, sharpness ceiling 1.5×, lowered step by step only on a
   computer that cannot keep up.
5. **Home page**: the 3D preview loads only when its section is on screen; pictures load as you approach
   them; never-ending animations rest while off screen.
6. **Smaller files**: comments and spacing removed from pages, styles and scripts (5.2 MB → 2.9 MB of text).
7. **No developers' signatures in the footer**: the "A Creation By" credit line with its two signature
   marks is taken out of every page and out of the app's footer template, leaving only the copyright line.

Measured on this Mac (Intel Iris Plus 655):

| | Before | After |
|---|---|---|
| Home page, first 10 s | 10.9 MB, 106 requests | 0.9 MB, 26 requests |
| Home page scrolling | 34 frames/s, worst pause 1.1 s | 58 frames/s, worst pause 0.12 s |
| Journey | 14 frames/s, worst freeze 3.4 s | 33 frames/s, worst pause 0.28 s |

## Running it locally

Needs only Python 3.8 or newer (no other installs): https://www.python.org/downloads/

1. Unzip, open a terminal in this folder (the one with `README.md`).
2. Start the local server:

   ```bash
   python3 tools/serve.py
   ```

   On Windows: `python tools\serve.py` (or `py tools\serve.py`).
3. Open http://localhost:8788/home/ in a browser (Chrome, Edge or Safari). The 3D journey is at
   http://localhost:8788/?experience=journey. Stop the server with Ctrl+C.

Another port: `python3 tools/serve.py 9000`. To compare with the untouched copy: `python3 tools/serve.py 8789 original-site`.

Testing switches on the journey address: `&autoplay=off` (scroll by hand as before), `&autoplay=2` (twice as fast),
`&autoplay=0.5` (half as fast).

### After changing the code: rebuild `site/`

`site/` is already built. Rebuild it only after editing `tools/build.py` or `tools/src/autoplay.js`. This needs
esbuild (install Node.js from https://nodejs.org, then `npm install -g esbuild`):

```bash
python3 tools/build.py
```

## Comparing the untouched copy with the live site

```bash
SSL_CERT_FILE=/etc/ssl/cert.pem python3 tools/verify.py tools/verify_urls.txt
```

(run it with `tools/serve.py 8788 original-site`). Last result: 413 addresses, 409 identical; the 4 differences
are only the hidden text inside an internal redirect step (`/services`, `/projects` and their Arabic versions).

## Publishing

Not published (local only). If wanted later: upload `site/` as is to Cloudflare Pages.
