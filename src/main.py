from workers import WorkerEntrypoint, WorkflowEntrypoint, Response, fetch
from urllib.parse import urlparse, urljoin, urldefrag
import json, hashlib, hmac, secrets, time, re, io, zipfile

SESSION_SECONDS = 60 * 60 * 24 * 30

def json_response(data, status=200, headers=None):
    base = {"content-type": "application/json; charset=utf-8"}
    if headers:
        base.update(headers)
    return Response(json.dumps(data), status=status, headers=base)

def parse_cookie(request):
    raw = request.headers.get("cookie") or ""
    out = {}
    for part in raw.split(";"):
        if "=" in part:
            k, v = part.strip().split("=", 1)
            out[k] = v
    return out

def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 210000)
    return f"{salt}:{digest.hex()}"

def verify_password(password, stored):
    try:
        salt, expected = stored.split(":", 1)
        got = hash_password(password, salt).split(":", 1)[1]
        return hmac.compare_digest(got, expected)
    except Exception:
        return False

async def body_json(request):
    try:
        return json.loads((await request.text()) or "{}")
    except Exception:
        return {}

def normalize_url(raw, base):
    try:
        url = urldefrag(urljoin(base, raw))[0]
        p = urlparse(url)
        if p.scheme not in ("http","https"):
            return None
        if re.search(r"\.(png|jpe?g|gif|svg|webp|ico|pdf|zip|gz|tar|7z|mp4|mp3|mov|woff2?|ttf|eot)(\?|$)", p.path, re.I):
            return None
        return url
    except Exception:
        return None

def html_to_text_and_links(html, base):
    title_m = re.search(r"<title[^>]*>(.*?)</title>", html, re.I|re.S)
    title = re.sub(r"<[^>]+>", " ", title_m.group(1)).strip() if title_m else base
    cleaned = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>|<noscript[\s\S]*?</noscript>", " ", html, flags=re.I)
    cleaned = re.sub(r"<br\s*/?>|</p>|</div>|</li>|</h[1-6]>", "\n", cleaned, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", cleaned)
    text = re.sub(r"&nbsp;", " ", text, flags=re.I)
    text = re.sub(r"&amp;", "&", text, flags=re.I)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    links = []
    for href in re.findall(r'href=["\']([^"\']+)["\']', html, re.I):
        n = normalize_url(href, base)
        if n:
            links.append(n)
    return title[:180], text, list(dict.fromkeys(links))

def classify(title, text, url):
    s = f"{title} {url} {text[:4000]}".lower()
    tests = [
        ("troubleshooting", r"troubleshoot|error|issue|problem|resolve"),
        ("api-reference", r"api reference|endpoint|request body|response body|parameters"),
        ("how-to", r"how to|tutorial|quickstart|getting started|configure|install|deploy"),
        ("architecture", r"architecture|design pattern|best practice|topology"),
        ("concept", r"overview|introduction|fundamentals|what is"),
        ("release-notes", r"release notes|changelog|what.?s new|deprecated"),
    ]
    for kind, pat in tests:
        if re.search(pat, s):
            return kind
    return "reference"

def same_host(url, root):
    return urlparse(url).netloc == urlparse(root).netloc

def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:80] or "skill"

def compile_zip(name, start_url, pages):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        skill = f"""---
name: {slug(name)}
description: Knowledge skill generated from {start_url}
---
# {name}

## Purpose
Use this captured knowledge to answer, plan, troubleshoot and implement tasks grounded in the original sources.

## Operating rules
1. Start with knowledge/index.md.
2. Read relevant captured pages before implementation guidance.
3. Prefer documented procedures, constraints, warnings, examples and commands.
4. Separate source facts from inference.
5. Verify live sources for changing facts.
6. Preserve source URLs when traceability matters.

## Workflow
Understand → Retrieve → Decide → Execute → Verify
"""
        z.writestr("SKILL.md", skill)
        index = ["# Knowledge Index", ""]
        sources = []
        for i, p in enumerate(pages, 1):
            fname = f"{i:04d}-{slug(p['title'])}.md"
            index.append(f"- [{p['title']}](pages/{fname}) — {p['url']}")
            z.writestr(f"knowledge/pages/{fname}", f"# {p['title']}\n\n- Source: {p['url']}\n- Type: {p['kind']}\n\n{p['text']}\n")
            sources.append({"title":p["title"],"url":p["url"],"type":p["kind"],"words":p["words"]})
        z.writestr("knowledge/index.md", "\n".join(index))
        z.writestr("sources/sources.json", json.dumps(sources, ensure_ascii=False, indent=2))
        z.writestr("metadata.json", json.dumps({
            "generator":"SkillForge Docs 0.5","name":name,"start_url":start_url,
            "pages":len(pages),"words":sum(p["words"] for p in pages)
        }, ensure_ascii=False, indent=2))
    return buf.getvalue()

