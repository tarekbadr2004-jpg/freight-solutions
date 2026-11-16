"""Local preview of ../site that behaves like Cloudflare Pages.

Run:  python3 tools/serve.py            (then open http://localhost:8788/)
      python3 tools/serve.py 9000       (another port)
      python3 tools/serve.py 8789 original-site   (serve the untouched copy, to compare)

It reproduces what the live host does, so the copy can be checked locally:
  * _redirects  — first matching rule wins, `*` / `:splat`, query string carried over
  * _headers    — rules applied in file order, repeated headers joined with ", "
  * clean URLs  — /x.html -> /x, /dir/index.html -> /dir/, /dir -> /dir/ (all 308)
  * 404.html    — served with status 404 and Cache-Control: no-store
  * the same Content-Type values the live site sends
"""
import os
import re
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8788
# Optional second argument: another folder to serve (for example original-site, to compare).
ROOT = os.path.abspath(sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "site"))

TYPES = {
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".js": "application/javascript", ".mjs": "application/javascript",
    ".json": "application/json", ".webmanifest": "application/manifest+json",
    ".xml": "application/xml", ".txt": "text/plain; charset=utf-8",
    ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".webp": "image/webp", ".avif": "image/avif", ".gif": "image/gif",
    ".ico": "image/vnd.microsoft.icon", ".woff2": "font/woff2", ".woff": "font/woff",
    ".ttf": "font/ttf", ".mp4": "video/mp4", ".webm": "video/webm", ".pdf": "application/pdf",
}
DEFAULTS = [
    ("access-control-allow-origin", "*"),
    ("cache-control", "public, max-age=0, must-revalidate"),
    ("referrer-policy", "strict-origin-when-cross-origin"),
    ("x-content-type-options", "nosniff"),
]
HIDDEN = {"/_redirects", "/_headers", "/_routes.json"}


def load_redirects():
    rules = []
    path = os.path.join(ROOT, "_redirects")
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            # Only whole-line comments: destinations such as /home/about/#credentials keep their '#'.
            parts = [] if line.lstrip().startswith("#") else line.split()
            if len(parts) >= 2:
                src, dst = parts[0], parts[1]
                code = int(parts[2]) if len(parts) > 2 else 302
                pattern = "^" + re.escape(src).replace(r"\*", "(?P<splat>.*)") + "$"
                rules.append((re.compile(pattern), dst, code))
    return rules


def load_headers():
    rules, current = [], None
    path = os.path.join(ROOT, "_headers")
    if os.path.exists(path):
        for raw in open(path, encoding="utf-8"):
            if not raw.strip() or raw.lstrip().startswith("#"):
                continue
            if not raw[0].isspace():
                pattern = "^" + re.escape(raw.strip()).replace(r"\*", ".*") + "$"
                current = (re.compile(pattern), [])
                rules.append(current)
            elif current and ":" in raw:
                name, value = raw.strip().split(":", 1)
                current[1].append((name.strip().lower(), value.strip()))
    return rules


REDIRECTS, HEADERS = load_redirects(), load_headers()


def file_for(path):
    full = os.path.normpath(os.path.join(ROOT, path.lstrip("/")))
    if not full.startswith(ROOT) or path in HIDDEN:
        return None
    return full if os.path.isfile(full) else None


def resolve(path):
    """Return ('file', fs_path) or ('redirect', location) or ('404', None)."""
    if path.endswith("/index.html") and file_for(path):
        return "redirect", path[: -len("index.html")]
    if path.endswith(".html") and file_for(path):
        return "redirect", path[: -len(".html")]
    if path.endswith("/"):
        f = file_for(path + "index.html")
        if f:
            return "file", f
        if path != "/" and file_for(path[:-1] + ".html"):
            return "redirect", path[:-1]
        return "404", None
    f = file_for(path + ".html")
    if f:
        return "file", f
    if file_for(path + "/index.html"):
        return "redirect", path + "/"
    f = file_for(path)
    if f:
        return "file", f
    return "404", None


class Handler(BaseHTTPRequestHandler):
    server_version = "pages-local"
    sys_version = ""

    def headers_for(self, path):
        out = list(DEFAULTS)
        for pattern, pairs in HEADERS:
            if pattern.match(path):
                for name, value in pairs:
                    for i, (n, v) in enumerate(out):
                        if n == name:
                            out[i] = (n, v + ", " + value)
                            break
                    else:
                        out.append((name, value))
        return out

    def send(self, status, path, body=b"", ctype=None, location=None, extra=None):
        self.send_response(status)
        if ctype:
            self.send_header("content-type", ctype)
        self.send_header("content-length", str(len(body)))
        if location:
            self.send_header("location", location)
        for n, v in self.headers_for(path):
            if status == 404 and n == "cache-control":
                v = "no-store"
            self.send_header(n, v)
        for n, v in (extra or []):
            self.send_header(n, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def handle_any(self):
        raw = urllib.parse.urlsplit(self.path)
        path, query = raw.path or "/", raw.query
        for pattern, dst, code in REDIRECTS:
            m = pattern.match(path)
            if m:
                loc = dst.replace(":splat", m.groupdict().get("splat") or "")
                if query and "?" not in loc:
                    base, _, frag = loc.partition("#")
                    loc = base + "?" + query + ("#" + frag if frag else "")
                return self.send(code, path, ("Redirecting to " + loc).encode(),
                                 "text/plain;charset=UTF-8", loc)
        decoded = urllib.parse.unquote(path)
        kind, value = resolve(decoded)
        if kind == "redirect":
            loc = urllib.parse.quote(value) + ("?" + query if query else "")
            return self.send(308, path, b"", None, loc)
        if kind == "file":
            ext = os.path.splitext(value)[1].lower()
            body = open(value, "rb").read()
            return self.send(200, path, body, TYPES.get(ext, "application/octet-stream"))
        body = open(os.path.join(ROOT, "404.html"), "rb").read()
        return self.send(404, path, body, TYPES[".html"])

    do_GET = do_HEAD = handle_any

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.command, fmt % args))


if __name__ == "__main__":
    print(f"Serving {ROOT} on http://localhost:{PORT}/")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
