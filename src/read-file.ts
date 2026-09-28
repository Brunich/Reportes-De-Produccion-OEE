// Lee lo que la gente de verdad tiene: CSV de cualquier Excel, texto separado por tabuladores y hojas .xlsx/.xls.
import { decodeBytes, parseCsv } from './csv.ts';
import type { CsvData } from './csv.ts';

export const TABLE_ACCEPT = '.csv,.tsv,.txt,.xlsx,.xls,text/csv,text/tab-separated-values';
export const isExcel = (name: string) => /\.(xlsx|xls)$/i.test(name);

// Un libro de Excel con varias hojas: abre la pedida, o la primera con datos, y dice cuáles hay.
export type TableData = CsvData & { sheets?: string[]; sheet?: string };
export async function readTable(file: File, want?: string): Promise<TableData> {
 if (!isExcel(file.name) && !/\.(csv|tsv|txt)$/i.test(file.name)) throw new Error('TYPE');
 const buf = await file.arrayBuffer();
 if (!isExcel(file.name)) return parseCsv(decodeBytes(buf));
 const XLSX = await import('xlsx');
 const wb = XLSX.read(buf, { type: 'array', cellDates: true });
 const sheet = (want && wb.SheetNames.includes(want) ? want : undefined) ?? wb.SheetNames.find(n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1 }).length > 1) ?? wb.SheetNames[0];
 const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, raw: false, dateNF: 'yyyy-mm-dd', defval: '' }).map(r => r.map(v => String(v ?? '')));
 // Pasa por el mismo lector que un CSV para heredar sus reglas (filas vacías, anchos, encabezados repetidos).
 const csv = rows.map(r => r.map(v => /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v).join(',')).join('\n');
 return { ...parseCsv(csv), sheets: wb.SheetNames, sheet };
}
