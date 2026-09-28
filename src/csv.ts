import { toNumber } from './quality.ts';
export type CsvFixes = { blank: number; short: number; long: number };
export type CsvData = { headers: string[]; rows: string[][]; fixes?: CsvFixes };

// Excel en español guarda los CSV en Windows-1252 y el «Texto Unicode» en UTF-16: se detecta solo.
export function decodeBytes(buf: ArrayBuffer): string {
 const b = new Uint8Array(buf);
 if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b);
 if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b);
 try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { return new TextDecoder('windows-1252').decode(b); }
}

// Lector tolerante, como Excel: salta líneas vacías, rellena filas cortas y convierte los datos de más en columnas.
// Nunca descarta contenido; lo que ajusta lo cuenta en `fixes`.
export function parseCsv(source: string): CsvData {
 const text = source.replace(/^﻿/, '');
 if (!text.trim()) throw new Error('EMPTY');
 const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0, '|': 0 };
 let quoted = false;
 for (let i = 0; i < text.length; i++) {
  const c = text[i];
  if (c === '"') { if (quoted && text[i + 1] === '"') i++; else quoted = !quoted; }
  if (!quoted) { if (c === '\n' || c === '\r') break; if (c in counts) counts[c]++; }
 }
 const [best, seen] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
 const delimiter = seen > 0 ? best : ',';
 const records: string[][] = [];
 let row: string[] = [], value = '', inQuotes = false, closed = false;
 const cell = () => { row.push(value); value = ''; closed = false; };
 const record = () => { cell(); records.push(row); row = []; };
 for (let i = 0; i < text.length; i++) {
  const c = text[i];
  if (inQuotes) {
   if (c === '"') { if (text[i + 1] === '"') { value += '"'; i++; } else { inQuotes = false; closed = true; } }
   else value += c;
  } else if (c === delimiter) cell();
  else if (c === '\r' || c === '\n') { record(); if (c === '\r' && text[i + 1] === '\n') i++; }
  else if (c === '"' && value === '' && !closed) inQuotes = true;
  else if (closed) throw new Error(`INVALID_QUOTE:${records.length + 1}`);
  else value += c; // una comilla suelta en medio (5" tornillo) se queda como texto
 }
 if (inQuotes) throw new Error(`UNCLOSED_QUOTE:${records.length + 1}`);
 if (value !== '' || row.length || closed) record();
 const fixes: CsvFixes = { blank: 0, short: 0, long: 0 };
 const isEmpty = (r: string[]) => r.every(v => v === '');
 while (records.length && isEmpty(records[0])) { records.shift(); fixes.blank++; }
 while (records.length > 1 && isEmpty(records[records.length - 1])) { records.pop(); fixes.blank++; }
 if (!records.length) throw new Error('EMPTY');
 const rawHeaders = records.shift()!;
 // Una línea vacía sólo es «de sobra» si tiene menos celdas que el encabezado; en un archivo
 // de una columna es una celda vacía de verdad y se conserva.
 const kept = records.filter(r => { const skip = isEmpty(r) && r.length < rawHeaders.length; if (skip) fixes.blank++; return !skip; });
 let width = rawHeaders.length;
 kept.forEach(r => {
  while (r.length > width && r[r.length - 1] === '') r.pop(); // «1,2,» con coma de más
  if (r.length > width) { fixes.long++; width = r.length; }
 });
 kept.forEach(r => { if (r.length < width) { if (r.length < rawHeaders.length) fixes.short++; while (r.length < width) r.push(''); } });
 while (rawHeaders.length < width) rawHeaders.push('');
 const used = new Set<string>();
 const reserved = new Set(rawHeaders.map(h => h.trim()).filter(Boolean));
 const headers = rawHeaders.map((h, index) => {
  const base = h.trim() || `Column ${index + 1}`;
  let name = base, suffix = 2;
  while (used.has(name) || (name !== base && reserved.has(name))) name = `${base} (${suffix++})`;
  used.add(name); return name;
 });
 return { headers, rows: kept, fixes };
}

export function cleanRows(rows:string[][],trim:boolean,dedupe:boolean):string[][] {
 const seen=new Set<string>();
 return rows.map(row=>row.map(v=>trim?v.trim():v)).filter(row=>{
  const key=JSON.stringify(row);if(dedupe&&seen.has(key))return false;seen.add(key);return true;
 });
}
export function summarize(rows:string[][]) {
 return {rows:rows.length,missing:rows.reduce((n,r)=>n+r.filter(v=>!v.trim()).length,0),duplicates:rows.length-new Set(rows.map(r=>JSON.stringify(r))).size};
}
export function exportCsv(headers:string[],rows:string[][]):string {
 const encode=(value:string)=>{
  const negativeNumber=/^-\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value.trim());
  const safe=/^[\s\u0000-\u001f]*[=+@-]/.test(value)&&!negativeNumber?`'${value}`:value;
  return /[",\r\n]/.test(safe)?`"${safe.replace(/"/g,'""')}"`:safe;
 };
 return [headers,...rows].map(row=>row.map(encode).join(',')).join('\r\n');
}

export type ColumnKind = 'number' | 'date' | 'category' | 'text';
export type ColumnProfile = { name: string; kind: ColumnKind; filled: number; blanks: number; unique: number; top: [string, number][]; min?: number; max?: number; median?: number; numbers?: number[]; from?: string; to?: string; perDay?: [string, number][] };

const isoOf = (v: string) => { const t = v.trim(); if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10); const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; };

export function profileColumns(headers: string[], rows: string[][]): ColumnProfile[] {
 return headers.map((name, index) => {
  const values = rows.map(r => (r[index] ?? '').trim());
  const present = values.filter(Boolean);
  const counts = new Map<string, number>();
  present.forEach(v => counts.set(v, (counts.get(v) ?? 0) + 1));
  const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const numbers = present.map(toNumber);
  let kind: ColumnKind = 'text';
  if (present.length && numbers.every(n => !Number.isNaN(n))) kind = 'number';
  else if (present.length && present.every(v => isoOf(v))) kind = 'date';
  else if (present.length && counts.size <= Math.max(3, present.length * 0.6)) kind = 'category';
  const profile: ColumnProfile = { name, kind, filled: values.length ? present.length / values.length : 0, blanks: values.length - present.length, unique: counts.size, top };
  if (kind === 'number') { const sorted = [...numbers].sort((a, b) => a - b); profile.numbers = numbers; profile.min = sorted[0]; profile.max = sorted[sorted.length - 1]; profile.median = sorted[Math.floor(sorted.length / 2)]; }
  if (kind === 'date') { const days = new Map<string, number>(); present.forEach(v => { const d = isoOf(v); days.set(d, (days.get(d) ?? 0) + 1); }); profile.perDay = [...days].sort(); profile.from = profile.perDay[0][0]; profile.to = profile.perDay[profile.perDay.length - 1][0]; }
  return profile;
 });
}
