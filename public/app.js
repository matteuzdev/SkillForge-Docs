const app=document.getElementById("app");
const api=async(path,opts={})=>{const r=await fetch(path,{credentials:"include",headers:{"content-type":"application/json",...(opts.headers||{})},...opts});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Erro");return d};

function home(){
 app.innerHTML='<nav class="nav shell"><a class="brand" href="#/"><span class="brandMark">✦</span><b>SkillForge Docs</b></a><div><a class="textLink" href="#/auth">Entrar</a><a class="button small" href="#/signup">Criar conta →</a></div></nav>'+
 '<section class="hero shell"><div><span class="pill">WEB KNOWLEDGE → AI SKILLS</span><h1>Transforme documentação em <span>inteligência operacional.</span></h1><p>Capture documentação técnica, academias, help centers e bases públicas. O SkillForge organiza tudo para agentes de IA.</p><div class="heroActions"><a class="button" href="#/signup">Começar agora →</a><a class="button ghost" href="#/dashboard">Abrir dashboard</a></div><div class="trustRow"><span>Oracle</span><span>AWS</span><span>Google</span><span>Cloudflare</span><span>GitHub</span></div></div><div class="window"><div class="windowTop"><i></i><i></i><i></i><span>skillforge.workers.dev</span></div><div class="windowBody"><small>PIPELINE</small><div class="flow"><div><b>01</b><span>Discover</span><small>URLs</small></div><div><b>02</b><span>Extract</span><small>knowledge</small></div><div><b>03</b><span>Distill</span><small>structure</small></div><div class="active"><b>04</b><span>Compile</span><small>Skill ZIP</small></div></div></div></div></section>';
}

function auth(mode){
 app.innerHTML='<main class="authPage"><a class="backLink" href="#/">← Voltar</a><section class="authCard"><div class="brand"><span class="brandMark">✦</span><b>SkillForge Docs</b></div><span class="eyebrow">'+(mode==="signup"?"CRIAR CONTA":"ENTRAR")+'</span><h1>'+(mode==="signup"?"Comece a transformar conhecimento.":"Entre no seu workspace.")+'</h1><form id="auth"><label>E-mail</label><input name="email" type="email" required><label>Senha</label><input name="password" type="password" minlength="6" required><button class="button full">'+(mode==="signup"?"Criar conta":"Entrar")+'</button></form><div id="msg"></div></section></main>';
 document.getElementById("auth").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);try{await api("/api/"+(mode==="signup"?"signup":"login"),{method:"POST",body:JSON.stringify({email:f.get("email"),password:f.get("password")})});location.hash="#/dashboard"}catch(err){document.getElementById("msg").innerHTML='<div class="notice">'+err.message+'</div>'}};
}

async function dashboard(){
 try{
  const me=await api("/api/me"), data=await api("/api/projects");
  app.innerHTML='<main class="dashPage"><aside class="sidebar"><a class="brand" href="#/dashboard"><span class="brandMark">✦</span><b>SkillForge</b></a><nav class="sideNav"><a class="active" href="#/dashboard">▦ Projetos</a><a href="#/new">＋ Nova Skill</a></nav><div class="sideBottom"><small>'+me.user.email+'</small><button id="logout">↪ Sair</button></div></aside><section class="dashContent"><header class="dashHeader"><div><span class="eyebrow">WORKSPACE</span><h1>Seus projetos</h1><p>Fontes e Skills da sua conta.</p></div><a href="#/new" class="button">＋ Nova Skill</a></header><div id="projects"></div></section></main>';
  const box=document.getElementById("projects");
  box.innerHTML=data.projects.length?'<div class="projectList">'+data.projects.map(p=>'<a class="projectRow" href="#/project/'+p.id+'"><div><strong>'+p.name+'</strong><small>'+p.start_url+'</small></div><span class="status '+p.status+'">'+p.status+'</span><b>'+p.pages+' páginas</b><span>→</span></a>').join("")+'</div>':'<section class="emptyState"><div class="emptyIcon">✦</div><h2>Transforme uma fonte em inteligência.</h2><p>Crie seu primeiro projeto.</p><a href="#/new" class="button">Nova Skill →</a></section>';
  document.getElementById("logout").onclick=async()=>{await api("/api/logout",{method:"POST",body:"{}"});location.hash="#/"};
 }catch{location.hash="#/auth"}
}

function newProject(){
 app.innerHTML='<main class="newPage"><div class="newShell"><a class="backLink" href="#/dashboard">← Projetos</a><div class="newHead"><span class="pill">✦ NOVA SKILL</span><h1>Qual conhecimento você quer capturar?</h1><p>O Cloudflare Workflow faz o crawl, compila a Skill e salva o ZIP no R2.</p></div><form id="project" class="newCard"><label>URL da fonte</label><input name="start_url" type="url" required placeholder="https://docs.oracle.com/learn/"><label>Nome da Skill</label><input name="name" required placeholder="oracle-cloud-expert"><label>Máximo de páginas</label><input name="max_pages" type="number" min="1" max="5000" value="500"><div class="notice">Para documentações grandes, você pode capturar até 5.000 páginas por projeto. Durante a execução você verá páginas descobertas, visitadas, úteis, falhas, velocidade e estimativa.</div><button class="button full">Iniciar captura →</button></form><div id="msg"></div></div></main>';
 document.getElementById("project").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);try{const d=await api("/api/projects",{method:"POST",body:JSON.stringify({name:f.get("name"),start_url:f.get("start_url"),max_pages:Number(f.get("max_pages"))})});location.hash="#/project/"+d.project.id}catch(err){document.getElementById("msg").innerHTML='<div class="notice">'+err.message+'</div>'}};
}

