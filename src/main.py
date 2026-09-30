from workers import WorkerEntrypoint, WorkflowEntrypoint, Response, fetch
from urllib.parse import urlparse, urljoin, urldefrag
import json, hashlib, hmac, secrets, time, re, io, zipfile, asyncio

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
        max_pages = max(1, min(int(payload.get("max_pages", 500)), 5000))

        @step.do("crawl-and-compile", config={"retries":{"limit":2,"delay":"10 seconds"}})
        async def crawl_and_compile():
            started = int(time.time())
            await self.env.DB.prepare("UPDATE projects SET status='running', error=NULL WHERE id=?").bind(project_id).run()
            await self.env.DB.prepare(
                "INSERT OR REPLACE INTO project_runs(project_id,phase,current_url,discovered,visited,useful,skipped,failed,queue_size,started_at,updated_at,cancel_requested) VALUES (?, 'discovering', ?, 1,0,0,0,0,1,?,?,0)"
            ).bind(project_id, start_url, started, started).run()

            queue = [start_url]
            queued = {start_url}
            seen = set()
            pages = []
            visited = skipped = failed = 0
            concurrency = 6

            async def fetch_one(url):
                try:
                    r = await fetch(url, {"headers":{"user-agent":"SkillForgeDocs/0.6"}})
                    if not r.ok:
                        return {"url":url,"error":True}
                    ctype = (r.headers.get("content-type") or "").lower()
                    if "html" not in ctype:
                        return {"url":url,"skip":True}
                    html = await r.text()
                    title, text, links = html_to_text_and_links(html, url)
                    words = len(text.split())
                    return {"url":url,"title":title,"text":text,"links":links,"words":words}
                except Exception:
                    return {"url":url,"error":True}

            try:
                while queue and len(pages) < max_pages:
                    run = await self.env.DB.prepare("SELECT cancel_requested FROM project_runs WHERE project_id=?").bind(project_id).first()
                    if run and run.cancel_requested:
                        await self.env.DB.prepare("UPDATE projects SET status='cancelled' WHERE id=?").bind(project_id).run()
                        await self.env.DB.prepare("UPDATE project_runs SET phase='cancelled', updated_at=? WHERE project_id=?").bind(int(time.time()), project_id).run()
                        return {"cancelled":True}

                    batch = []
                    while queue and len(batch) < concurrency and len(pages) + len(batch) < max_pages:
                        u = queue.pop(0)
                        queued.discard(u)
                        if u in seen or not same_host(u, start_url):
                            continue
                        seen.add(u)
                        batch.append(u)
                    if not batch:
                        continue

                    await self.env.DB.prepare(
                        "UPDATE project_runs SET phase='extracting', current_url=?, queue_size=?, updated_at=? WHERE project_id=?"
                    ).bind(batch[0], len(queue), int(time.time()), project_id).run()

                    results = await asyncio.gather(*[fetch_one(u) for u in batch])
                    for item in results:
                        visited += 1
                        if item.get("error"):
                            failed += 1
                            continue
                        if item.get("skip") or item.get("words",0) < 40:
                            skipped += 1
                        else:
                            pages.append({
                                "url":item["url"],"title":item["title"],"text":item["text"],
                                "words":item["words"],"kind":classify(item["title"],item["text"],item["url"])
                            })
                        for link in item.get("links",[]):
                            if link not in seen and link not in queued and same_host(link, start_url):
                                queue.append(link)
                                queued.add(link)

                    words_total = sum(x["words"] for x in pages)
                    await self.env.DB.prepare("UPDATE projects SET pages=?, words=? WHERE id=?").bind(
                        len(pages), words_total, project_id
                    ).run()
                    await self.env.DB.prepare(
                        "UPDATE project_runs SET discovered=?, visited=?, useful=?, skipped=?, failed=?, queue_size=?, current_url=?, updated_at=? WHERE project_id=?"
                    ).bind(
                        len(seen)+len(queue), visited, len(pages), skipped, failed, len(queue),
                        batch[-1], int(time.time()), project_id
                    ).run()

                if not pages:
                    raise Exception("Nenhuma página útil foi extraída.")

                await self.env.DB.prepare(
                    "UPDATE project_runs SET phase='compiling', current_url=NULL, updated_at=? WHERE project_id=?"
                ).bind(int(time.time()), project_id).run()
                blob = compile_zip(name, start_url, pages)
                key = f"projects/{project_id}/{slug(name)}.zip"

                await self.env.DB.prepare(
                    "UPDATE project_runs SET phase='uploading', updated_at=? WHERE project_id=?"
                ).bind(int(time.time()), project_id).run()
                await self.env.SKILLS.put(key, blob)

                await self.env.DB.prepare(
                    "UPDATE projects SET status='done', pages=?, words=?, object_key=?, error=NULL WHERE id=?"
                ).bind(len(pages), sum(x["words"] for x in pages), key, project_id).run()
                await self.env.DB.prepare(
                    "UPDATE project_runs SET phase='done', queue_size=0, current_url=NULL, updated_at=? WHERE project_id=?"
                ).bind(int(time.time()), project_id).run()
                return {"pages":len(pages),"key":key}
            except Exception as exc:
                await self.env.DB.prepare("UPDATE projects SET status='error', error=? WHERE id=?").bind(str(exc), project_id).run()
                await self.env.DB.prepare(
                    "UPDATE project_runs SET phase='error', updated_at=? WHERE project_id=?"
                ).bind(int(time.time()), project_id).run()
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
            max_pages = max(1, min(int(data.get("max_pages",500) or 500), 5000))
            parsed = urlparse(start_url)
            if not name or parsed.scheme not in ("http","https") or not parsed.netloc:
                return json_response({"error":"Nome e URL válidos são obrigatórios."}, 400)
            row = await self.env.DB.prepare(
                "INSERT INTO projects(user_id,name,start_url,max_pages,status) VALUES (?,?,?,?,'queued') RETURNING id,name,start_url,status,pages,words,max_pages"
            ).bind(user.id,name,start_url,max_pages).first()
            now = int(time.time())
            await self.env.DB.prepare(
                "INSERT OR REPLACE INTO project_runs(project_id,phase,current_url,discovered,queue_size,started_at,updated_at) VALUES (?, 'queued', ?, 1, 1, ?, ?)"
            ).bind(row.id, start_url, now, now).run()
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
            if len(parts) == 4 and parts[3] == "cancel" and request.method == "POST":
                if project.status in ("queued","running"):
                    await self.env.DB.prepare("UPDATE project_runs SET cancel_requested=1, updated_at=? WHERE project_id=?").bind(int(time.time()), project_id).run()
                    return json_response({"ok":True,"message":"Cancelamento solicitado."})
                return json_response({"ok":False,"message":"Projeto não está em execução."}, 409)

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
            run = await self.env.DB.prepare("SELECT * FROM project_runs WHERE project_id=?").bind(project_id).first()
            now = int(time.time())
            progress = None
            if run:
                elapsed = max(0, now - (run.started_at or now))
                rate = (run.useful * 60 / elapsed) if elapsed > 0 else 0
                remaining = max(0, project.max_pages - run.useful)
                eta = int((remaining / rate) * 60) if rate > 0 and project.status in ("queued","running") else None
                progress = {
                    "phase":run.phase,"current_url":run.current_url,"discovered":run.discovered,
                    "visited":run.visited,"useful":run.useful,"skipped":run.skipped,"failed":run.failed,
                    "queue_size":run.queue_size,"elapsed_seconds":elapsed,"pages_per_minute":round(rate,1),
                    "eta_seconds":eta,"max_pages":project.max_pages
                }
            return json_response({"project":{
                "id":project.id,"name":project.name,"start_url":project.start_url,"status":project.status,
                "pages":project.pages,"words":project.words,"error":project.error,"progress":progress
            }})

        return json_response({"error":"not found"}, 404)
