"""Build ../site from ../original-site: the same website, lighter, with the journey playing itself.

Run:  python3 tools/build.py

original-site/ is the untouched copy of the live site and is never modified. Every change below
is a small, named edit; each one must match the original text exactly once or the build stops,
so nothing is ever changed by accident.
"""
import glob
import os
import platform
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "original-site")
OUT = os.path.join(ROOT, "site")
ESBUILD = os.environ.get("ESBUILD") or shutil.which("esbuild") or next(
    iter(sorted(glob.glob(os.path.expanduser("~/.npm/_npx/*/node_modules/.bin/esbuild")))), None)
# An esbuild installed next to this script (npm install --prefix tools esbuild) also works.
if not ESBUILD:
    candidate = os.path.join(HERE, "node_modules", "@esbuild", f"{sys.platform}_{'arm64' if platform.machine().endswith('64') and platform.machine() != 'x86_64' else 'x64'}", "esbuild.exe" if sys.platform == "win32" else "bin", "esbuild")
    alt = glob.glob(os.path.join(HERE, "node_modules", "@esbuild", "*", "esbuild*"))
    for c in [candidate] + alt:
        if os.path.isfile(c):
            ESBUILD = c
            break
if ESBUILD and not os.path.isabs(ESBUILD):
    ESBUILD = os.path.abspath(ESBUILD)

# --------------------------------------------------------------------------------------------
# 1. The journey (site/app.js is the journey's code, already compacted by its original build).
# --------------------------------------------------------------------------------------------
APP = [
    # Draw at most ~60 frames a second. On 120 Hz screens the scene was drawn twice as often as
    # anyone can see, for double the work.
    ("frame cap",
     'this._loop=()=>{this._raf=requestAnimationFrame(this._loop),this.frame()}',
     'this._loop=t=>{this._raf=requestAnimationFrame(this._loop),t-(this._tick??-1e9)<(this._minFrame??12)||(this._tick=t,this.frame())}'),
    # Sharpness ceiling 1.5x instead of 1.75x (about 27% fewer pixels to draw on a Retina
    # screen); autoplay.js lowers it further, step by step, only if a computer cannot keep up.
    ("resolution ceiling",
     'setPixelRatio(Math.min(window.devicePixelRatio||1,a?1.4:1.75))',
     'setPixelRatio(Math.min(window.devicePixelRatio||1,a?1.25:this._dprCap??1.5))'),
    # Do not stop the page to read the graphics driver's compile report for every shader.
    ("no blocking shader report",
     'a.localClippingEnabled=!0,a.setClearColor(ss,1)',
     'a.debug.checkShaderErrors=!1,a.localClippingEnabled=!0,a.setClearColor(ss,1)'),
    # Give autoplay.js a handle on the stage, the asset loader and the reset-to-start routine.
    ("handle for autoplay",
     'Yd({stage:j,assetsSettled:ws,resetToHero:hi});',
     'window.__fsJourney={stage:j,assetsSettled:ws,resetToHero:hi};Yd({stage:j,assetsSettled:ws,resetToHero:hi});'),
    # The panel loop stands still while autoplay.js prepares the scenes.
    ("panels wait during warm-up",
     'var Za=()=>{let e=document.scrollingElement||document.documentElement,t=',
     'var Za=()=>{if(window.__fsWarming)return void requestAnimationFrame(Za);let e=document.scrollingElement||document.documentElement,t='),
    # Information on one side only: the right (inline "end" in English, "start" in Arabic).
    ("panel side: always right",
     'qc=({sceneId:e,index:t})=>e==="bridge"||t%2===0?"start":"end"',
     'qc=()=>document.documentElement.dir==="rtl"?"start":"end"'),
    ("panel side: every chapter",
     'No=new Map(wo.map((e,t)=>[e.id,qc({sceneId:e.id,index:t})]))',
     'No={get:()=>qc()}'),
    ("panel side: testimonial boards",
     'a=wr({side:e.panelSide,rtl:document.documentElement.dir==="rtl"}),o=wr({side:e.fromSide,rtl:document.documentElement.dir==="rtl"})',
     'a=qc(),o=qc()'),
    ("panel side: entry from the home page slides in from the right",
     '($.getBoundingClientRect().width+24)*(document.documentElement.dir==="rtl"?1:-1)',
     '($.getBoundingClientRect().width+24)'),
    # Same side in and out: the next panel slides in over the current one (no crossing panels).
    ("panel change on the same side",
     'u=Oc({left:i,panelW:a}),l=Oc({left:r,panelW:a});return{out:',
     'u=Oc({left:i,panelW:a}),l=Oc({left:r,panelW:a});if(t===n)return{out:i,in:mr(gr({left:r,panelW:a,viewportW:o}),r,e),stage:0};return{out:'),
    ("incoming panel on top",
     'return d(s,H.out),d(i,H.in),H}',
     'return d(s,H.out),d(i,H.in),s.style.zIndex="0",i.style.zIndex="1",H}'),
    ("panel order reset when seated",
     'l="seated",u=null,g}',
     'l="seated",u=null,s.style.zIndex=i.style.zIndex="",g}'),
]

