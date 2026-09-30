# SkillForge Docs

Transforma fontes públicas de conhecimento em Skills estruturadas para agentes de IA.

## Stack principal
- Python 3.12
- FastAPI
- SQLite
- autenticação por sessão própria
- httpx + BeautifulSoup + Trafilatura
- Playwright como fallback para páginas JavaScript
- zipfile para compilar Skills
- Docker para deploy

Não usa Supabase.

## Fluxo
Landing → Auth → Dashboard → Nova Skill → Crawler Python → Markdown estruturado → Skill ZIP

## Rodar localmente
```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium
uvicorn app.main:app --reload
```

Linux/macOS:
```bash
source .venv/bin/activate
```

Abra: http://127.0.0.1:8000

## Configuração
Copie `.env.example` e configure uma `SECRET_KEY` forte no ambiente.

## Deploy
O projeto está pronto para container Docker. Railway, Render, Fly.io ou VPS são opções naturais para manter jobs de crawler executando fora do ciclo curto de funções serverless.

## Crawler
- tenta sitemap primeiro;
- segue links do mesmo escopo;
- extrai HTML via httpx;
- usa Playwright se a página vier pobre por JavaScript;
- `max_pages = 0` significa sem limite explícito;
- registra fontes e gera `SKILL.md`, `knowledge/` e metadata.

## Legacy
A antiga extensão Chrome está preservada em `/extension`. O antigo experimento Next.js fica no histórico Git e não é mais a arquitetura principal.
