from __future__ import annotations
import os
from pathlib import Path
from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
from .auth import hash_password, verify_password
from .db import db, init_db
from .jobs import enqueue

app = FastAPI(title="SkillForge Docs", version="0.4.0")
app.add_middleware(SessionMiddleware, secret_key=os.getenv("SECRET_KEY","dev-change-me"), same_site="lax", https_only=False)
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

@app.on_event("startup")
def startup(): init_db()

def current_user(request: Request):
    uid = request.session.get("user_id")
    if not uid: return None
    with db() as conn: return conn.execute("SELECT id,email FROM users WHERE id=?", (uid,)).fetchone()

@app.get("/", response_class=HTMLResponse)
def home(request: Request): return templates.TemplateResponse("index.html", {"request":request, "user":current_user(request)})

@app.get("/auth", response_class=HTMLResponse)
def auth_page(request: Request, mode: str = "login", error: str = ""):
    return templates.TemplateResponse("auth.html", {"request":request, "mode":mode, "error":error})

@app.post("/signup")
def signup(request: Request, email: str = Form(...), password: str = Form(...)):
    email = email.strip().lower()
    if len(password) < 6: return RedirectResponse("/auth?mode=signup&error=Senha+precisa+ter+6+caracteres", 303)
    try:
        with db() as conn:
            cur = conn.execute("INSERT INTO users(email,password_hash) VALUES (?,?)", (email, hash_password(password)))
            request.session["user_id"] = cur.lastrowid
        return RedirectResponse("/dashboard", 303)
    except Exception:
        return RedirectResponse("/auth?mode=signup&error=E-mail+ja+cadastrado", 303)

@app.post("/login")
def login(request: Request, email: str = Form(...), password: str = Form(...)):
    with db() as conn: user = conn.execute("SELECT * FROM users WHERE email=?", (email.strip().lower(),)).fetchone()
    if not user or not verify_password(password, user["password_hash"]): return RedirectResponse("/auth?error=Credenciais+invalidas", 303)
    request.session["user_id"] = user["id"]; return RedirectResponse("/dashboard", 303)

@app.post("/logout")
def logout(request: Request): request.session.clear(); return RedirectResponse("/", 303)

@app.get("/dashboard", response_class=HTMLResponse)
def dashboard(request: Request):
    user = current_user(request)
    if not user: return RedirectResponse("/auth", 303)
    with db() as conn: projects = conn.execute("SELECT * FROM projects WHERE user_id=? ORDER BY id DESC", (user["id"],)).fetchall()
    return templates.TemplateResponse("dashboard.html", {"request":request, "user":user, "projects":projects})

@app.get("/projects/new", response_class=HTMLResponse)
def new_project(request: Request):
    user = current_user(request)
    if not user: return RedirectResponse("/auth", 303)
    return templates.TemplateResponse("new.html", {"request":request, "user":user})

@app.post("/projects")
def create_project(request: Request, name: str = Form(...), start_url: str = Form(...), scope: str = Form("host"), max_pages: int = Form(100)):
    user = current_user(request)
    if not user: return RedirectResponse("/auth", 303)
    if not start_url.startswith(("http://","https://")): return RedirectResponse("/projects/new?error=URL+invalida", 303)
    max_pages = max(0, min(max_pages, 100000))
    with db() as conn:
        cur = conn.execute("INSERT INTO projects(user_id,name,start_url,scope,max_pages,status) VALUES (?,?,?,?,?,'queued')",
                           (user["id"], name.strip(), start_url.strip(), scope, max_pages))
        project_id = cur.lastrowid
    enqueue(project_id)
    return RedirectResponse(f"/projects/{project_id}", 303)

@app.get("/projects/{project_id}", response_class=HTMLResponse)
def project_detail(project_id: int, request: Request):
    user = current_user(request)
    if not user: return RedirectResponse("/auth", 303)
    with db() as conn: project = conn.execute("SELECT * FROM projects WHERE id=? AND user_id=?", (project_id, user["id"])).fetchone()
    if not project: return RedirectResponse("/dashboard", 303)
    return templates.TemplateResponse("project.html", {"request":request, "user":user, "project":project})

@app.get("/api/projects/{project_id}")
def project_status(project_id: int, request: Request):
    user = current_user(request)
    if not user: return JSONResponse({"error":"unauthorized"}, status_code=401)
    with db() as conn: project = conn.execute("SELECT id,status,pages,words,error FROM projects WHERE id=? AND user_id=?", (project_id,user["id"])).fetchone()
    return dict(project) if project else JSONResponse({"error":"not found"}, status_code=404)

@app.get("/projects/{project_id}/download")
def download(project_id: int, request: Request):
    user = current_user(request)
    if not user: return RedirectResponse("/auth", 303)
    with db() as conn: project = conn.execute("SELECT * FROM projects WHERE id=? AND user_id=?", (project_id,user["id"])).fetchone()
    if not project or project["status"] != "done" or not project["zip_path"]: return RedirectResponse(f"/projects/{project_id}", 303)
    path = Path(project["zip_path"])
    return FileResponse(path, filename=path.name, media_type="application/zip")
