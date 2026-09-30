import Link from "next/link";
import { ArrowRight, BookOpen, BrainCircuit, Code2, Layers3, Search, Sparkles } from "lucide-react";

const features = [
  ["Descobre", "Mapeia páginas, seções e fontes antes de extrair.", Search],
  ["Captura", "Transforma conteúdo web em Markdown limpo e rastreável.", BookOpen],
  ["Destila", "Organiza conceitos, procedimentos, decisões e troubleshooting.", BrainCircuit],
  ["Compila", "Gera uma Skill estruturada, pronta para agentes de IA.", Code2],
];

export default function Home() {
  return (
    <main>
      <nav className="nav shell">
        <Link href="/" className="brand">
          <span className="brandMark"><Sparkles size={17}/></span>
          <span>SkillForge Docs</span>
        </Link>
        <div className="navActions">
          <Link href="/auth" className="textLink">Entrar</Link>
          <Link href="/auth?mode=signup" className="button small">Criar conta <ArrowRight size={15}/></Link>
        </div>
      </nav>

      <section className="hero shell">
        <div className="heroCopy">
          <span className="pill"><Layers3 size={14}/> WEB KNOWLEDGE → AI SKILLS</span>
          <h1>Transforme a documentação do mundo em <span>inteligência operacional.</span></h1>
          <p>Capture documentação técnica, academias, help centers, changelogs e bases públicas de conhecimento. O SkillForge organiza tudo e prepara Skills reutilizáveis por agentes de IA.</p>
          <div className="heroActions">
            <Link href="/auth?mode=signup" className="button">Começar agora <ArrowRight size={17}/></Link>
            <a href="#como-funciona" className="button ghost">Ver como funciona</a>
          </div>
          <div className="trustRow">
            <span>Oracle</span><span>AWS</span><span>Google</span><span>Vercel</span><span>GitHub</span>
          </div>
        </div>
        <div className="heroPanel">
          <div className="window">
            <div className="windowTop"><i/><i/><i/><span>skillforge.app/new</span></div>
            <div className="windowBody">
              <div className="miniLabel">FONTE DE CONHECIMENTO</div>
              <div className="urlBox">https://docs.oracle.com/learn/</div>
              <div className="flow">
                <div><b>01</b><span>Discover</span><small>1.248 URLs</small></div>
                <div><b>02</b><span>Extract</span><small>Markdown + code</small></div>
                <div><b>03</b><span>Distill</span><small>Knowledge graph</small></div>
                <div className="active"><b>04</b><span>Compile</span><small>oracle-cloud.skill</small></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="section shell">
        <div className="sectionHead">
          <span className="eyebrow">PIPELINE</span>
          <h2>Não é só scraping. É transformação de conhecimento.</h2>
        </div>
        <div className="featureGrid">
          {features.map(([title, text, Icon], i) => (
            <article className="featureCard" key={String(title)}>
              <span className="featureNum">0{i+1}</span>
              <Icon size={22}/>
              <h3>{String(title)}</h3>
              <p>{String(text)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="cta shell">
        <div>
          <span className="eyebrow">SKILLFORGE DOCS</span>
          <h2>Uma URL entra. Uma Skill estruturada sai.</h2>
        </div>
        <Link href="/auth?mode=signup" className="button light">Criar minha primeira Skill <ArrowRight size={17}/></Link>
      </section>

      <footer className="footer shell"><span>© 2026 SkillForge Docs</span><span>Built for agentic workflows.</span></footer>
    </main>
  );
}
