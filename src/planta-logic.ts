// Planta: cruza el reporte de producción, el de calidad y el de paros de un turno;
// marca lo que no cuadra y calcula el OEE de cada línea (disponibilidad × rendimiento × calidad).
export type Grid = { headers: string[]; rows: string[][] };
export type FileKind = 'prod' | 'qual' | 'stops';
import { parseDate } from './dates.ts';

export type Field = 'fecha' | 'turno' | 'linea' | 'lote' | 'plan' | 'prod' | 'prog' | 'ciclo' | 'rev' | 'rej' | 'defecto' | 'min' | 'causa';

const fold = (s: string) => s.toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const SYN: Record<Field, string[]> = {
 fecha: ['fecha', 'dia', 'date'], turno: ['turno', 'shift'], linea: ['linea', 'line'], lote: ['lote', 'batch', 'lot'],
 plan: ['plan', 'meta', 'objetivo', 'target'], prod: ['producidas', 'produccion', 'produced', 'real', 'fabricadas'],
 prog: ['programad', 'scheduled', 'disponible'], ciclo: ['ciclo', 'cycle'],
 rev: ['revisadas', 'inspeccionadas', 'inspected', 'revision'], rej: ['rechaz', 'defectuosas', 'scrap', 'rejected'],
 defecto: ['defecto', 'defect'], min: ['minutos', 'duracion', 'minutes', 'min'], causa: ['causa', 'motivo', 'razon', 'reason'],
};
export const NEEDS: Record<FileKind, Field[]> = {
 prod: ['fecha', 'turno', 'linea', 'lote', 'plan', 'prod', 'prog', 'ciclo'],
 qual: ['fecha', 'turno', 'linea', 'lote', 'rev', 'rej'],
 stops: ['fecha', 'turno', 'linea', 'min', 'causa'],
};
const OPTIONAL: Partial<Record<FileKind, Field[]>> = { qual: ['defecto'] };

// Qué columna del archivo corresponde a cada dato (por nombre, sin importar acentos ni mayúsculas).
// Lo que el supervisor eligió a mano (`over`) manda sobre lo que se adivina por el nombre.
export type ColumnMap = Partial<Record<Field, number>>;
export function mapColumns(kind: FileKind, headers: string[], over: ColumnMap = {}) {
 const h = headers.map(fold), map: ColumnMap = {}, used = new Set<number>();
 for (const [f, i] of Object.entries(over) as [Field, number][]) if (i >= 0 && i < headers.length && !used.has(i)) { map[f] = i; used.add(i); }
 for (const f of [...NEEDS[kind], ...(OPTIONAL[kind] ?? [])]) {
  if (map[f] !== undefined) continue;
  const i = h.findIndex((x, j) => !used.has(j) && SYN[f].some(s => x === s || x.includes(s)));
  if (i >= 0) { map[f] = i; used.add(i); }
 }
 return { map, missing: NEEDS[kind].filter(f => map[f] === undefined) };
}

const num = (v: string | undefined) => { const n = Number(String(v ?? '').trim().replace(/,(?=\d{3}\b)/g, '')); return Number.isFinite(n) ? n : NaN; };
const iso = (v: string) => parseDate(v)?.iso ?? v.trim().slice(0, 10);
// El turno nocturno cruza la medianoche: calidad puede anotar el lote con el día siguiente.
const dayBefore = (d: string) => { const t = Date.parse(`${d}T12:00:00Z`); return Number.isNaN(t) ? d : new Date(t - 864e5).toISOString().slice(0, 10); };
const shift = (v: string) => { const f = fold(v); return f.startsWith('mat') || f === '1' || f.startsWith('mor') ? 'Matutino' : f.startsWith('ves') || f === '2' || f.startsWith('eve') ? 'Vespertino' : f.startsWith('noc') || f === '3' || f.startsWith('nig') ? 'Nocturno' : v.trim(); };
const ORDER = ['Matutino', 'Vespertino', 'Nocturno'];
const lineName = (v: string) => v.trim().toUpperCase().replace(/^LINEA\s*/i, 'L').replace(/^L(?=\d)/, 'L');

