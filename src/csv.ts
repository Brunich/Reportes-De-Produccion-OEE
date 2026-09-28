import { toNumber } from './quality.ts';
export type CsvData = { headers: string[]; rows: string[][] };

export function parseCsv(source: string): CsvData {
 const text = source.replace(/^\uFEFF/, '');
 if (!text.trim()) throw new Error('EMPTY');
 let quoted = false, commas = 0, semicolons = 0;
 for (let i=0;i<text.length;i++) {
  const c=text[i];
  if(c==='"') { if(quoted && text[i+1]==='"') i++; else quoted=!quoted; }
  if(!quoted) { if(c==='\n'||c==='\r') break; if(c===',') commas++; if(c===';') semicolons++; }
 }
 const delimiter=semicolons>commas?';':',';
 const records:string[][]=[];
 let row:string[]=[], value='', inQuotes=false, closed=false;
 const cell=()=>{row.push(value);value='';closed=false;};
 const record=()=>{cell();records.push(row);row=[];};
 for(let i=0;i<text.length;i++) {
  const c=text[i];
  if(inQuotes) {
   if(c==='"') {if(text[i+1]==='"'){value+='"';i++;}else{inQuotes=false;closed=true;}}
   else value+=c;
  } else if(c===delimiter) cell();
  else if(c==='\r'||c==='\n') {record();if(c==='\r'&&text[i+1]==='\n')i++;}
  else if(c==='"' && value==='' && !closed) inQuotes=true;
  else if(c==='"'||closed) throw new Error(`INVALID_QUOTE:${records.length+1}`);
  else value+=c;
 }
 if(inQuotes) throw new Error(`UNCLOSED_QUOTE:${records.length+1}`);
 if(value!==''||row.length||closed)record();
 const rawHeaders=records.shift()!;
 const used=new Set<string>();
 const reserved=new Set(rawHeaders.map(h=>h.trim()).filter(Boolean));
 const headers=rawHeaders.map((h,index)=>{
  const base=h.trim()||`Column ${index+1}`;
  let name=base, suffix=2;
  while(used.has(name)||(name!==base&&reserved.has(name)))name=`${base} (${suffix++})`;
  used.add(name);return name;
 });
 records.forEach((r,i)=>{if(r.length!==headers.length)throw new Error(`ROW_WIDTH:${i+2}:${headers.length}:${r.length}`);});
 return {headers,rows:records};
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
