import { useMemo, useRef, useState } from 'react';
import { FileXls, FileCsv, CheckCircle, WarningCircle, DownloadSimple, WhatsappLogo, Copy } from '@phosphor-icons/react';
import { parseCsv } from './csv';
import { readTable, TABLE_ACCEPT } from './read-file';
import { byDay, consolidate, mapColumns, summaryText, NEEDS, SAMPLE_PROD, SAMPLE_QUAL, SAMPLE_STOPS } from './planta-logic';
import type { ColumnMap, Field, FileKind, Grid, LineOee } from './planta-logic';
import { exportCsv } from './csv';
import './planta.css';

// Planta: tres reportes de un turno (producción, calidad y paros) se cruzan solos,
// salen las excepciones, el OEE de cada línea y el reporte en Excel.
type Slot = { name: string; grid: Grid; sample: boolean };
const SAMPLES: Record<FileKind, [string, string]> = { prod: ['produccion_marzo.csv', SAMPLE_PROD], qual: ['calidad_marzo.csv', SAMPLE_QUAL], stops: ['paros_marzo.csv', SAMPLE_STOPS] };
const FIELD_ES: Record<string, string> = { fecha: 'fecha', turno: 'turno', linea: 'línea', lote: 'lote', plan: 'plan', prod: 'producidas', prog: 'min programados', ciclo: 'ciclo ideal', rev: 'revisadas', rej: 'rechazadas', min: 'minutos', causa: 'causa' };
const pct = (n: number) => `${(n * 100).toFixed(1)} %`;

const readFile = (file: File): Promise<Grid> => readTable(file);

function Ring({ value, size = 120, label }: { value: number; size?: number; label?: string }) {
 const tone = value >= .85 ? 'good' : value >= .65 ? 'mid' : 'low';
 return <div className={`pl-ring tone-${tone}`} style={{ width: size, height: size }}>
  <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="50" className="pl-track"/><circle cx="60" cy="60" r="50" className="pl-arc" pathLength={100} style={{ strokeDashoffset: 100 - value * 100 }}/><circle cx="60" cy="60" r="50" className="pl-goal" pathLength={100} style={{ strokeDasharray: '0.6 99.4', strokeDashoffset: -85 }}/></svg>
  <span><b>{(value * 100).toFixed(1)}</b><small>{label ?? '%'}</small></span>
 </div>;
}

function LineCard({ l, es, i }: { l: LineOee; es: boolean; i: number }) {
 const loss = l.lossStops + l.lossSpeed + l.lossQuality || 1;
 return <article className="pl-line" style={{ ['--i' as string]: i }}>
  <header><strong>{es ? 'Línea' : 'Line'} {l.linea.replace(/^L/, '')}</strong><span>{l.prod.toLocaleString('es-MX')} {es ? 'piezas' : 'parts'}</span></header>
  <Ring value={l.oee} label="OEE %"/>
  <dl className="pl-arq">
   {([[es ? 'Disponibilidad' : 'Availability', l.A, 'a'], [es ? 'Rendimiento' : 'Performance', l.R, 'r'], [es ? 'Calidad' : 'Quality', l.Q, 'q']] as const).map(([k, v, c]) => <div key={c} className={`k-${c}`}><dt>{k}</dt><dd><i style={{ width: `${v * 100}%` }}/><b>{pct(v)}</b></dd></div>)}
  </dl>
  <p className="pl-loss-title">{es ? 'Dónde se pierde el tiempo' : 'Where time is lost'} · {Math.round(loss)} min</p>
  <div className="pl-loss" aria-label={es ? 'Pérdidas' : 'Losses'}>
   <i className="k-a" style={{ flexGrow: l.lossStops }} title={`${es ? 'Paros' : 'Stops'} ${Math.round(l.lossStops)} min`}/>
   <i className="k-r" style={{ flexGrow: l.lossSpeed }} title={`${es ? 'Velocidad' : 'Speed'} ${Math.round(l.lossSpeed)} min`}/>
   <i className="k-q" style={{ flexGrow: l.lossQuality }} title={`${es ? 'Rechazos' : 'Rejects'} ${Math.round(l.lossQuality)} min`}/>
  </div>
  <p className="pl-loss-legend"><span className="k-a">{es ? 'paros' : 'stops'} {Math.round(l.lossStops)}</span><span className="k-r">{es ? 'velocidad' : 'speed'} {Math.round(l.lossSpeed)}</span><span className="k-q">{es ? 'rechazos' : 'rejects'} {Math.round(l.lossQuality)}</span></p>
 </article>;
}