JOURNEY_HTML = [
    ("load autoplay after the journey",
     'import("/site/app.js")',
     'import("/site/app.js").then(()=>import("/site/autoplay.js"))'),
]
JOURNEY_HTML_EN = [
    ("English pages open with the panel on the right",
     '<body data-editorial-side="start"',
     '<body data-editorial-side="end"'),
]

# --------------------------------------------------------------------------------------------
# 2b. The website's footer no longer carries the developers' signatures.
# --------------------------------------------------------------------------------------------
# The credit line ("A Creation By <Dany x Mostafa>") sat in every footer. It is removed here,
# together with the comment above it, from every page and from the footer template inside
# site/app.js. The markup is identical everywhere apart from how far it is indented and the
# wording of the leading label ("A Creation By" / "من إبداع"), so the block is matched by
# pattern instead of by exact text, and the build reports how many were taken out.
FOOT_SIGN_HTML = re.compile(
    r"[ \t]*<!-- TWO CREDITS, ONE LINE\..*?-->\n"
    r"[ \t]*<p class=\"foot-sign\">.*?</p>\n?", re.S)
FOOT_SIGN_JS = re.compile(
    r"\n *<!-- TWO CREDITS, ONE LINE\..*?-->\n"
    r" *<p class=\"foot-sign\">\$\{F\(a\.createdBy\)\}.*?</p>", re.S)
# The label's two dictionary entries ("A Creation By" and its Arabic translation) go with it.
FOOT_SIGN_LABEL_JS = re.compile(
    r",createdBy:(?:\{en:\"A Creation By\",ar:\"[^\"]*\"\}|\"[^\"]*\")")

# --------------------------------------------------------------------------------------------
# 2. The website (home page and the pages under /home/).
# --------------------------------------------------------------------------------------------
PORTAL = [
    # The home page loaded the whole 3D journey in a hidden frame as soon as it opened. It now
    # loads when its section is actually on screen (or at once if its button is pressed); until
    # then the section shows its picture, as it always did while the scene was loading.
    ("journey loads near its section",
     """  const schedule = () => {
    if (!desktop.matches) return;
    if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 1500 }); else setTimeout(load, 300);
  };""",
     """  let near = false;
  const schedule = () => {
    if (!desktop.matches || !near) return;
    if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 1500 }); else setTimeout(load, 300);
  };
  new IntersectionObserver(([entry]) => { near = entry.isIntersecting; if (near) schedule(); }, { threshold: 0.3 }).observe(section);"""),
]
LOADING = [
    # Every picture on the home page was requested at once on arrival. Each chapter's pictures
    # are now requested as it comes within about a screen of view.
    ("pictures load as you approach them",
     """  let lastRun = heroReady;
  const refresh = () => (lastRun = lastRun.then(async () => {
    const main = root.querySelector('main');
    for (const section of main?.children ?? []) {
      if (!visible(section)) continue;
      await Promise.all([...section.querySelectorAll('img[data-src]')].map(loadImage));
    }
  }));""",
     """  const near = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      near.unobserve(entry.target);
      entry.target.querySelectorAll('img[data-src]').forEach(loadImage);
    }
  }, { rootMargin: '100% 0px' });
  const refresh = () => heroReady.then(() => {
    const main = root.querySelector('main');
    for (const section of main?.children ?? []) {
      if (!visible(section) || !section.querySelector('img[data-src]')) continue;
      if (near) { near.unobserve(section); near.observe(section); }
      else section.querySelectorAll('img[data-src]').forEach(loadImage);
    }
  });"""),
]
HOME_APP_TAIL = """
// Animations that never stop (the button shimmer, the client logo strip) rest while off screen.
if (hasDom && typeof IntersectionObserver !== 'undefined') {
  const resting = new IntersectionObserver(entries => entries.forEach(e => e.target.toggleAttribute('data-offscreen', !e.isIntersecting)));
  document.querySelectorAll('.shimmer, .client-track').forEach(el => resting.observe(el));
}
"""
REFINEMENT_TAIL = "\n[data-offscreen],[data-offscreen]::before,[data-offscreen]::after{animation-play-state:paused!important}\n"


def patch(path, edits):
    text = open(path, encoding="utf-8").read()
    for name, old, new in edits:
        n = text.count(old)
        if n != 1:
            sys.exit(f"build stopped: '{name}' matched {n} times in {os.path.relpath(path, OUT)}")
        text = text.replace(old, new)
    open(path, "w", encoding="utf-8").write(text)


def esbuild(code, loader, fmt=None):
    args = [ESBUILD, f"--loader={loader}", "--minify", "--log-level=error", "--charset=utf8"]
    if fmt:
        args.append(f"--format={fmt}")
    # "nice" keeps the build from interrupting other work on Unix; it does not exist on Windows.
    prefix = ["nice", "-n", "19"] if sys.platform != "win32" and shutil.which("nice") else []
    r = subprocess.run(prefix + args, input=code.encode(), capture_output=True)
    if r.returncode:
        raise RuntimeError(r.stderr.decode()[:400])
    return r.stdout.decode().strip()


