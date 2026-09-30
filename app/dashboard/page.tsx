"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { ArrowRight, BookOpen, Box, Clock3, LogOut, Plus, Sparkles, WandSparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function Dashboard() {
  const router = useRouter();
  const [email, setEmail] = useState("workspace local");

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    supabase.auth.getUser().then(({data}) => {
      if (!data.user) router.replace("/auth");
      else setEmail(data.user.email || "workspace");
    });
  }, [router]);

  async function logout() {
    const supabase = getSupabase();
    if (supabase) await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <main className="dashPage">
      <aside className="sidebar">
        <Link href="/dashboard" className="brand"><span className="brandMark"><Sparkles size={17}/></span><span>SkillForge</span></Link>
        <nav className="sideNav">
          <Link href="/dashboard" className="active"><Box size={17}/> Projetos</Link>
          <Link href="/dashboard/new"><Plus size={17}/> Nova Skill</Link>
          <span><BookOpen size={17}/> Knowledge base <b>em breve</b></span>
        </nav>
        <div className="sideBottom">
          <small>{email}</small>
          <button onClick={logout}><LogOut size={16}/> Sair</button>
        </div>
      </aside>

      <section className="dashContent">
        <header className="dashHeader">
          <div><span className="eyebrow">WORKSPACE</span><h1>Seus projetos</h1><p>Fontes capturadas e Skills compiladas.</p></div>
          <Link href="/dashboard/new" className="button"><Plus size={16}/> Nova Skill</Link>
        </header>

        <div className="statsGrid">
          <div><small>Projetos</small><strong>0</strong><span>Crie o primeiro</span></div>
          <div><small>Páginas capturadas</small><strong>0</strong><span>Sem consumo ainda</span></div>
          <div><small>Skills geradas</small><strong>0</strong><span>Prontas para agentes</span></div>
        </div>

        <section className="emptyState">
          <div className="emptyIcon"><WandSparkles size={28}/></div>
          <span className="eyebrow">PRIMEIRO PROJETO</span>
          <h2>Transforme uma fonte em inteligência.</h2>
          <p>Cole a URL de uma documentação, help center, academia, changelog ou base pública de conhecimento.</p>
          <Link href="/dashboard/new" className="button">Criar minha primeira Skill <ArrowRight size={16}/></Link>
          <div className="examples"><Clock3 size={14}/> Exemplo: docs.oracle.com, docs.aws.amazon.com, developers.google.com</div>
        </section>
      </section>
    </main>
  );
}