function duration(sec){
 sec=Math.max(0,Number(sec||0));
 const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=Math.floor(sec%60);
 if(h)return h+"h "+m+"min";
 if(m)return m+"min "+s+"s";
 return s+"s";
}
function phaseName(v){
 return ({queued:"Na fila",discovering:"Descobrindo páginas",extracting:"Extraindo conhecimento",compiling:"Compilando a Skill",uploading:"Salvando o ZIP",done:"Concluído",error:"Erro",cancelled:"Cancelado"})[v]||v||"Preparando";
}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}

async function project(id){
 try{
  const d=await api("/api/projects/"+id),p=d.project,g=p.progress||{};
  const target=Math.max(1,Number(g.max_pages||1));
  const useful=Number(g.useful||p.pages||0);
  const pct=Math.min(100,Math.round(useful/target*100));
  const running=p.status==="queued"||p.status==="running";
  const eta=g.eta_seconds?duration(g.eta_seconds):"calculando...";
  const current=g.current_url?esc(g.current_url):"Preparando próxima etapa";
  app.innerHTML='<main class="newPage"><div class="newShell wide"><a class="backLink" href="#/dashboard">← Projetos</a>'+
  '<section class="projectDetail ops">'+
  '<div class="opsTop"><div><span class="eyebrow">PROJETO #'+p.id+'</span><h1>'+esc(p.name)+'</h1><p>'+esc(p.start_url)+'</p></div><span class="liveBadge '+(running?"live":"")+'"><i></i>'+phaseName(g.phase||p.status)+'</span></div>'+
  '<div class="progressHead"><div><b>'+useful.toLocaleString("pt-BR")+'</b> de <b>'+target.toLocaleString("pt-BR")+'</b> páginas úteis da meta</div><span>'+pct+'%</span></div>'+
  '<div class="progressTrack"><div style="width:'+pct+'%"></div></div>'+
  '<div class="metricsGrid">'+
    '<div><small>Descobertas</small><strong>'+(g.discovered??"—")+'</strong><span>URLs encontradas</span></div>'+
    '<div><small>Visitadas</small><strong>'+(g.visited??"—")+'</strong><span>requisições concluídas</span></div>'+
    '<div><small>Úteis</small><strong>'+useful+'</strong><span>entraram na Skill</span></div>'+
    '<div><small>Na fila</small><strong>'+(g.queue_size??"—")+'</strong><span>ainda aguardando</span></div>'+
    '<div><small>Ignoradas</small><strong>'+(g.skipped??"—")+'</strong><span>sem conteúdo útil</span></div>'+
    '<div><small>Falhas</small><strong>'+(g.failed??"—")+'</strong><span>URLs com erro</span></div>'+
  '</div>'+
  '<div class="runGrid">'+
    '<div class="runCard"><small>VELOCIDADE ATUAL</small><strong>'+(g.pages_per_minute??0)+' pág/min</strong><span>Tempo decorrido: '+duration(g.elapsed_seconds)+'</span></div>'+
    '<div class="runCard"><small>ESTIMATIVA PARA A META</small><strong>'+eta+'</strong><span>A estimativa se ajusta conforme o ritmo real.</span></div>'+
  '</div>'+
  (running?'<div class="currentTask"><span class="pulse"></span><div><small>PROCESSANDO AGORA</small><strong>'+phaseName(g.phase)+'</strong><code>'+current+'</code></div></div>':'')+
  (p.error?'<div class="notice errorNotice">'+esc(p.error)+'</div>':'')+
  '<div class="projectActions">'+
    (p.status==="done"?'<a class="button" href="/api/projects/'+p.id+'/download">Baixar Skill ZIP ↓</a>':'')+
    (running?'<button class="button danger" id="cancelRun">Cancelar captura</button>':'')+
  '</div>'+
  (p.status==="done"?'<div class="successBox"><b>Skill pronta.</b> O ZIP foi compilado e salvo no R2.</div>':'')+
  '</section></div></main>';
  const cancel=document.getElementById("cancelRun");
  if(cancel)cancel.onclick=async()=>{cancel.disabled=true;cancel.textContent="Solicitando cancelamento...";try{await api("/api/projects/"+id+"/cancel",{method:"POST",body:"{}"})}catch(e){cancel.disabled=false;cancel.textContent="Cancelar captura"}};
  if(running)setTimeout(()=>project(id),2000);
 }catch{location.hash="#/dashboard"}
}

function route(){const h=location.hash||"#/";if(h==="#/"||h==="")home();else if(h==="#/auth")auth("login");else if(h==="#/signup")auth("signup");else if(h==="#/dashboard")dashboard();else if(h==="#/new")newProject();else if(h.startsWith("#/project/"))project(h.split("/").pop());else home()}
addEventListener("hashchange",route);route();