KEEP = re.compile(r"(<script\b[^>]*>.*?</script>|<style\b[^>]*>.*?</style>|<textarea\b[^>]*>.*?</textarea>|<pre\b[^>]*>.*?</pre>)", re.S | re.I)


def minify_html(text):
    out = []
    for i, part in enumerate(KEEP.split(text)):
        if i % 2 == 0:  # ordinary markup: drop comments, indentation and blank lines
            part = re.sub(r"<!--(?!\[).*?-->", "", part, flags=re.S)
            part = re.sub(r"[ \t]*\n[ \t\n]*", "\n", part)
            out.append(part)
            continue
        m = re.match(r"(<(script|style)\b([^>]*)>)(.*)(</\2>)$", part, re.S | re.I)
        if not m or not m.group(4).strip():
            out.append(part)
            continue
        open_tag, kind, attrs, body, close = m.group(1), m.group(2).lower(), m.group(3), m.group(4), m.group(5)
        try:
            if kind == "style":
                body = esbuild(body, "css")
            elif "importmap" in attrs or "json" in attrs:
                pass
            elif re.search(r'type\s*=\s*["\']?module', attrs):
                body = esbuild(body, "js", "esm")
            elif not re.search(r'type\s*=', attrs) or re.search(r'type\s*=\s*["\']?(text|application)/javascript', attrs):
                body = esbuild(body, "js")
        except RuntimeError as e:
            print("  kept as is (could not compact):", str(e)[:120])
        out.append(open_tag + body + close)
    return "".join(out).strip() + "\n"


def main():
    if not ESBUILD:
        sys.exit("esbuild not found (set ESBUILD=/path/to/esbuild)")
    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    shutil.copytree(SRC, OUT)

    patch(os.path.join(OUT, "site/app.js"), APP)

    # The developers' signatures come out of every footer (pages and the app's own template).
    removed = 0
    for f in glob.glob(os.path.join(OUT, "**/*.html"), recursive=True):
        text = open(f, encoding="utf-8").read()
        text, n = FOOT_SIGN_HTML.subn("", text)
        if n:
            open(f, "w", encoding="utf-8").write(text)
        removed += n
    app = os.path.join(OUT, "site/app.js")
    text = open(app, encoding="utf-8").read()
    text, n = FOOT_SIGN_JS.subn("", text)
    if n:
        open(app, "w", encoding="utf-8").write(text)
    removed += n
    # The now-unused label ("A Creation By" and its Arabic translation) leaves the dictionaries.
    text = open(app, encoding="utf-8").read()
    text, n1 = FOOT_SIGN_LABEL_JS.subn("", text)
    if n1:
        open(app, "w", encoding="utf-8").write(text)
    print(f"signature blocks removed: {removed} (+{n1} unused label)")
    for f in glob.glob(os.path.join(OUT, "**/*.html"), recursive=True):
        text = open(f, encoding="utf-8").read()
        if 'import("/site/app.js")' in text:
            patch(f, JOURNEY_HTML + ([] if os.path.relpath(f, OUT).startswith("ar" + os.sep) else JOURNEY_HTML_EN))
    patch(os.path.join(OUT, "home-assets/journey.mjs"), PORTAL)
    patch(os.path.join(OUT, "home-assets/loading.mjs"), LOADING)
    with open(os.path.join(OUT, "home-assets/app.js"), "a", encoding="utf-8") as fh:
        fh.write(HOME_APP_TAIL)
    with open(os.path.join(OUT, "home-assets/refinement.css"), "a", encoding="utf-8") as fh:
        fh.write(REFINEMENT_TAIL)
    shutil.copy(os.path.join(HERE, "src/autoplay.js"), os.path.join(OUT, "site/autoplay.js"))

    # Compact the text files: the pages carried their authors' notes (comments) to every visitor.
    before = after = 0
    for f in sorted(glob.glob(os.path.join(OUT, "**/*"), recursive=True)):
        rel = os.path.relpath(f, OUT)
        if not os.path.isfile(f) or rel.startswith("vendor" + os.sep) or rel == os.path.join("site", "app.js"):
            continue
        ext = os.path.splitext(f)[1]
        if ext not in (".html", ".css", ".js", ".mjs"):
            continue
        text = open(f, encoding="utf-8").read()
        if ext == ".html":
            new = minify_html(text)
        elif ext == ".css":
            new = esbuild(text, "css") + "\n"
        else:
            new = esbuild(text, "js", "esm") + "\n"
        before += len(text.encode())
        after += len(new.encode())
        open(f, "w", encoding="utf-8").write(new)
    print(f"text files: {before / 1048576:.2f} MB -> {after / 1048576:.2f} MB")
    print("built", OUT)


if __name__ == "__main__":
    main()
