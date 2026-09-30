const $ = (id) => document.getElementById(id);
let generated = null;

async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function normalizeSkillName(input, url) {
  let base = input?.trim();
  if (!base && url) {
    try { base = new URL(url).hostname.replace(/^www\./, '').split('.')[0] + '-docs'; } catch {}
  }
  return (base || 'documentation-skill').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function useCurrentPage() {
  const tab = await currentTab();
  if (tab?.url?.startsWith('http')) {
    $('startUrl').value = tab.url;
    if (!$('skillName').value) $('skillName').value = normalizeSkillName('', tab.url);
  }
}

function log(line) {
  const el = $('log');
  el.textContent += `${line}\n`;
  el.scrollTop = el.scrollHeight;
}

function showProgress() {
  $('result').classList.add('hidden');
  $('progressWrap').classList.remove('hidden');
  $('log').textContent = '';
  $('bar').style.width = '0%';
}

function setBusy(busy) {
  $('start').disabled = busy;
  $('useCurrent').disabled = busy;
  $('start').textContent = busy ? 'Capturando…' : 'Capturar e gerar Skill';
}

$('useCurrent').addEventListener('click', useCurrentPage);

$('start').addEventListener('click', async () => {
  const url = $('startUrl').value.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    alert('Informe uma URL HTTP/HTTPS válida.');
    return;
  }

  const payload = {
    type: 'START_CAPTURE',
    config: {
      startUrl: url,
      maxPages: (() => { const n = Number($('maxPages').value); return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 30; })(),
      depth: (() => { const n = Number($('depth').value); return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 2; })(),
      scope: $('scope').value,
      skillName: normalizeSkillName($('skillName').value, url),
      includeCode: $('includeCode').checked,
      includeTables: $('includeTables').checked
    }
  };

  showProgress();
  setBusy(true);
  $('statusText').textContent = 'Iniciando…';

  try {
    const response = await chrome.runtime.sendMessage(payload);
    if (!response?.ok) throw new Error(response?.error || 'Falha desconhecida');
    generated = response.result;
    $('bar').style.width = '100%';
    $('statusText').textContent = 'Concluído';
    $('counter').textContent = `${generated.stats.pages} páginas`;
    $('resultMeta').textContent = `${generated.stats.pages} páginas • ${generated.stats.words.toLocaleString('pt-BR')} palavras • ${generated.stats.codeBlocks} blocos de código`;
    $('result').classList.remove('hidden');
    log(`✓ Skill ${generated.fileName} pronta.`);
  } catch (err) {
    $('statusText').textContent = 'Erro';
    log(`ERRO: ${err.message}`);
  } finally {
    setBusy(false);
  }
});

$('download').addEventListener('click', async () => {
  if (!generated) return;
  const response = await chrome.runtime.sendMessage({ type: 'DOWNLOAD_ZIP', zipBase64: generated.zipBase64, fileName: generated.fileName });
  if (!response?.ok) alert(response?.error || 'Não foi possível baixar o ZIP.');
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== 'CAPTURE_PROGRESS') return;
  const { done = 0, total = 0, status = '', line = '' } = message;
  $('statusText').textContent = status || 'Capturando…';
  $('counter').textContent = total ? `${done}/${total}` : String(done);
  const pct = total ? Math.min(95, Math.round((done / total) * 95)) : 5;
  $('bar').style.width = `${pct}%`;
  if (line) log(line);
});

useCurrentPage().catch(() => {});
