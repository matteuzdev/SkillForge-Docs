from http.server import BaseHTTPRequestHandler
from urllib.request import Request, urlopen
from urllib.parse import urljoin, urlparse, urldefrag
from html.parser import HTMLParser
import json, re

class Extractor(HTMLParser):
    def __init__(self, base):
        super().__init__(convert_charrefs=True)
        self.base = base
        self.links = []
        self.parts = []
        self.title = ""
        self.in_title = False
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script","style","noscript"):
            self.skip += 1
        if tag == "title":
            self.in_title = True
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                try:
                    u = urldefrag(urljoin(self.base, href))[0]
                    p = urlparse(u)
                    if p.scheme in ("http","https"):
                        self.links.append(u)
                except Exception:
                    pass
        if tag in ("p","div","li","h1","h2","h3","h4","br","pre","code"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script","style","noscript") and self.skip:
            self.skip -= 1
        if tag == "title":
            self.in_title = False
        if tag in ("p","div","li","h1","h2","h3","h4","pre"):
            self.parts.append("\n")

    def handle_data(self, data):
        if self.skip:
            return
        text = data.strip()
        if not text:
            return
        if self.in_title:
            self.title += (" " if self.title else "") + text
        self.parts.append(text + " ")

def clean_text(parts):
    text = "".join(parts)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text)
    return text.strip()

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get("content-length","0"))
            data = json.loads(self.rfile.read(length) or b"{}")
            url = str(data.get("url","")).strip()
            parsed = urlparse(url)
            if parsed.scheme not in ("http","https") or not parsed.netloc:
                self.send_json({"error":"URL inválida"}, 400); return

            req = Request(url, headers={
                "User-Agent":"Mozilla/5.0 (compatible; SkillForgeDocs/1.0; +https://vercel.app)",
                "Accept":"text/html,application/xhtml+xml"
            })
            with urlopen(req, timeout=20) as r:
                ctype = r.headers.get("content-type","").lower()
                if "html" not in ctype:
                    self.send_json({"error":"Conteúdo não HTML"}, 415); return
                raw = r.read(3_000_000)
                html = raw.decode("utf-8","ignore")
                final_url = r.geturl()

            ex = Extractor(final_url)
            ex.feed(html)
            text = clean_text(ex.parts)
            title = ex.title.strip() or final_url
            host = urlparse(final_url).netloc
            links = []
            seen = set()
            for u in ex.links:
                if urlparse(u).netloc == host and u not in seen:
                    seen.add(u); links.append(u)

            self.send_json({
                "url": final_url,
                "title": title[:180],
                "text": text,
                "words": len(text.split()),
                "links": links[:500]
            })
        except Exception as e:
            self.send_json({"error":str(e)[:300]}, 500)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin","*")
        self.send_header("Access-Control-Allow-Headers","content-type")
        self.send_header("Access-Control-Allow-Methods","POST,OPTIONS")
        self.end_headers()

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("content-type","application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin","*")
        self.send_header("content-length",str(len(body)))
        self.end_headers()
        self.wfile.write(body)
