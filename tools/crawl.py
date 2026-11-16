# Mirror a static Cloudflare Pages site byte-for-byte, following refs in HTML/CSS/JS/JSON/SVG.
import os, re, sys, json, threading, queue, urllib.request, urllib.error, urllib.parse, html, time
from concurrent.futures import ThreadPoolExecutor

BASE = "https://freight-solutions.pages.dev"
OUT = sys.argv[1]
STATE = sys.argv[2]
SEEDS = sys.argv[3:]

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
opener = urllib.request.build_opener(NoRedirect)
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"

lock = threading.Lock()
seen = set(); results = {}; refs_from = {}; external = {}; dynamic = []
EXT = r'(?:html?|css|m?js|json|webmanifest|svg|png|jpe?g|webp|avif|gif|ico|woff2?|ttf|otf|eot|mp4|webm|mov|mp3|ogg|wav|m4a|glb|gltf|bin|ktx2|basis|wasm|hdr|exr|txt|xml|pdf|vtt|csv|map|frag|vert|glsl)'
PATHLIKE = re.compile(r'^(?:/|\./|\.\./)[^\s<>"\'`{}|\\^]*$|^[\w\-./]+\.' + EXT + r'(?:[?#][^\s"\'`]*)?$', re.I)

def norm(u, base):
    u = html.unescape(u.strip())
    if not u or u.startswith(('data:', 'blob:', 'mailto:', 'tel:', 'javascript:', '#', 'about:', 'sms:', 'whatsapp:')): return None
    full = urllib.parse.urljoin(base, u)
    p = urllib.parse.urlsplit(full)
    if p.scheme not in ('http', 'https'): return None
    if p.netloc != urllib.parse.urlsplit(BASE).netloc:
        with lock: external.setdefault(p.scheme + '://' + p.netloc + p.path, set()).add(base)
        return None
    path = p.path or '/'
    path = re.sub(r'/+', '/', path)
    return path

def add(path, src):
    if path is None: return
    with lock:
        refs_from.setdefault(path, set()).add(src)
        if path in seen: return
        seen.add(path)
    pool_submit(path)

def css_refs(text, base, src):
    for m in re.finditer(r'url\(\s*([\'"]?)([^\'")]+)\1\s*\)', text): add(norm(m.group(2), base), src)
    for m in re.finditer(r'@import\s+([\'"])([^\'"]+)\1', text): add(norm(m.group(2), base), src)

def js_refs(text, base, src, page_base=None):
    # string literals
    for m in re.finditer(r'"((?:[^"\\\n]|\\.){1,400})"|\'((?:[^\'\\\n]|\\.){1,400})\'|`([^`$\\]{1,400})`', text):
        s = m.group(1) or m.group(2) or m.group(3) or ''
        s = s.replace('\\/', '/')
        if not PATHLIKE.match(s): continue
        if s.startswith('//'): continue
        add(norm(s, base), src)
        if page_base and not s.startswith('/'): add(norm(s, page_base), src)
    # alignment-independent pass: quoted things that look like files or root routes
    for m in re.finditer(r'["\'`]((?:\.{1,2}/|/)?[\w\-.~%@/]+\.' + EXT + r')(?:[?#][^"\'`\s]*)?["\'`]', text, re.I):
        s = m.group(1)
        if s.startswith('//'): continue
        for b in (base, page_base, BASE + '/assets/', BASE + '/home-assets/'):
            if b: add(norm(s, b), src)
    for m in re.finditer(r'["\'`](/[\w\-.~%@/]*)["\'`]', text):
        s = m.group(1)
        if not s.startswith('//') and len(s) < 200: add(norm(s, BASE + '/'), src)
    # new URL("rel", <expr> + "/abs/module.mjs") : resolve rel against the module path named in the call
    for m in re.finditer(r'new URL\(\s*["\'`]([^"\'`$]+)["\'`]\s*,[^;]{0,200}?["\'](/[^"\']+)["\']', text):
        add(norm(m.group(1), BASE + m.group(2)), src)
    for m in re.finditer(r'`([^`]*\$\{[^`]*)`', text):
        t = m.group(1)
        if re.search(r'/|\.' + EXT + r'\b', t) and len(t) < 300:
            with lock: dynamic.append((src, t))

def json_walk(o, base, src):
    if isinstance(o, dict):
        for v in o.values(): json_walk(v, base, src)
    elif isinstance(o, list):
        for v in o: json_walk(v, base, src)
    elif isinstance(o, str) and PATHLIKE.match(o) and not o.startswith('//'): add(norm(o, base), src)

