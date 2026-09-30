from __future__ import annotations
import asyncio, re
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse, urldefrag
import httpx, trafilatura
from bs4 import BeautifulSoup

SKIP = re.compile(r"\.(png|jpe?g|gif|svg|webp|ico|pdf|zip|gz|tar|7z|mp4|mp3|mov|woff2?|ttf|eot)(\?|$)", re.I)

@dataclass
class Page:
    url: str
    title: str
    markdown: str
    links: list[str]
    words: int
    kind: str

def normalize(raw: str, base: str) -> str | None:
    try:
        url = urldefrag(urljoin(base, raw))[0]
        p = urlparse(url)
        if p.scheme not in {"http","https"} or SKIP.search(p.path): return None
        return url
    except Exception:
        return None

def classify(title: str, text: str, url: str) -> str:
    s = f"{title} {url} {text[:5000]}".lower()
    tests = [
        ("troubleshooting", r"troubleshoot|error|issue|problem|resolve"),
        ("api-reference", r"api reference|endpoint|request body|response body|parameters"),
        ("how-to", r"how to|tutorial|quickstart|getting started|step 1|configure|install|deploy"),
        ("architecture", r"architecture|design pattern|best practice|topology"),
        ("concept", r"overview|introduction|fundamentals|what is"),
        ("release-notes", r"release notes|changelog|what.?s new|deprecated"),
    ]
    for kind, pattern in tests:
        if re.search(pattern, s): return kind
    return "reference"

def parse_html(html: str, url: str) -> Page:
    soup = BeautifulSoup(html, "lxml")
    h1 = soup.find("h1")
    title = h1.get_text(" ", strip=True) if h1 else ((soup.title.string or "").strip() if soup.title else url)
    links = []
    for a in soup.find_all("a", href=True):
        n = normalize(a["href"], url)
        if n: links.append(n)
    md = trafilatura.extract(html, include_links=True, include_tables=True, include_formatting=True,
                             output_format="markdown", url=url, favor_recall=True) or ""
    return Page(url=url, title=title[:180], markdown=md.strip(), links=list(dict.fromkeys(links)),
                words=len(md.split()), kind=classify(title, md, url))

async def rendered_html(url: str) -> str:
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto(url, wait_until="networkidle", timeout=30000)
        html = await page.content()
        await browser.close()
        return html

async def fetch_page(client: httpx.AsyncClient, url: str) -> Page:
    r = await client.get(url, follow_redirects=True, timeout=25)
    r.raise_for_status()
    if "html" not in r.headers.get("content-type","").lower(): raise ValueError("non-html")
    page = parse_html(r.text, str(r.url))
    if page.words >= 40: return page
    try:
        return parse_html(await rendered_html(url), url)
    except Exception:
        return page

def in_scope(url: str, start_url: str, scope: str) -> bool:
    a, b = urlparse(url), urlparse(start_url)
    if a.netloc != b.netloc: return False
    if scope == "host": return True
    root = b.path if b.path.endswith("/") else b.path.rsplit("/",1)[0] + "/"
    return a.path.startswith(root)

async def discover_sitemap(client: httpx.AsyncClient, start_url: str) -> list[str]:
    p = urlparse(start_url)
    candidates = [f"{p.scheme}://{p.netloc}/sitemap.xml", f"{p.scheme}://{p.netloc}/sitemap_index.xml"]
    found = []
    for sm in candidates:
        try:
            r = await client.get(sm, timeout=10)
            if r.status_code != 200: continue
            soup = BeautifulSoup(r.text, "xml")
            locs = [x.get_text(strip=True) for x in soup.find_all("loc")]
            for loc in locs[:5000]:
                if loc.endswith(".xml"):
                    try:
                        rr = await client.get(loc, timeout=10)
                        found.extend(x.get_text(strip=True) for x in BeautifulSoup(rr.text, "xml").find_all("loc"))
                    except Exception: pass
                else: found.append(loc)
        except Exception: pass
    return list(dict.fromkeys(found))

async def crawl(start_url: str, max_pages: int = 100, scope: str = "host", progress=None) -> list[Page]:
    unlimited = max_pages == 0
    seen, queue, pages = set(), [start_url], []
    headers = {"User-Agent":"SkillForgeDocs/0.4 (+knowledge extraction; respectful crawler)"}
    async with httpx.AsyncClient(headers=headers) as client:
        for url in await discover_sitemap(client, start_url):
            if in_scope(url, start_url, scope): queue.append(url)
        while queue and (unlimited or len(pages) < max_pages):
            url = normalize(queue.pop(0), start_url)
            if not url or url in seen or not in_scope(url, start_url, scope): continue
            seen.add(url)
            try:
                page = await fetch_page(client, url)
                if page.words >= 40:
                    pages.append(page)
                    if progress: progress(len(pages), url)
                    for link in page.links:
                        if link not in seen and in_scope(link, start_url, scope): queue.append(link)
            except Exception:
                continue
            await asyncio.sleep(0.05)
    return pages