export type Lot = { key: string; fecha: string; turno: string; linea: string; lote: string; plan: number; prod: number; prog: number; ciclo: number; rev?: number; rej?: number; defecto?: string };
export type Stop = { fecha: string; turno: string; linea: string; min: number; causa: string };
export type Exception = { rule: string; severity: 'alta' | 'media'; text: [string, string]; where: string };
export type LineOee = { linea: string; prog: number; stops: number; run: number; ideal: number; prod: number; rej: number; A: number; R: number; Q: number; oee: number; lossStops: number; lossSpeed: number; lossQuality: number };
export type ShiftSum = { turno: string; plan: number; prod: number; rev: number; rej: number; stops: number; lots: number };
export type Result = { shifts: ShiftSum[]; lots: Lot[]; orphans: { fecha: string; turno: string; linea: string; lote: string; rev: number; rej: number }[]; stops: Stop[]; exceptions: Exception[]; lines: LineOee[]; total: { A: number; R: number; Q: number; oee: number }; pareto: [string, number][] };

// OEE de una línea con sus lotes y paros: disponibilidad × rendimiento × calidad, y en qué se perdió el tiempo.
function lineOee(linea: string, lots: Lot[], stopList: Stop[]): LineOee {
 const ls = lots.filter(l => l.linea === linea && !Number.isNaN(l.prod) && !Number.isNaN(l.prog));
 const prog = ls.reduce((s, l) => s + l.prog, 0), stopsMin = stopList.filter(s => s.linea === linea).reduce((s, x) => s + x.min, 0);
 const run = Math.max(0, prog - stopsMin), ideal = ls.reduce((s, l) => s + (l.ciclo || 0) * l.prod / 60, 0);
 const prodSum = ls.reduce((s, l) => s + l.prod, 0), rej = ls.reduce((s, l) => s + (l.rej ?? 0), 0);
 const A = prog ? run / prog : 0, R = run ? Math.min(1, ideal / run) : 0, Q = prodSum ? (prodSum - rej) / prodSum : 0;
 const avgCycle = prodSum ? ideal / prodSum : 0;
 return { linea, prog, stops: stopsMin, run, ideal, prod: prodSum, rej, A, R, Q, oee: A * R * Q, lossStops: stopsMin, lossSpeed: Math.max(0, run - ideal), lossQuality: rej * avgCycle };
}
function totalOf(lines: LineOee[]) {
 const T = lines.reduce((t, l) => ({ prog: t.prog + l.prog, run: t.run + l.run, ideal: t.ideal + l.ideal, prod: t.prod + l.prod, rej: t.rej + l.rej }), { prog: 0, run: 0, ideal: 0, prod: 0, rej: 0 });
 const A = T.prog ? T.run / T.prog : 0, R = T.run ? Math.min(1, T.ideal / T.run) : 0, Q = T.prod ? (T.prod - T.rej) / T.prod : 0;
 return { A, R, Q, oee: A * R * Q };
}

// OEE de cada día del reporte: con una semana de datos sale la tendencia sin guardar nada aparte.
// Los paros cuentan en el día que trae su fecha (un paro nocturno después de medianoche cae en el día siguiente).
export type DayOee = { fecha: string; oee: number; A: number; R: number; Q: number; lines: { linea: string; oee: number }[] };
export function byDay(r: Result): DayOee[] {
 const days = [...new Set(r.lots.map(l => l.fecha))].filter(Boolean).sort();
 return days.map(fecha => {
  const lots = r.lots.filter(l => l.fecha === fecha), stops = r.stops.filter(s => s.fecha === fecha);
  const lines = [...new Set(lots.map(l => l.linea))].sort().map(linea => lineOee(linea, lots, stops));
  return { fecha, ...totalOf(lines), lines: lines.map(l => ({ linea: l.linea, oee: l.oee })) };
 });
}

