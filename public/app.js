const app=document.getElementById("app");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const storeKey="skillforge-projects-v1";
const getProjects=()=>JSON.parse(localStorage.getItem(storeKey)||"[]");
const setProjects=p=>localStorage.setItem(storeKey,JSON.stringify(p));

function home(){
 app.innerHTML='<nav class="nav shell"><a class="brand" href="#/"><span class="brandMark">✦</span><b>SkillForge Docs</b></a><div><a class="button small" href="#/dashboard">Abrir app →</a></div></nav>'+
 '<section class="hero shell"><div><span class="pill">WEB KNOWLEDGE → AI SKILLS</span><h1>Transforme documentação em <span>inteligência operacional.</span></h1><p>Capture documentação técnica, help centers, academias e bases públicas. Agora em uma arquitetura simples, rápida e compatível com Vercel.</p><div class="heroActions"><a class="button" href="#/new">Criar Skill →</a><a class="button ghost" href="#/dashboard">Ver projetos</a></div><div class="trustRow"><span>Vercel</span><span>Python</span><span>Browser orchestration</span></div></div><div class="window"><div class="windowTop"><i></i><i></i><i></i><span>skillforge.vercel.app</span></div><div class="windowBody"><small>PIPELINE</small><div class="flow"><div><b>01</b><span>Discover</span><small>links</small></div><div><b>02</b><span>Extract</span><small>6 em paralelo</small></div><div><b>03</b><span>Track</span><small>progresso real</small></div><div class="active"><b>04</b><span>Compile</span><small>ZIP local</small></div></div></div></div></section>';
}

function dashboard(){
 const ps=getProjects();
 app.innerHTML='<main class="dashPage"><aside class="sidebar"><a class="brand" href="#/"><span class="brandMark">✦</span><b>SkillForge</b></a><nav class="sideNav"><a class="active" href="#/dashboard">▦ Projetos</a><a href="#/new">＋ Nova Skill</a></nav></aside><section class="dashContent"><header class="dashHeader"><div><span class="eyebrow">WORKSPACE LOCAL</span><h1>Seus projetos</h1><p>O estado fica no seu navegador; a Vercel executa apenas a extração.</p></div><a href="#/new" class="button">＋ Nova Skill</a></header><div id="projects"></div></section></main>';
 const box=document.getElementById("projects");
 box.innerHTML=ps.length?'<div class="projectList">'+ps.map(p=>'<a class="projectRow" href="#/project/'+p.id+'"><div><strong>'+esc(p.name)+'</strong><small>'+esc(p.url)+'</small></div><span class="status '+p.status+'">'+p.status+'</span><b>'+p.pages.length+' páginas</b><span>→</span></a>').join("")+'</div>':'<section class="emptyState"><div class="emptyIcon">✦</div><h2>Nenhum projeto ainda.</h2><p>Crie uma Skill a partir de uma documentação.</p><a href="#/new" class="button">Nova Skill →</a></section>';
}

function newProject(){
 app.innerHTML='<main class="newPage"><div class="newShell"><a class="backLink" href="#/dashboard">← Projetos</a><div class="newHead"><span class="pill">✦ NOVA SKILL</span><h1>Qual documentação vamos capturar?</h1><p>O navegador coordena os lotes e a Vercel extrai as páginas em paralelo.</p></div><form id="project" class="newCard"><label>URL inicial</label><input name="url" type="url" required placeholder="https://docs.oracle.com/learn/"><label>Nome da Skill</label><input name="name" required placeholder="oracle-cloud-expert"><label>Meta de páginas úteis</label><input name="max" type="number" min="1" max="5000" value="500"><div class="notice">Você verá descobertas, visitadas, úteis, falhas, fila, velocidade e tempo decorrido. Pode cancelar a qualquer momento.</div><button class="button full">Iniciar captura →</button></form></div></main>';
 document.getElementById("project").onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),id=Date.now().toString(36);const p={id,name:f.get("name"),url:f.get("url"),max:Number(f.get("max")),status:"queued",queue:[f.get("url")],seen:[],pages:[],failed:0,skipped:0,started:Date.now(),current:""};const ps=getProjects();ps.unshift(p);setProjects(ps);location.hash="#/project/"+id};
}

async function fetchPage(url){
 const r=await fetch("/api/fetch",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({url})});
 const d=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(d.error||"Falha");
 return d;
}

function classify(title,text,url){
 const s=(title+" "+url+" "+text.slice(0,4000)).toLowerCase();
 if(/troubleshoot|error|issue|problem|resolve/.test(s))return"troubleshooting";
 if(/api reference|endpoint|request body|response body|parameters/.test(s))return"api-reference";
 if(/how to|tutorial|quickstart|getting started|configure|install|deploy/.test(s))return"how-to";
 if(/architecture|design pattern|best practice|topology/.test(s))return"architecture";
 if(/overview|introduction|fundamentals|what is/.test(s))return"concept";
 return"reference";
}

function saveProject(p){const ps=getProjects();const i=ps.findIndex(x=>x.id===p.id);if(i>=0)ps[i]=p;else ps.unshift(p);setProjects(ps)}
function duration(ms){const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h?h+"h "+m+"min":m?m+"min "+(s%60)+"s":s+"s"}

