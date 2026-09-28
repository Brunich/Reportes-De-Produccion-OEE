import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export type Lang = 'es' | 'en';
export type Info = { kind: string; title: string; pitch?: string; desc: string; metrics: [string, string][]; how: string[][] };
export const PORTFOLIO = 'https://bruno-portfolio-azure.vercel.app';

const first = (): Lang => { try { const s = localStorage.getItem('lang'); if (s === 'es' || s === 'en') return s; } catch { /* sin almacenamiento */ } return navigator.language.toLowerCase().startsWith('en') ? 'en' : 'es'; };

// El marco de la página: encabezado, qué es, la herramienta, cómo funciona y pie. Español o inglés.
export default function Shell({ info, repo, page, children }: { info: (lang: Lang) => Info; repo: string; page: string; children: (lang: Lang) => ReactNode }) {
 const [lang, setLang] = useState<Lang>(first);
 useEffect(() => { document.documentElement.lang = lang; try { localStorage.setItem('lang', lang); } catch { /* sin almacenamiento */ } }, [lang]);
 const c = info(lang), es = lang === 'es', code = `https://github.com/Brunich/${repo}`;
 return <>
  <header className="top">
   <a className="brand" href={PORTFOLIO}><b>Bruno Salas</b><em>{es ? 'portafolio' : 'portfolio'}</em></a>
   <nav>
    <a href={code}>GitHub</a>
    <div className="lang" role="group" aria-label={es ? 'Idioma' : 'Language'}>{(['es', 'en'] as const).map(l => <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}</div>
   </nav>
  </header>
  <main>
   <section className="hero">
    <span className="kicker">{c.kind}</span>
    <h1>{c.title}</h1>
    {c.pitch && <p className="pitch">{c.pitch}</p>}
    <p className="desc">{c.desc}</p>
    {c.metrics.length > 0 && <ul className="metrics">{c.metrics.map(([n, l]) => <li key={l}><b>{n}</b><span>{l}</span></li>)}</ul>}
   </section>
   <section className="demo" aria-label={es ? 'Pruébalo' : 'Try it'}>{children(lang)}</section>
   <section className="how">
    <h2>{es ? 'Cómo funciona' : 'How it works'}</h2>
    <ol>{c.how.map(([h, p], i) => <li key={h}><span>{String(i + 1).padStart(2, '0')}</span><strong>{h}</strong><p>{p}</p></li>)}</ol>
   </section>
  </main>
  <footer className="foot">
   <span>{es ? 'Hecho por Bruno Salas' : 'Made by Bruno Salas'}</span>
   <a href={`${PORTFOLIO}/proyectos/${page}`}>{es ? 'Verlo en el portafolio' : 'See it in the portfolio'}</a>
   <a href={code}>{es ? 'Código' : 'Code'}</a>
  </footer>
 </>;
}