class CrawlWorkflow(WorkflowEntrypoint):
    async def run(self, event, step):
        payload = event["payload"]
        project_id = int(payload["project_id"])
        start_url = payload["start_url"]
        name = payload["name"]
        max_pages = max(1, min(int(payload.get("max_pages", 50)), 250))

        @step.do("crawl-and-compile", config={"retries":{"limit":2,"delay":"10 seconds"}})
        async def crawl_and_compile():
            await self.env.DB.prepare("UPDATE projects SET status='running', error=NULL WHERE id=?").bind(project_id).run()
            queue = [start_url]
            seen = set()
            pages = []
            try:
                while queue and len(pages) < max_pages:
                    url = queue.pop(0)
                    if url in seen or not same_host(url, start_url):
                        continue
                    seen.add(url)
                    try:
                        r = await fetch(url, {"headers":{"user-agent":"SkillForgeDocs/0.5"}})
                        if not r.ok:
                            continue
                        ctype = r.headers.get("content-type") or ""
                        if "html" not in ctype.lower():
                            continue
                        html = await r.text()
                        title, text, links = html_to_text_and_links(html, url)
                        words = len(text.split())
                        if words >= 40:
                            pages.append({"url":url,"title":title,"text":text,"words":words,"kind":classify(title,text,url)})
                            await self.env.DB.prepare("UPDATE projects SET pages=?, words=? WHERE id=?").bind(
                                len(pages), sum(x["words"] for x in pages), project_id
                            ).run()
                        for link in links:
                            if link not in seen and same_host(link, start_url):
                                queue.append(link)
                    except Exception:
                        continue
                if not pages:
                    raise Exception("Nenhuma página útil foi extraída.")
                blob = compile_zip(name, start_url, pages)
                key = f"projects/{project_id}/{slug(name)}.zip"
                await self.env.SKILLS.put(key, blob)
                await self.env.DB.prepare(
                    "UPDATE projects SET status='done', pages=?, words=?, object_key=?, error=NULL WHERE id=?"
                ).bind(len(pages), sum(x["words"] for x in pages), key, project_id).run()
                return {"pages":len(pages),"key":key}
            except Exception as exc:
                await self.env.DB.prepare("UPDATE projects SET status='error', error=? WHERE id=?").bind(str(exc), project_id).run()
                raise
        return await crawl_and_compile()

