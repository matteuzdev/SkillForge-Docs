"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Globe2, Loader2, Sparkles } from "lucide-react";
import { FormEvent, useState } from "react";

export default function NewSkill() {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("100");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/crawl", {
        method: "POST",
        headers: {"content-type":"application/json"},
        body: JSON.stringify({ url, name, limit: Number(limit) || 100 })
      });
      const data = await response.json();
      setResult(data);
    } catch {
      setResult({error:"Falha ao iniciar o job."});
    }
    setBusy(false);
  }

  return (
    <main className="newPage">
      <div className="newShell">
        <Link href="/dashboard" className="backLink"><ArrowLeft size={16}/> Projetos</Link>
        <div className="newHead">
          <span className="pill"><Sparkles size={14}/> NOVA SKILL</span>
          <h1>Qual conhecimento você quer capturar?</h1>
          <p>Comece pela URL principal. O backend descobre páginas e inicia um job de captura estruturada.</p>
        </div>
        <form className="newCard" onSubmit={submit}>
          <label>URL da fonte</label>
          <div className="inputIcon"><Globe2 size={17}/><input type="url" required placeholder="https://docs.oracle.com/learn/" value={url} onChange={e=>setUrl(e.target.value)}/></div>
          <label>Nome da Skill</label>
          <input required placeholder="oracle-cloud-expert" value={name} onChange={e=>setName(e.target.value)}/>
          <div className="formGrid">
            <div><label>Limite inicial de páginas</label><input type="number" min="1" max="10000" value={limit} onChange={e=>setLimit(e.target.value)}/></div>
            <div><label>Formato</label><select defaultValue="skill"><option value="skill">Skill estruturada</option></select></div>
          </div>
          <div className="infoBox"><b>Arquitetura de job.</b> Crawls grandes não ficam presos a uma requisição do navegador. A API inicia o processamento e retorna um ID para acompanhamento.</div>
          <button className="button full" disabled={busy}>{busy ? <Loader2 className="spin" size={17}/> : <Sparkles size={17}/>} {busy ? "Iniciando..." : "Iniciar captura"} <ArrowRight size={16}/></button>
        </form>
        {result ? <pre className="apiResult">{JSON.stringify(result,null,2)}</pre> : null}
      </div>
    </main>
  );
}
