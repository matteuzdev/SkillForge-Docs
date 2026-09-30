import { makeZip, bytesToBase64 } from './zip.js';

const STOP_PATHS = /\.(png|jpg|jpeg|gif|svg|webp|ico|pdf|zip|gz|tar|7z|mp4|mp3|avi|mov|woff2?|ttf|eot)(\?|$)/i;
const TRACKING = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid'];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'START_CAPTURE') {
    runCapture(message.config).then(result => sendResponse({ ok: true, result })).catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (message?.type === 'DOWNLOAD_ZIP') {
    downloadZip(message.zipBase64, message.fileName).then(() => sendResponse({ ok: true })).catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

async function broadcast(data) {
  try { await chrome.runtime.sendMessage({ type: 'CAPTURE_PROGRESS', ...data }); } catch {}
}

function normalizeUrl(raw, base) {
  try {
    const u = new URL(raw, base);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = '';
    TRACKING.forEach(k => u.searchParams.delete(k));
    if (STOP_PATHS.test(u.pathname)) return null;
    return u.toString();
  } catch { return null; }
}

function basePath(url) {
  const u = new URL(url);
  let p = u.pathname;
  if (!p.endsWith('/')) p = p.slice(0, p.lastIndexOf('/') + 1);
  return p || '/';
}

function inScope(candidate, start, scope) {
  const a = new URL(candidate), b = new URL(start);
  if (a.host !== b.host) return false;
  if (scope === 'host') return true;
  const root = basePath(start);
  return a.pathname.startsWith(root);
}


async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts.length) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['DOM_PARSER'],
    justification: 'Parse technical documentation HTML into structured knowledge.'
  });
}

async function parseHtml(html, url, config) {
  await ensureOffscreen();
  const res = await chrome.runtime.sendMessage({ type: 'PARSE_HTML', html, url, config });
  if (!res?.ok) throw new Error(res?.error || 'Falha ao interpretar HTML');
  return res.page;
}

function slugify(s) {
  return (s || 'page').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80) || 'page';
}

function pageToMarkdown(page) {
  const out = [`# ${page.title}`, '', `- Source: ${page.url}`, `- Type: ${page.type}`, ''];
  if (page.description) out.push(`> ${page.description}`, '');
  for (const section of page.sections) {
    const level = Math.max(2, Math.min(5, section.level + 1));
    if (section.heading && section.heading !== page.title) out.push(`${'#'.repeat(level)} ${section.heading}`, '');
    for (const block of section.blocks) {
      if (block.type === 'code') out.push('```', block.text, '```', '');
      else if (block.type === 'table') out.push(block.text, '');
      else if (block.type === 'list') block.items.forEach((item,i) => out.push(block.ordered ? `${i+1}. ${item}` : `- ${item}`));
      else if (block.type === 'quote') out.push(`> ${block.text}`, '');
      else out.push(block.text, '');
    }
  }
  return out.join('\n').replace(/\n{3,}/g,'\n\n').trim() + '\n';
}

function buildSkillMd(config, pages) {
  const host = new URL(config.startUrl).host;
  const types = [...new Set(pages.map(p=>p.type))];
  return `---\nname: ${config.skillName}\ndescription: Knowledge skill generated from official documentation on ${host}. Use it to answer, plan, troubleshoot, and implement tasks grounded in the captured documentation.\n---\n\n# ${config.skillName}\n\n## Purpose\n\nUse the knowledge captured from ${host} to solve technical tasks with source-grounded reasoning. This skill is a structured snapshot of documentation, not an independent authority.\n\n## Operating rules\n\n1. Start with \`knowledge/index.md\` to locate the most relevant topic.\n2. Read the specific page file before giving implementation guidance.\n3. Prefer explicit procedures, constraints, examples, and warnings from the captured documentation.\n4. Distinguish documented facts from your own inference.\n5. When a question depends on version, region, pricing, deprecation, security policy, or another changing fact, verify the live official documentation before treating this snapshot as current.\n6. Preserve source URLs in answers or working notes when traceability matters.\n7. If two captured pages conflict, prefer the more specific page and verify against the live source.\n\n## Captured knowledge classes\n\n${types.map(t=>`- ${t}`).join('\n')}\n\n## Recommended workflow\n\n### Understand\nIdentify the product, concept, task, and constraints.\n\n### Retrieve\nUse \`knowledge/index.md\` and the page files under \`knowledge/pages/\`.\n\n### Decide\nExtract documented requirements, recommended choices, limitations, and alternatives.\n\n### Execute\nTurn those into concrete implementation steps, commands, code, configuration, or troubleshooting actions.\n\n### Verify\nCheck the source URL when freshness or exact syntax matters.\n\n## Source boundary\n\nCaptured from: ${config.startUrl}\nCaptured pages: ${pages.length}\nGenerated at: ${new Date().toISOString()}\n`;
}

function buildIndex(pages) {
  const groups = Object.groupBy ? Object.groupBy(pages, p=>p.type) : pages.reduce((a,p)=>((a[p.type] ||= []).push(p),a),{});
  const out = ['# Knowledge Index',''];
  for (const type of Object.keys(groups).sort()) {
    out.push(`## ${type}`, '');
    for (const p of groups[type].sort((a,b)=>a.title.localeCompare(b.title))) {
      out.push(`- [${p.title}](pages/${p.fileName}) — ${p.url}`);
    }
    out.push('');
  }
  return out.join('\n');
}

