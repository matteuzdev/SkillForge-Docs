"use client";

import Link from "next/link";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { getSupabase } from "@/lib/supabase";

function AuthForm() {
  const search = useSearchParams();
  const router = useRouter();
  const [mode, setMode] = useState(search.get("mode") === "signup" ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const supabase = getSupabase();
    if (!supabase) {
      setMessage("Auth ainda não foi conectado. Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      setBusy(false);
      return;
    }
    const result = mode === "signup"
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    if (result.error) setMessage(result.error.message);
    else if (mode === "signup" && !result.data.session) setMessage("Conta criada. Confirme seu e-mail para continuar.");
    else router.push("/dashboard");
    setBusy(false);
  }

  return (
    <main className="authPage">
      <Link href="/" className="backLink"><ArrowLeft size={16}/> Voltar</Link>
      <section className="authCard">
        <div className="brand authBrand"><span className="brandMark"><Sparkles size={17}/></span><span>SkillForge Docs</span></div>
        <span className="eyebrow">{mode === "signup" ? "CRIAR CONTA" : "BEM-VINDO DE VOLTA"}</span>
        <h1>{mode === "signup" ? "Comece a transformar conhecimento." : "Entre no seu workspace."}</h1>
        <p>{mode === "signup" ? "Crie sua conta e gere sua primeira Skill." : "Acesse seus projetos, fontes e Skills geradas."}</p>
        <form onSubmit={submit}>
          <label>E-mail</label>
          <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@empresa.com"/>
          <label>Senha</label>
          <input type="password" required minLength={6} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"/>
          <button className="button full" disabled={busy}>{busy ? <Loader2 className="spin" size={17}/> : null}{mode === "signup" ? "Criar conta" : "Entrar"}</button>
        </form>
        {message ? <div className="notice">{message}</div> : null}
        <button className="switchAuth" onClick={()=>setMode(mode === "signup" ? "login" : "signup")}>
          {mode === "signup" ? "Já tem conta? Entrar" : "Ainda não tem conta? Criar agora"}
        </button>
      </section>
    </main>
  );
}

export default function AuthPage() {
  return <Suspense fallback={<main className="authPage"><Loader2 className="spin"/></main>}><AuthForm/></Suspense>;
}