async function runCrawler(p){
 if(p.running)return;
 p.running=true;p.status="running";saveProject(p);
 const host=new URL(p.url).host;
 while(p.queue.length && p.pages.length<p.max && p.status==="running"){
   const batch=[];
   while(p.queue.length && batch.length<6){
     const u=p.queue.shift();
     if(p.seen.includes(u))continue;
     p.seen.push(u);batch.push(u);
   }
   if(!batch.length)continue;
   p.current=batch[0];saveProject(p);renderProject(p);
   const results=await Promise.all(batch.map(async u=>{try{return await fetchPage(u)}catch(e){return{url:u,error:e.message}}}));
   for(const d of results){
     if(d.error){p.failed++;continue}
     if((d.words||0)<40){p.skipped++}else{
       p.pages.push({url:d.url,title:d.title,text:d.text,words:d.words,kind:classify(d.title,d.text,d.url)});
     }
     for(const link of d.links||[]){
       try{if(new URL(link).host===host&&!p.seen.includes(link)&&!p.queue.includes(link))p.queue.push(link)}catch{}
     }
   }
   saveProject(p);renderProject(p);await sleep(30);
 }
 p.running=false;
 if(p.status==="running")p.status="done";
 saveProject(p);renderProject(p);
}

function compile(p){
 const files={};
 files["SKILL.md"]='---\nname: '+p.name.toLowerCase().replace(/[^a-z0-9]+/g,"-")+'\ndescription: Knowledge skill generated from '+p.url+'\n---\n# '+p.name+'\n\n## Purpose\nUse this captured knowledge to answer, plan, troubleshoot and implement tasks grounded in the original sources.\n\n## Operating rules\n1. Start with knowledge/index.md.\n2. Read relevant captured pages before implementation guidance.\n3. Preserve source URLs.\n';
 let index="# Knowledge Index\n\n",sources=[];
 p.pages.forEach((x,i)=>{const fn=String(i+1).padStart(4,"0")+"-"+(x.title||"page").toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,70)+".md";index+="- ["+x.title+"](pages/"+fn+") — "+x.url+"\n";files["knowledge/pages/"+fn]="# "+x.title+"\n\n- Source: "+x.url+"\n- Type: "+x.kind+"\n\n"+x.text;sources.push({title:x.title,url:x.url,type:x.kind,words:x.words})});
 files["knowledge/index.md"]=index;files["sources/sources.json"]=JSON.stringify(sources,null,2);files["metadata.json"]=JSON.stringify({generator:"SkillForge Docs Vercel",name:p.name,start_url:p.url,pages:p.pages.length,words:p.pages.reduce((a,b)=>a+b.words,0)},null,2);
 const blob=makeZip(files),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=p.name.toLowerCase().replace(/[^a-z0-9]+/g,"-")+".zip";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

function renderProject(p){
 const elapsed=Date.now()-p.started,rate=elapsed>0?(p.pages.length/(elapsed/60000)):0,remaining=Math.max(0,p.max-p.pages.length),eta=rate>0?duration((remaining/rate)*60000):"calculando...";
 app.innerHTML='<main class="newPage"><div class="newShell wide"><a class="backLink" href="#/dashboard">← Projetos</a><section class="projectDetail ops"><div class="opsTop"><div><span class="eyebrow">PROJETO</span><h1>'+esc(p.name)+'</h1><p>'+esc(p.url)+'</p></div><span class="liveBadge '+(p.status==="running"?"live":"")+'"><i></i>'+p.status+'</span></div><div class="progressHead"><div><b>'+p.pages.length+'</b> de <b>'+p.max+'</b> páginas úteis</div><span>'+Math.min(100,Math.round(p.pages.length/p.max*100))+'%</span></div><div class="progressTrack"><div style="width:'+Math.min(100,p.pages.length/p.max*100)+'%"></div></div><div class="metricsGrid"><div><small>Descobertas</small><strong>'+(p.seen.length+p.queue.length)+'</strong><span>URLs</span></div><div><small>Visitadas</small><strong>'+p.seen.length+'</strong><span>requisições</span></div><div><small>Úteis</small><strong>'+p.pages.length+'</strong><span>na Skill</span></div><div><small>Na fila</small><strong>'+p.queue.length+'</strong><span>aguardando</span></div><div><small>Ignoradas</small><strong>'+p.skipped+'</strong><span>pouco conteúdo</span></div><div><small>Falhas</small><strong>'+p.failed+'</strong><span>erros</span></div></div><div class="runGrid"><div class="runCard"><small>VELOCIDADE</small><strong>'+rate.toFixed(1)+' pág/min</strong><span>Tempo: '+duration(elapsed)+'</span></div><div class="runCard"><small>ESTIMATIVA</small><strong>'+eta+'</strong><span>para atingir a meta</span></div></div>'+(p.status==="running"?'<div class="currentTask"><span class="pulse"></span><div><small>PROCESSANDO AGORA</small><strong>Extraindo em lotes de 6</strong><code>'+esc(p.current)+'</code></div></div>':'')+'<div class="projectActions">'+(p.status==="running"?'<button id="cancel" class="button danger">Cancelar</button>':'')+(p.pages.length?'<button id="download" class="button">Baixar Skill ZIP ↓</button>':'')+(p.status!=="running"&&p.queue.length&&p.pages.length<p.max?'<button id="resume" class="button ghost">Continuar captura</button>':'')+'</div></section></div></main>';
 const c=document.getElementById("cancel");if(c)c.onclick=()=>{p.status="cancelled";p.running=false;saveProject(p);renderProject(p)};
 const d=document.getElementById("download");if(d)d.onclick=()=>compile(p);
 const r=document.getElementById("resume");if(r)r.onclick=()=>{p.status="running";runCrawler(p)};
}

function project(id){
 const p=getProjects().find(x=>x.id===id);if(!p){location.hash="#/dashboard";return}
 renderProject(p);
 if((p.status==="queued"||p.status==="running")&&!p.running)runCrawler(p);
}

function route(){const h=location.hash||"#/";if(h==="#/"||h==="")home();else if(h==="#/dashboard")dashboard();else if(h==="#/new")newProject();else if(h.startsWith("#/project/"))project(h.split("/").pop());else home()}
addEventListener("hashchange",route);route();