# SkillForge Docs

Aplicação publicada na Vercel para transformar documentação web em Skills estruturadas.

## Arquitetura atual

- Vercel para hosting
- Python Function em `api/fetch.py`
- navegador coordena o crawl em lotes concorrentes
- estado dos projetos fica no navegador
- geração do ZIP acontece no cliente

Isso evita jobs longos presos em infraestrutura e mantém o progresso visível.

## Fluxo

URL → descoberta de links → lotes de 6 páginas → progresso em tempo real → Skill ZIP

## Deploy

O projeto é Vercel-native. Basta importar o repositório `matteuzdev/SkillForge-Docs` na Vercel ou rodar:

```bash
vercel --prod
```

## Observação

A versão atual não usa Supabase, Cloudflare, D1, R2 ou banco externo.