function uniqueFileNames(pages) {
  const used = new Map();
  return pages.map((p, idx) => {
    let base = slugify(p.title);
    let count = used.get(base) || 0;
    used.set(base, count + 1);
    if (count) base += `-${count+1}`;
    return { ...p, fileName: `${String(idx+1).padStart(3,'0')}-${base}.md` };
  });
}

async function fetchHtml(url) {
  const res = await fetch(url, { redirect: 'follow', credentials: 'omit', cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) throw new Error(`Tipo ignorado: ${type || 'desconhecido'}`);
  return await res.text();
}


async function waitForTabComplete(tabId, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === 'complete') return;
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('Timeout ao renderizar página');
}

async function fetchRenderedHtml(url) {
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await waitForTabComplete(tab.id);
    await new Promise(r => setTimeout(r, 1200));
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.documentElement?.outerHTML || ''
    });
    const html = result?.result || '';
    if (!html) throw new Error('Página renderizada vazia');
    return html;
  } finally {
    try { await chrome.tabs.remove(tab.id); } catch {}
  }
}

async function fetchPage(url, config) {
  let html = await fetchHtml(url);
  let page = await parseHtml(html, url, config);
  if (page.words >= 40) return page;

  await broadcast({ status:'Renderizando página dinâmica', done:0, total:0, line:`  ↳ HTML estático pobre; tentando renderização do navegador…` });
  html = await fetchRenderedHtml(url);
  page = await parseHtml(html, url, config);
  return page;
}

async function runCapture(config) {
  const queue = [{ url: config.startUrl, depth: 0 }];
  const seen = new Set();
  const pages = [];

  const unlimited = config.maxPages === 0;
  await broadcast({ status:'Descobrindo documentação', done:0, total: unlimited ? 0 : config.maxPages, line:`→ ${config.startUrl}${unlimited ? ' (sem limite de páginas)' : ''}` });

  while (queue.length && (unlimited || pages.length < config.maxPages)) {
    const item = queue.shift();
    const url = normalizeUrl(item.url, config.startUrl);
    if (!url || seen.has(url) || !inScope(url, config.startUrl, config.scope)) continue;
    seen.add(url);

    await broadcast({ status:'Capturando páginas', done:pages.length, total: unlimited ? 0 : config.maxPages, line:`[${pages.length+1}] ${url}` });
    try {
      const page = await fetchPage(url, config);
      if (page.words >= 40) pages.push(page);
      const unlimitedDepth = config.depth === 0;
      if (unlimitedDepth || item.depth < config.depth) {
        for (const link of page.links) {
          if (!seen.has(link) && inScope(link, config.startUrl, config.scope)) {
            queue.push({ url: link, depth: item.depth + 1 });
          }
        }
      }
    } catch (err) {
      await broadcast({ status:'Capturando páginas', done:pages.length, total: unlimited ? 0 : config.maxPages, line:`  ↳ ignorada: ${err.message}` });
    }
  }

  if (!pages.length) throw new Error('Nenhuma página de documentação pôde ser extraída. Tente outra URL ou escopo.');
  const named = uniqueFileNames(pages);
  await broadcast({ status:'Compilando Skill', done:named.length, total:named.length, line:'→ Organizando knowledge base e fontes…' });

  const files = {};
  files['SKILL.md'] = buildSkillMd(config, named);
  files['knowledge/index.md'] = buildIndex(named);
  for (const p of named) files[`knowledge/pages/${p.fileName}`] = pageToMarkdown(p);
  files['sources/sources.json'] = JSON.stringify(named.map(p => ({ title:p.title, url:p.url, type:p.type, words:p.words, codeBlocks:p.codeBlocks })), null, 2);
  files['metadata.json'] = JSON.stringify({
    schemaVersion: 1,
    generator: 'SkillForge Docs 0.2.0',
    skillName: config.skillName,
    startUrl: config.startUrl,
    scope: config.scope,
    maxPages: config.maxPages === 0 ? 'unlimited' : config.maxPages,
    depth: config.depth,
    capturedAt: new Date().toISOString(),
    stats: {
      pages: named.length,
      words: named.reduce((s,p)=>s+p.words,0),
      codeBlocks: named.reduce((s,p)=>s+p.codeBlocks,0)
    }
  }, null, 2);

  files['README.md'] = `# ${config.skillName}\n\nGenerated by SkillForge Docs.\n\n## Structure\n\n- SKILL.md — operating instructions\n- knowledge/index.md — topical index\n- knowledge/pages/ — captured documentation pages\n- sources/sources.json — source registry\n- metadata.json — generation metadata\n\n## Important\n\nThis is a documentation snapshot. For changing facts, verify the live source. Respect the original documentation's license and terms.\n`;

  const zip = makeZip(files);
  const stats = JSON.parse(files['metadata.json']).stats;
  return { fileName: `${config.skillName}.zip`, zipBase64: bytesToBase64(zip), stats };
}

async function downloadZip(base64, fileName) {
  const url = `data:application/zip;base64,${base64}`;
  await chrome.downloads.download({ url, filename: fileName, saveAs: true });
}