export function consolidate(prod: Grid, qual: Grid, stops: Grid | null, rejectLimit = 0.03, over: Partial<Record<FileKind, ColumnMap>> = {}): Result {
 const P = mapColumns('prod', prod.headers, over.prod).map, Qm = mapColumns('qual', qual.headers, over.qual).map, S = stops ? mapColumns('stops', stops.headers, over.stops).map : null;
 const get = (r: string[], m: ColumnMap, f: Field) => (m[f] === undefined ? '' : r[m[f]!] ?? '');
 const keyOf = (fecha: string, turno: string, linea: string, lote: string) => `${iso(fecha)}|${shift(turno)}|${lineName(linea)}|${lote.trim()}`;
 const lots: Lot[] = prod.rows.filter(r => r.some(v => v.trim())).map(r => ({
  key: keyOf(get(r, P, 'fecha'), get(r, P, 'turno'), get(r, P, 'linea'), get(r, P, 'lote')),
  fecha: iso(get(r, P, 'fecha')), turno: shift(get(r, P, 'turno')), linea: lineName(get(r, P, 'linea')), lote: get(r, P, 'lote').trim(),
  plan: num(get(r, P, 'plan')), prod: num(get(r, P, 'prod')), prog: num(get(r, P, 'prog')), ciclo: num(get(r, P, 'ciclo')),
 }));
 const byKey = new Map(lots.map(l => [l.key, l]));
 const orphans: Result['orphans'] = [];
 qual.rows.filter(r => r.some(v => v.trim())).forEach(r => {
  const k = keyOf(get(r, Qm, 'fecha'), get(r, Qm, 'turno'), get(r, Qm, 'linea'), get(r, Qm, 'lote'));
  const rev = num(get(r, Qm, 'rev')), rej = num(get(r, Qm, 'rej'));
  let lot = byKey.get(k);
  if (!lot && shift(get(r, Qm, 'turno')) === 'Nocturno') lot = byKey.get(keyOf(dayBefore(iso(get(r, Qm, 'fecha'))), get(r, Qm, 'turno'), get(r, Qm, 'linea'), get(r, Qm, 'lote')));
  if (lot) { lot.rev = (lot.rev ?? 0) + rev; lot.rej = (lot.rej ?? 0) + rej; lot.defecto = get(r, Qm, 'defecto').trim() || lot.defecto; }
  else orphans.push({ fecha: iso(get(r, Qm, 'fecha')), turno: shift(get(r, Qm, 'turno')), linea: lineName(get(r, Qm, 'linea')), lote: get(r, Qm, 'lote').trim(), rev, rej });
 });
 const stopList: Stop[] = stops && S ? stops.rows.filter(r => r.some(v => v.trim())).map(r => ({ fecha: iso(get(r, S, 'fecha')), turno: shift(get(r, S, 'turno')), linea: lineName(get(r, S, 'linea')), min: num(get(r, S, 'min')) || 0, causa: get(r, S, 'causa').trim() })) : [];

 const ex: Exception[] = [];
 const at = (l: { fecha: string; turno: string; linea: string; lote: string }) => `${l.linea} · ${l.fecha} · ${l.turno} · lote ${l.lote}`;
 lots.forEach(l => {
  if (l.rev === undefined) ex.push({ rule: 'sin-inspeccion', severity: 'alta', text: ['Lote producido sin inspección de calidad', 'Batch produced without quality inspection'], where: at(l) });
  else {
   if (l.rev > l.prod) ex.push({ rule: 'revisadas', severity: 'alta', text: [`Se revisaron ${l.rev} piezas de ${l.prod} producidas`, `${l.rev} parts inspected out of ${l.prod} produced`], where: at(l) });
   const rate = l.rej! / (l.rev || 1);
   if (rate > rejectLimit) ex.push({ rule: 'rechazo', severity: rate > rejectLimit * 2 ? 'alta' : 'media', text: [`Rechazo de ${(rate * 100).toFixed(1)} %${l.defecto ? ` · ${l.defecto}` : ''}`, `${(rate * 100).toFixed(1)}% rejected${l.defecto ? ` · ${l.defecto}` : ''}`], where: at(l) });
  }
  if (l.plan > 0 && l.prod / l.plan < 0.9) ex.push({ rule: 'plan', severity: l.prod / l.plan < 0.8 ? 'alta' : 'media', text: [`Cumplimiento de plan de ${Math.round(l.prod / l.plan * 100)} % (${l.prod} de ${l.plan})`, `${Math.round(l.prod / l.plan * 100)}% of plan (${l.prod} of ${l.plan})`], where: at(l) });
  if ([l.plan, l.prod, l.prog, l.ciclo].some(Number.isNaN)) ex.push({ rule: 'dato', severity: 'media', text: ['Hay un número vacío o mal escrito en producción', 'A number in production is blank or malformed'], where: at(l) });
 });
 orphans.forEach(o => ex.push({ rule: 'sin-produccion', severity: 'alta', text: ['Inspección de un lote que no aparece en producción (¿lote mal escrito?)', 'Inspection of a batch missing from production (typo?)'], where: at(o) }));
 stopList.forEach(s => { if (!s.causa && s.min >= 30) ex.push({ rule: 'paro', severity: 'media', text: [`Paro de ${s.min} min sin causa registrada`, `${s.min}-min stop with no cause`], where: `${s.linea} · ${s.fecha} · ${s.turno}` }); });

 const names = [...new Set(lots.map(l => l.linea))].sort();
 const lines: LineOee[] = names.map(linea => lineOee(linea, lots, stopList));
 const { A, R, Q } = totalOf(lines);
 const causes = new Map<string, number>(); stopList.forEach(s => causes.set(s.causa || 'Sin causa', (causes.get(s.causa || 'Sin causa') ?? 0) + s.min));
 const shifts: ShiftSum[] = [...new Set(lots.map(l => l.turno))].map(turno => {
  const ls = lots.filter(l => l.turno === turno), sum = (f: (l: Lot) => number) => ls.reduce((a, l) => a + (Number.isNaN(f(l)) ? 0 : f(l)), 0);
  return { turno, plan: sum(l => l.plan), prod: sum(l => l.prod), rev: sum(l => l.rev ?? 0), rej: sum(l => l.rej ?? 0), stops: stopList.filter(x => x.turno === turno).reduce((a, x) => a + x.min, 0), lots: ls.length };
 }).sort((a, b) => ORDER.indexOf(a.turno) - ORDER.indexOf(b.turno));
 return { shifts, lots, orphans, stops: stopList, exceptions: ex.sort((a, b) => (a.severity === 'alta' ? 0 : 1) - (b.severity === 'alta' ? 0 : 1)), lines, total: { A, R, Q, oee: A * R * Q }, pareto: [...causes].sort((a, b) => b[1] - a[1]) };
}