export default function Planta({ lang }: { lang: 'es' | 'en' }) {
 const es = lang === 'es', L = es ? 0 : 1, t = (a: string, b: string) => es ? a : b;
 const [slots, setSlots] = useState<Record<FileKind, Slot | null>>(() => ({ prod: { name: SAMPLES.prod[0], grid: parseCsv(SAMPLES.prod[1]), sample: true }, qual: { name: SAMPLES.qual[0], grid: parseCsv(SAMPLES.qual[1]), sample: true }, stops: { name: SAMPLES.stops[0], grid: parseCsv(SAMPLES.stops[1]), sample: true } }));
 const [limit, setLimit] = useState(3);
 const [err, setErr] = useState('');
 const [filter, setFilter] = useState('');
 const [note, setNote] = useState('');
 const [run, setRun] = useState(0);
 const [over, setOver] = useState<Record<FileKind, ColumnMap>>({ prod: {}, qual: {}, stops: {} });
 const [seen, setSeen] = useState<Set<string>>(() => new Set());
 const inputs = useRef<Record<FileKind, HTMLInputElement | null>>({ prod: null, qual: null, stops: null });
 const maps = useMemo(() => (['prod', 'qual', 'stops'] as FileKind[]).map(k => slots[k] ? mapColumns(k, slots[k]!.grid.headers, over[k]) : null), [slots, over]);
 const ready = slots.prod && slots.qual && !maps[0]?.missing.length && !maps[1]?.missing.length;
 const res = useMemo(() => ready ? consolidate(slots.prod!.grid, slots.qual!.grid, slots.stops && !maps[2]?.missing.length ? slots.stops.grid : null, limit / 100, over) : null, [slots, limit, ready, maps, over]);
 const days = useMemo(() => res ? byDay(res) : [], [res]);
 const matched = res ? res.lots.filter(l => l.rev !== undefined).length : 0;
 const rules = res ? [...new Set(res.exceptions.map(e => e.rule))] : [];
 const shown = res ? res.exceptions.filter(e => !filter || e.rule === filter) : [];
 // Revisada: el supervisor la palomea al atenderla; la marca vive mientras la página esté abierta.
 const idOf = (e: { rule: string; where: string; text: [string, string] }) => `${e.rule}|${e.where}|${e.text[0]}`;
 const reviewed = res ? res.exceptions.filter(e => seen.has(idOf(e))).length : 0;
 const toggle = (id: string) => setSeen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
 function exportExceptions() {
  if (!res) return;
  const csv = exportCsv([t('severidad', 'severity'), t('excepción', 'exception'), t('dónde', 'where'), t('revisada', 'reviewed')], res.exceptions.map(e => [e.severity, e.text[L], e.where, seen.has(idOf(e)) ? t('sí', 'yes') : t('no', 'no')]));
  const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'excepciones_planta.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
 }
 const stopMax = res?.pareto[0]?.[1] ?? 1, stopTotal = res ? res.pareto.reduce((s, p) => s + p[1], 0) : 0;

 async function load(kind: FileKind, file: File | undefined) {
  if (!file) return;
  try { const grid = await readFile(file); setSlots(s => ({ ...s, [kind]: { name: file.name, grid, sample: false } })); setOver(o => ({ ...o, [kind]: {} })); setErr(''); setRun(r => r + 1); }
  catch { setErr(t(`No pude leer ${file.name}. Usa Excel (.xlsx) o CSV en UTF-8.`, `Could not read ${file.name}. Use Excel (.xlsx) or UTF-8 CSV.`)); }
 }
 async function sampleXlsx(kind: FileKind) {
  const XLSX = await import('xlsx'); const g = parseCsv(SAMPLES[kind][1]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([g.headers, ...g.rows.map(r => r.map(v => (/^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v)))]), 'Datos');
  XLSX.writeFile(wb, SAMPLES[kind][0].replace(/\.\w+$/, '.xlsx'));
 }
 async function report() {
  if (!res) return;
  const XLSX = await import('xlsx'); const wb = XLSX.utils.book_new();
  const r4 = (n: number) => Math.round(n * 1000) / 10;
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[t('Línea', 'Line'), 'OEE %', t('Disponibilidad %', 'Availability %'), t('Rendimiento %', 'Performance %'), t('Calidad %', 'Quality %'), t('Piezas', 'Parts'), t('Rechazadas', 'Rejected'), t('Min programados', 'Scheduled min'), t('Min de paro', 'Stop min')], ...res.lines.map(l => [l.linea, r4(l.oee), r4(l.A), r4(l.R), r4(l.Q), l.prod, l.rej, l.prog, l.stops]), ['Total', r4(res.total.oee), r4(res.total.A), r4(res.total.R), r4(res.total.Q)]]), 'OEE');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[t('Severidad', 'Severity'), t('Excepción', 'Exception'), t('Dónde', 'Where')], ...res.exceptions.map(e => [e.severity, e.text[L], e.where])]), t('Excepciones', 'Exceptions'));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['fecha', 'turno', 'linea', 'lote', 'plan', 'producidas', 'revisadas', 'rechazadas', 'rechazo %', 'defecto'], ...res.lots.map(l => [l.fecha, l.turno, l.linea, l.lote, l.plan, l.prod, l.rev ?? '', l.rej ?? '', l.rev ? r4((l.rej ?? 0) / l.rev) : '', l.defecto ?? ''])]), 'Consolidado');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[t('Causa', 'Cause'), t('Minutos', 'Minutes'), t('% acumulado', 'Cumulative %')], ...res.pareto.map((p, i) => [p[0], p[1], r4(res.pareto.slice(0, i + 1).reduce((s, x) => s + x[1], 0) / (stopTotal || 1))])]), t('Paros', 'Stops'));
  XLSX.writeFile(wb, 'reporte_planta.xlsx'); setNote(t('Reporte descargado: OEE, excepciones, consolidado y paros en cuatro hojas.', 'Report downloaded: OEE, exceptions, consolidated and stops in four sheets.'));
 }

 return <div className="pl">
  <div className="pl-files">
   {(['prod', 'qual', 'stops'] as FileKind[]).map((k, i) => {
    const s = slots[k], m = maps[i];
    return <div key={k} className={`pl-file${m?.missing.length ? ' bad' : s ? ' ok' : ''}`} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void load(k, e.dataTransfer.files?.[0]); }}>
     <span className="pl-file-kind">{[t('1 · Producción', '1 · Production'), t('2 · Calidad', '2 · Quality'), t('3 · Paros (opcional)', '3 · Stops (optional)')][i]}</span>
     <div className="pl-file-name">{s && /\.xlsx?$/i.test(s.name) ? <FileXls size={26} weight="duotone"/> : <FileCsv size={26} weight="duotone"/>}<div><strong>{s?.name ?? t('Sin archivo', 'No file')}</strong><small>{s ? `${s.grid.rows.length} ${t('filas', 'rows')}${s.sample ? t(' · ejemplo', ' · sample') : ''}` : ''}</small></div></div>
     <ul className="pl-cols">{NEEDS[k].map(f => <li key={f} className={m && !m.missing.includes(f as never) ? 'on' : ''}>{es ? FIELD_ES[f] : f}</li>)}</ul>
     {m && m.missing.length > 0 && s && <div className="pl-miss"><p><WarningCircle size={15}/>{t('No reconocí estas columnas. Dime cuál es cuál:', 'I did not recognize these columns. Tell me which is which:')}</p>
      {m.missing.map(f => <label key={f}><span>{es ? FIELD_ES[f] : f}</span><select value="" onChange={e => { const v = Number(e.target.value); setOver(o => ({ ...o, [k]: { ...o[k], [f as Field]: v } })); }}><option value="">{t('Elegir columna…', 'Choose column…')}</option>{s.grid.headers.map((h, j) => <option key={j} value={j} disabled={Object.values(m.map).includes(j)}>{h || `${t('columna', 'column')} ${j + 1}`}</option>)}</select></label>)}</div>}
     {Object.keys(over[k]).length > 0 && !m?.missing.length && <p className="pl-mapped"><CheckCircle size={15}/>{t('Columnas asignadas a mano.', 'Columns assigned by hand.')} <button className="pl-link" onClick={() => setOver(o => ({ ...o, [k]: {} }))}>{t('Deshacer', 'Undo')}</button></p>}
     <input ref={el => { inputs.current[k] = el; }} type="file" accept={TABLE_ACCEPT} hidden onChange={e => { void load(k, e.target.files?.[0]); e.target.value = ''; }}/>
     <div className="pl-file-actions"><button className="dw-primary" onClick={() => inputs.current[k]?.click()}>{t('Subir Excel o CSV', 'Upload Excel or CSV')}</button><button className="pl-link" onClick={() => void sampleXlsx(k)}>{t('ejemplo .xlsx', 'sample .xlsx')}</button></div>
    </div>;
   })}
  </div>
  {err && <p className="pl-err" role="alert">{err}</p>}
  {!ready && !err && <p className="pl-err">{t('Sube producción y calidad con sus columnas para cruzarlos.', 'Upload production and quality with their columns to cross them.')}</p>}

  {res && <div className="pl-out" key={run}>
   <section className="pl-summary">
    <div className="pl-total"><Ring value={res.total.oee} size={168} label={t('OEE de planta', 'Plant OEE')}/><p>{res.total.oee >= .85 ? t('Nivel de clase mundial (85 %).', 'World-class level (85%).') : t(`A ${((0.85 - res.total.oee) * 100).toFixed(1)} puntos del 85 % de clase mundial.`, `${((0.85 - res.total.oee) * 100).toFixed(1)} points below world-class 85%.`)}</p></div>
    <dl className="pl-kpis">
     <div><dt>{t('Lotes cruzados', 'Batches matched')}</dt><dd>{matched}<small>/{res.lots.length}</small></dd></div>
     <div className={res.exceptions.length ? 'warn' : ''}><dt>{t('Excepciones', 'Exceptions')}</dt><dd>{res.exceptions.length}</dd></div>
     <div><dt>{t('Minutos de paro', 'Stop minutes')}</dt><dd>{stopTotal}</dd></div>
     <div><dt>{t('Piezas buenas', 'Good parts')}</dt><dd>{res.lines.reduce((s, l) => s + l.prod - l.rej, 0).toLocaleString('es-MX')}</dd></div>
    </dl>
   </section>

   <h3 className="pl-h">{t('OEE por línea', 'OEE by line')}<span>{t('Disponibilidad × rendimiento × calidad. La marca del anillo es el 85 %.', 'Availability × performance × quality. The ring mark is 85%.')}</span></h3>
   <div className="pl-lines">{res.lines.map((l, i) => <LineCard key={l.linea} l={l} es={es} i={i}/>)}</div>

   {days.length > 1 && <section className="pl-days" aria-label={t('OEE por día', 'OEE by day')}>
    <h3 className="pl-h">{t('OEE por día', 'OEE by day')}<span>{t('Sale de las fechas del reporte: sube una semana y ves la tendencia. La raya punteada es el 85 %.', 'Built from the report dates: upload a week to see the trend. The dashed line is 85%.')}</span></h3>
    <div className="pl-days-chart" role="list">
     {days.map((d, i) => { const tone = d.oee >= .85 ? 'good' : d.oee >= .65 ? 'mid' : 'low', prev = days[i - 1];
      return <div key={d.fecha} className={`pl-day tone-${tone}`} role="listitem" title={d.lines.map(l => `${l.linea} ${pct(l.oee)}`).join(' · ')} style={{ ['--i' as string]: i }}>
       <b>{pct(d.oee)}{prev && <em className={d.oee >= prev.oee ? 'up' : 'down'}>{d.oee >= prev.oee ? '▲' : '▼'} {Math.abs((d.oee - prev.oee) * 100).toFixed(1)}</em>}</b>
       <span className="pl-day-bar"><i style={{ height: `${d.oee * 100}%` }}/></span>
       <small>{new Date(`${d.fecha}T12:00:00`).toLocaleDateString(es ? 'es-MX' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' })}</small>
      </div>; })}
    </div>
    <table className="pl-daytable"><thead><tr><th scope="col">{t('Línea', 'Line')}</th>{days.map(d => <th key={d.fecha} scope="col">{new Date(`${d.fecha}T12:00:00`).toLocaleDateString(es ? 'es-MX' : 'en-US', { day: 'numeric', month: 'short' })}</th>)}<th scope="col">{t('Cambio', 'Change')}</th></tr></thead>
     <tbody>{res.lines.map(l => { const vals = days.map(d => d.lines.find(x => x.linea === l.linea)?.oee), first = vals.find(v => v !== undefined), last = [...vals].reverse().find(v => v !== undefined), delta = first !== undefined && last !== undefined ? last - first : 0;
      return <tr key={l.linea}><th scope="row">{l.linea}</th>{vals.map((v, i) => <td key={i}>{v === undefined ? '—' : pct(v)}</td>)}<td className={delta > 0.0005 ? 'up' : delta < -0.0005 ? 'down' : ''}>{delta > 0.0005 ? '▲' : delta < -0.0005 ? '▼' : '='} {Math.abs(delta * 100).toFixed(1)}</td></tr>; })}</tbody></table>
   </section>}

   <div className="pl-split">
    <section className="pl-ex">
     <h3 className="pl-h">{t('Incoherencias entre reportes', 'Inconsistencies between reports')}{res.exceptions.length - reviewed > 0 ? <em className="pl-chip warn"><WarningCircle size={15} weight="fill" aria-hidden="true"/>{t(`${res.exceptions.length - reviewed} por revisar`, `${res.exceptions.length - reviewed} to review`)}</em> : <em className="pl-chip ok"><CheckCircle size={15} weight="fill" aria-hidden="true"/>{t('Todo revisado', 'All reviewed')}</em>}</h3>
     <label className="pl-limit">{t('Rechazo máximo', 'Max rejection')} <input type="range" min={1} max={8} step={0.5} value={limit} onChange={e => setLimit(+e.target.value)}/><b>{limit} %</b></label>
     <div className="pl-filter">{['', ...rules].map(r => <button key={r || 'all'} aria-pressed={filter === r} onClick={() => setFilter(r)}>{r ? ({ 'sin-inspeccion': t('Sin inspección', 'Not inspected'), 'sin-produccion': t('Lote no existe', 'Unknown batch'), revisadas: t('Revisadas > producidas', 'Inspected > produced'), rechazo: t('Rechazo alto', 'High rejection'), plan: t('Plan', 'Plan'), paro: t('Paro sin causa', 'Stop without cause'), dato: t('Dato inválido', 'Invalid value') } as Record<string, string>)[r] : t(`Todas (${res.exceptions.length})`, `All (${res.exceptions.length})`)}</button>)}</div>
     <p className="pl-progress"><span><i style={{ width: `${res.exceptions.length ? reviewed / res.exceptions.length * 100 : 100}%` }}/></span>{t(`${reviewed} de ${res.exceptions.length} revisadas`, `${reviewed} of ${res.exceptions.length} reviewed`)}<button className="pl-link" onClick={exportExceptions}>{t('Exportar CSV', 'Export CSV')}</button></p>
     <ol>{shown.map((e, i) => { const id = idOf(e), done = seen.has(id); return <li key={id} className={`sev-${e.severity}${done ? ' is-done' : ''}`} style={{ ['--i' as string]: i }}><span>{e.severity === 'alta' ? <WarningCircle size={13} weight="fill" aria-hidden="true"/> : null}{e.severity === 'alta' ? t('Alta', 'High') : t('Media', 'Medium')}</span><div><strong>{e.text[L]}</strong><small>{e.where}</small></div><label className="pl-check"><input type="checkbox" checked={done} onChange={() => toggle(id)}/><span>{t('Revisada', 'Reviewed')}</span></label></li>; })}</ol>
     {!shown.length && <p className="pl-ok"><CheckCircle size={18}/>{t('Sin incoherencias.', 'No inconsistencies.')}</p>}
    </section>
    <section className="pl-pareto">
     <h3 className="pl-h">{t('Paros por causa', 'Stops by cause')}<span>{t('Pareto: arriba lo que más tiempo se come.', 'Pareto: the biggest time-eaters first.')}</span></h3>
     {res.pareto.length ? <ol>{res.pareto.map(([c, m], i) => <li key={c} style={{ ['--i' as string]: i }}><span>{c}</span><i><b style={{ width: `${m / stopMax * 100}%` }}/></i><em>{m} min</em><small>{Math.round(res.pareto.slice(0, i + 1).reduce((s, x) => s + x[1], 0) / stopTotal * 100)} %</small></li>)}</ol> : <p className="pl-ok">{t('Sin reporte de paros.', 'No stops report.')}</p>}
     <h3 className="pl-h pl-h-shift">{t('Por turno', 'By shift')}<span>{t('Mismo plan, distinto resultado: dónde mirar primero.', 'Same plan, different result: where to look first.')}</span></h3>
     <table className="pl-shifts"><thead><tr><th scope="col">{t('Turno', 'Shift')}</th><th scope="col">{t('Plan', 'Plan')}</th><th scope="col">{t('Rechazo', 'Reject')}</th><th scope="col">{t('Paros', 'Stops')}</th></tr></thead>
      <tbody>{res.shifts.map(sh => { const plan = sh.plan ? sh.prod / sh.plan : 0, rej = sh.rev ? sh.rej / sh.rev : 0;
       const worst = (k: 'plan' | 'rej' | 'stops') => res.shifts.length > 1 && res.shifts.every(o => k === 'plan' ? (o.plan ? o.prod / o.plan : 0) >= plan : k === 'rej' ? (o.rev ? o.rej / o.rev : 0) <= rej : o.stops <= sh.stops);
       return <tr key={sh.turno}><th scope="row">{es ? sh.turno : ({ Matutino: 'Morning', Vespertino: 'Evening', Nocturno: 'Night' } as Record<string, string>)[sh.turno] ?? sh.turno}<small>{sh.lots} {t('lotes', 'batches')}</small></th>
        <td className={worst('plan') ? 'worst' : ''}><i style={{ width: `${Math.min(100, plan * 100)}%` }}/>{pct(plan)}</td><td className={worst('rej') ? 'worst' : ''}>{pct(rej)}</td><td className={worst('stops') ? 'worst' : ''}>{sh.stops} min</td></tr>; })}</tbody></table>
     <p className="pl-shift-note">{t('En rosa, el peor turno de cada columna.', 'In pink, the worst shift in each column.')}</p>
    </section>
   </div>

   <section className="pl-report">
    <div><h3 className="pl-h">{t('Reporte del turno', 'Shift report')}</h3><p>{t('Cuatro hojas de Excel: OEE, excepciones, consolidado y paros. O el resumen corto para el grupo de WhatsApp.', 'Four Excel sheets: OEE, exceptions, consolidated and stops. Or the short summary for the WhatsApp group.')}</p></div>
    <div className="pl-report-actions">
     <button className="dw-primary" onClick={() => void report()}><DownloadSimple size={17}/>{t('Descargar Excel', 'Download Excel')}</button>
     <button onClick={async () => { try { await navigator.clipboard.writeText(summaryText(res, es)); setNote(t('Resumen copiado.', 'Summary copied.')); } catch { setNote(''); } }}><Copy size={17}/>{t('Copiar resumen', 'Copy summary')}</button>
     <a className="pl-wa" href={`https://wa.me/?text=${encodeURIComponent(summaryText(res, es))}`} target="_blank" rel="noreferrer"><WhatsappLogo size={17}/>WhatsApp</a>
    </div>
    {note && <p className="pl-note" role="status">{note}</p>}
   </section>
  </div>}
 </div>;
}