def html_refs(text, base, src):
    for m in re.finditer(r'\s(?:href|src|poster|action|data|content|xlink:href|data-[\w-]+|imagesrcset|srcset|background)\s*=\s*("([^"]*)"|\'([^\']*)\')', text, re.I):
        v = m.group(2) if m.group(2) is not None else m.group(3)
        attr = m.group(0).split('=')[0].strip().lower()
        if 'srcset' in attr:
            for part in v.split(','):
                part = part.strip().split(' ')[0]
                if part: add(norm(part, base), src)
            continue
        if attr in ('content',) or attr.startswith('data-'):
            if not (v.startswith(('/', './', '../', 'http')) or re.search(r'\.' + EXT + r'$', v, re.I)): continue
        add(norm(v, base), src)
    for m in re.finditer(r'style\s*=\s*"([^"]*)"', text): css_refs(html.unescape(m.group(1)), base, src)
    for m in re.finditer(r'<style[^>]*>(.*?)</style>', text, re.S | re.I): css_refs(m.group(1), base, src)
    for m in re.finditer(r'<script([^>]*)>(.*?)</script>', text, re.S | re.I):
        attrs, body = m.group(1), m.group(2)
        if 'importmap' in attrs or 'ld+json' in attrs:
            try: json_walk(json.loads(body), base, src)
            except Exception: pass
        else: js_refs(body, base, src)

def save_path(path, status, ctype):
    p = urllib.parse.unquote(path)
    if p.endswith('/'): return p + 'index.html'
    if 'text/html' in (ctype or '') and not re.search(r'\.html?$', p): return p + '.html'
    return p

def fetch(path):
    url = BASE + urllib.parse.quote(path, safe="/%:@!$&'()*+,;=-._~")
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*'})
            with opener.open(req, timeout=60) as r:
                return r.status, dict(r.headers), r.read()
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers), e.read()
        except Exception as e:
            err = str(e); time.sleep(2)
    return -1, {'error': err}, b''

def work(path):
    status, hdr, body = fetch(path)
    h = {k.lower(): v for k, v in hdr.items()}
    ctype = h.get('content-type', '')
    rec = {'status': status, 'ctype': ctype, 'size': len(body), 'location': h.get('location'), 'etag': h.get('etag')}
    if status in (301, 302, 303, 307, 308) and h.get('location'):
        add(norm(h['location'], BASE + path), path)
    if status == 200:
        sp = save_path(path, status, ctype)
        rec['file'] = sp
        fp = os.path.join(OUT, sp.lstrip('/'))
        os.makedirs(os.path.dirname(fp), exist_ok=True)
        with open(fp, 'wb') as f: f.write(body)
        base = BASE + path
        low = path.lower()
        try: text = body.decode('utf-8')
        except Exception: text = None
        if text is not None:
            if 'html' in ctype: html_refs(text, base, path)
            elif 'css' in ctype or low.endswith('.css'): css_refs(text, base, path)
            elif 'javascript' in ctype or low.endswith(('.js', '.mjs')): js_refs(text, base, path, BASE + '/')
            elif 'json' in ctype or low.endswith(('.json', '.webmanifest', '.gltf')):
                try: json_walk(json.loads(text), base, path)
                except Exception: pass
            elif 'svg' in ctype or low.endswith('.svg'): html_refs(text, base, path); css_refs(text, base, path)
    with lock: results[path] = rec
    print(status, path, len(body), flush=True)

pending = []
pend_lock = threading.Lock()
ex = ThreadPoolExecutor(max_workers=4)
def pool_submit(path):
    with pend_lock: pending.append(ex.submit(work, path))

for s in SEEDS: add(s, 'seed')
while True:
    with pend_lock:
        live = [f for f in pending if not f.done()]
    if not live:
        time.sleep(1)
        with pend_lock:
            if all(f.done() for f in pending): break
        continue
    time.sleep(0.5)
for f in pending:
    if f.exception(): print('EXC', f.exception())
ex.shutdown()
json.dump({'results': results, 'refs_from': {k: sorted(v) for k, v in refs_from.items()},
           'external': {k: sorted(v) for k, v in external.items()}, 'dynamic': dynamic},
          open(STATE, 'w'), indent=1, ensure_ascii=False)
print('DONE', len(results))
