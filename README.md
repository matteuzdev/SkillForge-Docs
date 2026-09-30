# SkillForge Docs

Web app para transformar fontes públicas de conhecimento em Skills estruturadas para agentes de IA.

## Stack

- Next.js 16 App Router
- React 19
- Supabase Auth
- Firecrawl v2 para jobs de crawl
- Vercel para deploy

## Fluxo

Landing → Auth → Dashboard → Nova Skill → Job de crawl → Knowledge distillation → Skill compiler → ZIP

## Rodar localmente

```bash
npm install
cp .env.example .env.local
npm run dev
```

Configure:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
FIRECRAWL_API_KEY=
```

Sem as chaves, a landing e o dashboard carregam normalmente; Auth e crawls reais ficam desativados de forma explícita.

## Legacy

A antiga prova de conceito da extensão Chrome continua preservada em `/extension`, mas o produto principal agora é o web app.