// Resumen para mandar por WhatsApp o pegar en un correo.
// Rechazos por defecto (Pareto de calidad): cuántas piezas malas deja cada defecto, de mayor a menor.
export function defectPareto(r: Result): [string, number][] {
 const m = new Map<string, number>();
 r.lots.forEach(l => { if (l.rej) m.set(l.defecto?.trim() || '(sin defecto registrado)', (m.get(l.defecto?.trim() || '(sin defecto registrado)') ?? 0) + l.rej); });
 return [...m].sort((a, b) => b[1] - a[1]);
}

export function summaryText(r: Result, es: boolean) {
 const pct = (n: number) => `${(n * 100).toFixed(1)} %`;
 return [
  es ? `Reporte de planta · OEE ${pct(r.total.oee)}` : `Plant report · OEE ${pct(r.total.oee)}`,
  ...r.lines.map(l => `${l.linea}: OEE ${pct(l.oee)} (D ${pct(l.A)} · R ${pct(l.R)} · C ${pct(l.Q)})`),
  es ? `${r.exceptions.length} excepciones:` : `${r.exceptions.length} exceptions:`,
  ...r.exceptions.slice(0, 8).map(e => `• ${e.text[es ? 0 : 1]} — ${e.where}`),
  r.pareto[0] ? (es ? `Paro principal: ${r.pareto[0][0]} (${r.pareto[0][1]} min)` : `Top stop: ${r.pareto[0][0]} (${r.pareto[0][1]} min)`) : '',
 ].filter(Boolean).join('\n');
}