class Default(WorkerEntrypoint):
    async def current_user(self, request):
        token = parse_cookie(request).get("sf_session")
        if not token:
            return None
        return await self.env.DB.prepare(
            "SELECT u.id,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>?"
        ).bind(token, int(time.time())).first()

    async def fetch(self, request):
        url = urlparse(request.url)
        path = url.path
        if not path.startswith("/api/"):
            return await self.env.ASSETS.fetch(request)

        if path == "/api/health":
            return json_response({"ok":True,"service":"skillforge-docs","runtime":"cloudflare-python"})

        if path == "/api/signup" and request.method == "POST":
            data = await body_json(request)
            email = str(data.get("email","")).strip().lower()
            password = str(data.get("password",""))
            if "@" not in email or len(password) < 6:
                return json_response({"error":"Dados inválidos."}, 400)
            try:
                result = await self.env.DB.prepare(
                    "INSERT INTO users(email,password_hash) VALUES (?,?) RETURNING id,email"
                ).bind(email, hash_password(password)).first()
            except Exception:
                return json_response({"error":"E-mail já cadastrado."}, 409)
            token = secrets.token_urlsafe(32)
            expires = int(time.time()) + SESSION_SECONDS
            await self.env.DB.prepare("INSERT INTO sessions(token,user_id,expires_at) VALUES (?,?,?)").bind(token,result.id,expires).run()
            return json_response({"user":{"id":result.id,"email":result.email}}, headers={
                "set-cookie":f"sf_session={token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age={SESSION_SECONDS}"
            })

        if path == "/api/login" and request.method == "POST":
            data = await body_json(request)
            email = str(data.get("email","")).strip().lower()
            password = str(data.get("password",""))
            user = await self.env.DB.prepare("SELECT id,email,password_hash FROM users WHERE email=?").bind(email).first()
            if not user or not verify_password(password, user.password_hash):
                return json_response({"error":"Credenciais inválidas."}, 401)
            token = secrets.token_urlsafe(32)
            expires = int(time.time()) + SESSION_SECONDS
            await self.env.DB.prepare("INSERT INTO sessions(token,user_id,expires_at) VALUES (?,?,?)").bind(token,user.id,expires).run()
            return json_response({"user":{"id":user.id,"email":user.email}}, headers={
                "set-cookie":f"sf_session={token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age={SESSION_SECONDS}"
            })

        if path == "/api/logout" and request.method == "POST":
            token = parse_cookie(request).get("sf_session")
            if token:
                await self.env.DB.prepare("DELETE FROM sessions WHERE token=?").bind(token).run()
            return json_response({"ok":True}, headers={"set-cookie":"sf_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"})

        user = await self.current_user(request)
        if not user:
            return json_response({"error":"unauthorized"}, 401)

        if path == "/api/me":
            return json_response({"user":{"id":user.id,"email":user.email}})

        if path == "/api/projects" and request.method == "GET":
            rows = await self.env.DB.prepare(
                "SELECT id,name,start_url,status,pages,words,created_at FROM projects WHERE user_id=? ORDER BY id DESC"
            ).bind(user.id).all()
            return json_response({"projects":rows.results})

        if path == "/api/projects" and request.method == "POST":
            data = await body_json(request)
            name = str(data.get("name","")).strip()
            start_url = str(data.get("start_url","")).strip()
            max_pages = max(1, min(int(data.get("max_pages",50) or 50), 250))
            parsed = urlparse(start_url)
            if not name or parsed.scheme not in ("http","https") or not parsed.netloc:
                return json_response({"error":"Nome e URL válidos são obrigatórios."}, 400)
            row = await self.env.DB.prepare(
                "INSERT INTO projects(user_id,name,start_url,max_pages,status) VALUES (?,?,?,?,'queued') RETURNING id,name,start_url,status,pages,words,max_pages"
            ).bind(user.id,name,start_url,max_pages).first()
            await self.env.CRAWL_WORKFLOW.create(params={"project_id":row.id,"name":name,"start_url":start_url,"max_pages":max_pages})
            return json_response({"project":{"id":row.id,"name":row.name,"start_url":row.start_url,"status":row.status,"pages":row.pages,"words":row.words}}, 201)

        if path.startswith("/api/projects/"):
            parts = path.strip("/").split("/")
            try:
                project_id = int(parts[2])
            except Exception:
                return json_response({"error":"Projeto inválido."}, 400)
            project = await self.env.DB.prepare("SELECT * FROM projects WHERE id=? AND user_id=?").bind(project_id,user.id).first()
            if not project:
                return json_response({"error":"Projeto não encontrado."}, 404)
            if len(parts) == 4 and parts[3] == "download":
                if project.status != "done" or not project.object_key:
                    return json_response({"error":"Skill ainda não está pronta."}, 409)
                obj = await self.env.SKILLS.get(project.object_key)
                if not obj:
                    return json_response({"error":"Arquivo não encontrado."}, 404)
                return Response(obj.body, headers={
                    "content-type":"application/zip",
                    "content-disposition":f'attachment; filename="{slug(project.name)}.zip"'
                })
            return json_response({"project":{
                "id":project.id,"name":project.name,"start_url":project.start_url,"status":project.status,
                "pages":project.pages,"words":project.words,"error":project.error
            }})

        return json_response({"error":"not found"}, 404)
