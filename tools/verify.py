import sys, json, hashlib, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
ORIG, LOCAL = "https://freight-solutions.pages.dev", "http://localhost:8788"
KEYS = ['content-type', 'location', 'cache-control', 'x-frame-options', 'access-control-allow-origin', 'referrer-policy', 'x-content-type-options']
class NR(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
op = urllib.request.build_opener(NR)
def get(base, p):
    try: r = op.open(urllib.request.Request(base + p, headers={'User-Agent': 'Mozilla/5.0'}), timeout=60); s, h, b = r.status, r.headers, r.read()
    except urllib.error.HTTPError as e: s, h, b = e.code, e.headers, e.read()
    loc = h.get('location')
    if loc and loc.startswith(base): loc = loc[len(base):]
    d = {k: (h.get(k) if k != 'location' else loc) for k in KEYS}
    d['status'] = s; d['sha'] = hashlib.sha256(b).hexdigest()[:16]; d['len'] = len(b)
    return d
def cmp(p):
    a, b = get(ORIG, p), get(LOCAL, p)
    diff = {k: (a[k], b[k]) for k in a if a[k] != b[k]}
    return p, a['status'], diff
paths = [l.strip() for l in open(sys.argv[1]) if l.strip()]
bad = 0
with ThreadPoolExecutor(4) as ex:
    for p, s, diff in ex.map(cmp, paths):
        if diff: bad += 1; print('DIFF', s, p, json.dumps(diff, ensure_ascii=False))
print(f'checked {len(paths)} urls, {bad} differ')