// Ejemplo sintético: la misma planta del analizador, dos días y tres turnos por línea.
const H = 'fecha,turno,linea,lote,modelo,plan_piezas,piezas_producidas,min_programados,ciclo_ideal_seg';
const PROD: [string, string, string, string, string, number, number][] = [
 ['2026-03-09', 'Matutino', 'L1', '4411', 'M-21 Sedán', 400, 392], ['2026-03-09', 'Matutino', 'L2', '4412', 'M-34 SUV', 330, 318], ['2026-03-09', 'Matutino', 'L3', '4413', 'M-40 Pickup', 300, 291],
 ['2026-03-09', 'Vespertino', 'L1', '4414', 'M-21 Sedán', 400, 377], ['2026-03-09', 'Vespertino', 'L2', '4415', 'M-34 SUV', 330, 262], ['2026-03-09', 'Vespertino', 'L3', '4416', 'M-40 Pickup', 300, 286],
 ['2026-03-09', 'Nocturno', 'L1', '4417', 'M-21 Sedán', 380, 369], ['2026-03-09', 'Nocturno', 'L2', '4418', 'M-34 SUV', 310, 301], ['2026-03-09', 'Nocturno', 'L3', '4419', 'M-40 Pickup', 280, 244],
 ['2026-03-10', 'Matutino', 'L1', '4420', 'M-21 Sedán', 400, 396], ['2026-03-10', 'Matutino', 'L2', '4421', 'M-34 SUV', 330, 322], ['2026-03-10', 'Matutino', 'L3', '4422', 'M-40 Pickup', 300, 288],
 ['2026-03-10', 'Vespertino', 'L1', '4423', 'M-21 Sedán', 400, 351], ['2026-03-10', 'Vespertino', 'L2', '4424', 'M-34 SUV', 330, 315], ['2026-03-10', 'Vespertino', 'L3', '4425', 'M-40 Pickup', 300, 279],
 ['2026-03-10', 'Nocturno', 'L1', '4426', 'M-21 Sedán', 380, 371], ['2026-03-10', 'Nocturno', 'L2', '4427', 'M-34 SUV', 310, 297], ['2026-03-10', 'Nocturno', 'L3', '4428', 'M-40 Pickup', 280, 266],
];
const CYCLE: Record<string, number> = { L1: 60, L2: 72, L3: 80 };
export const SAMPLE_PROD = [H, ...PROD.map(([f, t, l, lote, m, plan, p]) => [f, t, l, lote, m, plan, p, 450, CYCLE[l]].join(','))].join('\n');
const QUAL: [string, string, string, string, number, number, string][] = [
 ['2026-03-09', 'Matutino', 'L1', '4411', 392, 4, 'Rayón en puerta'], ['2026-03-09', 'Matutino', 'L2', '4412', 318, 7, 'Holgura en puerta'], ['2026-03-09', 'Matutino', 'L3', '4413', 291, 5, 'Soldadura incompleta'],
 ['2026-03-09', 'Vespertino', 'L1', '4414', 377, 3, 'Burbuja en cofre'], ['2026-03-09', 'Vespertino', 'L2', '4415', 262, 19, 'Fuga en sello de parabrisas'], ['2026-03-09', 'Vespertino', 'L3', '4416', 286, 6, 'Escurrimiento'],
 ['2026-03-09', 'Nocturno', 'L1', '4417', 369, 2, 'Rayón en puerta'], ['2026-03-09', 'Nocturno', 'L2', '4418', 301, 5, 'Holgura en cofre'],
 ['2026-03-10', 'Matutino', 'L1', '4420', 396, 3, 'Torque fuera de rango'], ['2026-03-10', 'Matutino', 'L2', '4421', 322, 6, 'Fuga en sello de puerta'], ['2026-03-10', 'Matutino', 'L3', '4422', 288, 4, 'Abolladura en caja'],
 ['2026-03-10', 'Vespertino', 'L1', '4423', 351, 5, 'Diferencia de tono'], ['2026-03-10', 'Vespertino', 'L2', '4424', 330, 6, 'Arnés mal conectado'], ['2026-03-10', 'Vespertino', 'L3', '4425', 279, 4, 'Rayón en caja'],
 ['2026-03-10', 'Nocturno', 'L1', '4426', 371, 3, 'Burbuja en techo'], ['2026-03-10', 'Nocturno', 'L2', '4427', 297, 4, 'Holgura en puerta'], ['2026-03-10', 'Nocturno', 'L3', '4482', 266, 5, 'Soldadura incompleta'],
];
export const SAMPLE_QUAL = ['fecha,turno,linea,lote,piezas_revisadas,piezas_rechazadas,defecto_principal', ...QUAL.map(r => r.join(','))].join('\n');
export const SAMPLE_STOPS = ['fecha,turno,linea,inicio,minutos,causa', ...[
 ['2026-03-09', 'Matutino', 'L2', '08:40', 18, 'Cambio de modelo'], ['2026-03-09', 'Vespertino', 'L2', '16:10', 64, 'Falla en robot de soldadura'], ['2026-03-09', 'Vespertino', 'L1', '19:05', 22, 'Falta de material'],
 ['2026-03-09', 'Nocturno', 'L3', '01:30', 41, ''], ['2026-03-09', 'Nocturno', 'L3', '04:15', 15, 'Ajuste de herramental'], ['2026-03-10', 'Matutino', 'L3', '09:20', 20, 'Cambio de modelo'],
 ['2026-03-10', 'Vespertino', 'L1', '15:40', 48, 'Falla en robot de soldadura'], ['2026-03-10', 'Vespertino', 'L2', '18:30', 12, 'Falta de material'], ['2026-03-10', 'Nocturno', 'L2', '02:00', 16, 'Ajuste de herramental'],
 ['2026-03-10', 'Nocturno', 'L1', '23:50', 10, 'Falta de material'],
].map(r => r.join(','))].join('\n');
