const TRACKING = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid'];
const STOP_PATHS = /\.(png|jpg|jpeg|gif|svg|webp|ico|pdf|zip|gz|tar|7z|mp4|mp3|avi|mov|woff2?|ttf|eot)(\?|$)/i;

function cleanText(s='') { return s.replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim(); }
function elementText(el) { return cleanText(el?.textContent || ''); }
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
function tableToMarkdown(table) {
  const rows = [...table.querySelectorAll('tr')].map(tr => [...tr.querySelectorAll('th,td')].map(td => elementText(td).replace(/\|/g,'\\|'))).filter(r => r.length);
  if (!rows.length) return '';
  const width = Math.max(...rows.map(r => r.length));
  const normalized = rows.map(r => [...r, ...Array(width-r.length).fill('')]);
  const head = normalized[0];
  return `| ${head.join(' | ')} |\n| ${head.map(()=> '---').join(' | ')} |\n` + normalized.slice(1).map(r => `| ${r.join(' | ')} |`).join('\n');
}
function classify(url, title, text) {
  const s = `${url} ${title} ${text.slice(0,5000)}`.toLowerCase();
  const tests = [
    ['troubleshooting', /(troubleshoot|troubleshooting|error|errors|issue|problem|diagnostic|resolve)/],
    ['api-reference', /(api reference|endpoint|request body|response body|http status|parameters|sdk reference)/],
    ['how-to', /(how to|tutorial|quickstart|getting started|step 1|procedure|create a|configure|install|deploy)/],
    ['architecture', /(architecture|design pattern|best practice|reference architecture|topology)/],
    ['concept', /(concept|overview|introduction|understanding|fundamentals|what is)/],
    ['release-notes', /(release notes|changelog|what's new|whats new|new features|deprecated)/]
  ];
  return tests.find(([,r]) => r.test(s))?.[0] || 'reference';
}
function extractPage(html, url, config) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,noscript,svg,canvas,iframe,form,button,input,select,textarea').forEach(n => n.remove());
  doc.querySelectorAll('nav,footer,aside').forEach(n => { if (elementText(n).length < 5000) n.remove(); });
  const title = cleanText(doc.querySelector('h1')?.textContent || doc.title || url);
  const desc = cleanText(doc.querySelector('meta[name="description"]')?.content || '');
  const main = doc.querySelector('main, article, [role="main"], .content, .documentation, .docs-content') || doc.body;
  const sections = [];
  let current = { heading: title, level: 1, blocks: [] };
  const nodes = main ? [...main.querySelectorAll('h1,h2,h3,h4,p,pre,ul,ol,table,blockquote,dl')] : [];
  let codeBlocks = 0;
  for (const node of nodes) {
    const tag = node.tagName.toLowerCase();
    if (/^h[1-4]$/.test(tag)) {
      if (current.blocks.length) sections.push(current);
      current = { heading: elementText(node), level: Number(tag[1]), blocks: [] };
      continue;
    }
    if (tag === 'pre') {
      if (!config.includeCode) continue;
      const text = cleanText(node.textContent || '');
      if (text.length < 2) continue;
      current.blocks.push({ type: 'code', text }); codeBlocks++; continue;
    }
    if (tag === 'table') {
      if (!config.includeTables) continue;
      const md = tableToMarkdown(node); if (md) current.blocks.push({ type:'table', text:md }); continue;
    }
    if (tag === 'ul' || tag === 'ol') {
      const items = [...node.children].filter(x => x.matches('li')).map(li => elementText(li)).filter(Boolean);
      if (items.length) current.blocks.push({ type:'list', ordered:tag==='ol', items }); continue;
    }
    const text = elementText(node);
    if (text.length >= 25) current.blocks.push({ type:tag==='blockquote'?'quote':'text', text });
  }
  if (current.blocks.length) sections.push(current);
  const links = [...doc.querySelectorAll('a[href]')].map(a => normalizeUrl(a.getAttribute('href'), url)).filter(Boolean);
  const fullText = sections.flatMap(s => s.blocks.flatMap(b => b.items || [b.text || ''])).join('\n');
  const words = fullText.split(/\s+/).filter(Boolean).length;
  return { url, title, description:desc, sections, links:[...new Set(links)], words, codeBlocks, type:classify(url,title,fullText) };
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'PARSE_HTML') return;
  try { sendResponse({ok:true,page:extractPage(message.html,message.url,message.config)}); }
  catch (err) { sendResponse({ok:false,error:err.message}); }
});
