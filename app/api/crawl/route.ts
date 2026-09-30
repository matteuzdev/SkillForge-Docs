import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const url = body?.url;
  const name = body?.name;
  const limit = Math.min(Math.max(Number(body?.limit) || 100, 1), 10000);

  if (!url || !name) return NextResponse.json({ error: "URL e nome são obrigatórios." }, { status: 400 });

  try { new URL(url); } catch {
    return NextResponse.json({ error: "URL inválida." }, { status: 400 });
  }

  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) {
    return NextResponse.json({
      ok: false,
      configured: false,
      message: "Interface pronta. Configure FIRECRAWL_API_KEY na Vercel para ativar crawls reais.",
      project: { name, url, limit }
    }, { status: 503 });
  }

  const response = await fetch("https://api.firecrawl.dev/v2/crawl", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${key}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      url,
      limit,
      scrapeOptions: { formats: ["markdown", "links"] }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return NextResponse.json({ error: "Firecrawl recusou o job.", details: data }, { status: response.status });
  }

  return NextResponse.json({
    ok: true,
    project: { name, url, limit },
    crawl: data
  });
}
