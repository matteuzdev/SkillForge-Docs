# SkillForge Docs

Cloudflare-native app para transformar documentação e outras fontes públicas de conhecimento em Skills estruturadas para agentes de IA.

## Arquitetura atual

- Cloudflare Workers em Python
- Cloudflare Workflows para crawls assíncronos
- D1 para usuários, sessões e projetos
- R2 para ZIPs gerados
- Static Assets para landing/dashboard
- GitHub como fonte do código

## Fluxo

Landing → Auth → Dashboard → Nova Skill → Python Workflow → Crawl → Skill ZIP → R2

## Primeira publicação no Windows

No PowerShell, dentro do repositório:

```powershell
git pull
powershell -ExecutionPolicy Bypass -File scripts/publish.ps1
```

O script:
1. autentica sua conta Cloudflare;
2. cria o D1;
3. grava o database_id no wrangler.toml;
4. cria o bucket R2;
5. aplica schema.sql;
6. publica o Worker.

Depois do primeiro deploy, faça commit do `database_id` preenchido no `wrangler.toml`.

## Atualizações automáticas

Adicione estes Secrets no GitHub:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

O workflow `.github/workflows/cloudflare.yml` publica alterações do `main`.

## Estado do crawler

A versão 0.5 usa Cloudflare Python Workflows e captura HTML do mesmo domínio, compila `SKILL.md`, knowledge pages, sources e metadata em ZIP e salva no R2.

O limite inicial por job é 250 páginas. Browser Run para portais JS-heavy e particionamento de crawls gigantes entram na próxima etapa.

## Legacy

A prova antiga da extensão Chrome continua em `/extension` apenas como histórico.
