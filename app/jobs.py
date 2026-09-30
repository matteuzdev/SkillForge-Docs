import asyncio
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from .crawler import crawl
from .db import db
from .skill_compiler import compile_skill
POOL = ThreadPoolExecutor(max_workers=2)
def _set(project_id: int, **fields):
    if not fields: return
    parts = ", ".join(f"{k}=?" for k in fields)
    values = list(fields.values()) + [project_id]
    with db() as conn:
        conn.execute(f"UPDATE projects SET {parts}, updated_at=CURRENT_TIMESTAMP WHERE id=?", values)
def run_project(project_id: int):
    with db() as conn:
        project = conn.execute("SELECT * FROM projects WHERE id=?", (project_id,)).fetchone()
    if not project: return
    _set(project_id, status="running", error=None)
    def progress(count: int, _url: str):
        _set(project_id, pages=count)
    try:
        pages = asyncio.run(crawl(project["start_url"], project["max_pages"], project["scope"], progress))
        if not pages: raise RuntimeError("Nenhuma página útil foi extraída.")
        zip_path = compile_skill(project["name"], project["start_url"], pages, Path("data/exports"))
        _set(project_id, status="done", pages=len(pages), words=sum(p.words for p in pages), zip_path=str(zip_path))
    except Exception as exc:
        _set(project_id, status="error", error=str(exc))
def enqueue(project_id: int):
    POOL.submit(run_project, project_id)
