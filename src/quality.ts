// Revisión de calidad de un CSV: qué está mal, dónde, y cómo arreglarlo sin adivinar.
// Las reglas sólo corrigen solas lo que es mecánico; lo que requiere criterio se marca para revisión.
import { parseDate, toIso } from './dates.ts';
export type Severity = 'high' | 'medium' | 'low' | 'info';
export type Issue = {
 id: string; severity: Severity; column?: number;
 title: [string, string]; detail: [string, string]; example?: string;
 cells: [number, number][]; rows?: number[];
 fix?: (rows: string[][]) => string[][]; fixLabel?: [string, string]; fixDone?: [string, string];
};

const fold = (v: string) => v.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
const THOUSANDS = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/, PLAIN = /^-?\d+(\.\d+)?$/;
export const toNumber = (v: string) => { const t = v.trim(); return THOUSANDS.test(t) ? Number(t.replace(/,/g, '')) : PLAIN.test(t) ? Number(t) : NaN; };
const line = (r: number) => r + 2; // fila en el archivo: la 1 es el encabezado
// En un empate gana la forma «bien escrita»: mayúscula inicial, con acentos y nunca TODO EN MAYÚSCULAS.
const tidy = (v: string) => (/^\p{Lu}/u.test(v) ? 2 : 0) + (/[À-ſ]/.test(v) ? 1 : 0) - (v === v.toUpperCase() && /\p{L}{2}/u.test(v) ? 3 : 0);
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// CURP: el último carácter es un dígito verificador sobre los 17 anteriores.
const CURP_ABC = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';
export function curpOk(v: string) {
 if (!/^[A-Z][AEIOUX][A-Z]{2}\d{6}[HMX][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z\d]\d$/.test(v)) return false;
 const sum = [...v.slice(0, 17)].reduce((s, ch, i) => s + CURP_ABC.indexOf(ch) * (18 - i), 0);
 return (10 - sum % 10) % 10 === Number(v[17]);
}
const upper = (v: string) => v.toUpperCase().replace(/[\s.-]/g, '');
const MX: { col: RegExp; name: [string, string]; bad: string; rule: [string, string]; ok: (v: string) => boolean; fmt: (v: string) => string }[] = [
 { col: /^rfc\b|\brfc$/, name: ['RFC', 'RFC'], bad: 'RFC inválido', rule: ['3 o 4 letras, 6 dígitos de fecha y 3 de homoclave', '3–4 letters, 6 date digits, 3-char check'],
  ok: v => /^[A-ZÑ&]{3,4}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[A-Z\d]{3}$/.test(v), fmt: upper },
 { col: /^curp\b|\bcurp$/, name: ['CURP', 'CURP'], bad: 'CURP inválida', rule: ['18 caracteres con dígito verificador', '18 chars with check digit'], ok: curpOk, fmt: upper },
 { col: /correo|e-?mail|^mail$/, name: ['correo', 'email'], bad: 'Correo inválido', rule: ['nombre@dominio.algo', 'name@domain.tld'],
  ok: v => /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(v), fmt: v => v.toLowerCase().replace(/\s/g, '') },
 { col: /telefono|tel\b|^tel|celular|whats|movil/, name: ['teléfono', 'phone'], bad: 'Teléfono inválido', rule: ['10 dígitos', '10 digits'],
  ok: v => /^\d{10}$/.test(v), fmt: v => { const d = v.replace(/\D/g, ''); return d.length === 12 && d.startsWith('52') ? d.slice(2) : d.length === 13 && d.startsWith('521') ? d.slice(3) : d; } },
 { col: /^(c\.? ?p\.?|codigo postal|cod postal)$/, name: ['código postal', 'postal code'], bad: 'CP inválido', rule: ['5 dígitos', '5 digits'],
  ok: v => /^\d{5}$/.test(v), fmt: v => /^\d{4}$/.test(v) ? '0' + v : v.replace(/\s/g, '') },
];

export function detectIssues(headers: string[], rows: string[][]): Issue[] {
 const issues: Issue[] = [];
 const col = (c: number) => rows.map(r => r[c] ?? '');

 // 1. Reglas de negocio: más rechazadas que revisadas, o negativos en conteos.
 const rej = headers.findIndex(h => /rechaz/i.test(h)), rev = headers.findIndex(h => /revis|inspecc/i.test(h));
 if (rej >= 0 && rev >= 0) {
  const bad = rows.map((r, i) => [i, toNumber(r[rej]), toNumber(r[rev])] as const).filter(([, a, b]) => a > b);
  if (bad.length) issues.push({ id: 'rule-rej', severity: 'high', column: rej, title: ['Más rechazadas que revisadas', 'More rejected than inspected'],
   detail: [`${plural(bad.length, 'fila', 'filas')} (${bad.map(([i]) => line(i)).join(', ')}) reporta más piezas rechazadas que revisadas. Suele ser un dígito de más al capturar; necesita que alguien lo confirme.`, `${plural(bad.length, 'row', 'rows')} (${bad.map(([i]) => line(i)).join(', ')}) report more rejected than inspected parts. Usually an extra digit at entry; someone must confirm it.`],
   example: bad.map(([i, a, b]) => `${rows[i][0]}: ${a} / ${b}`)[0], cells: bad.flatMap(([i]) => [[i, rej], [i, rev]] as [number, number][]), rows: bad.map(([i]) => i) });
 }
 headers.forEach((h, c) => {
  if (!/dias|días|piezas|cantidad|unidades|monto/i.test(h)) return;
  const neg = col(c).map((v, i) => [i, toNumber(v)] as const).filter(([, n]) => n < 0);
  if (neg.length) issues.push({ id: `neg-${c}`, severity: 'high', column: c, title: [`Negativos en «${h}»`, `Negative values in “${h}”`],
   detail: [`Un conteo no puede ser negativo: fila ${neg.map(([i]) => line(i)).join(', ')}. Revísalo a mano.`, `A count cannot be negative: row ${neg.map(([i]) => line(i)).join(', ')}. Review it by hand.`],
   example: `${h} = ${neg[0][1]}`, cells: neg.map(([i]) => [i, c] as [number, number]) });
 });

 // 2. Filas repetidas exactas (exportaciones dobles).
 const seen = new Map<string, number>(), dup: [number, number][] = [];
 rows.forEach((r, i) => { const k = JSON.stringify(r.map(v => v.trim())); if (seen.has(k)) dup.push([i, seen.get(k)!]); else seen.set(k, i); });
 if (dup.length) issues.push({ id: 'dup', severity: 'medium', title: ['Filas repetidas', 'Duplicate rows'],
  detail: [cap(dup.map(([i, j]) => `la fila ${line(i)} repite la ${line(j)}`).join('; ')) + '. Pasa cuando un reporte se exporta dos veces.', cap(dup.map(([i, j]) => `row ${line(i)} repeats row ${line(j)}`).join('; ')) + '. Typical when a report is exported twice.'],
  example: `fila ${line(dup[0][0])} = fila ${line(dup[0][1])} → se queda una`, cells: dup.flatMap(([i]) => headers.map((_, c) => [i, c] as [number, number])), rows: dup.map(([i]) => i),
  fix: rs => { const s = new Set<string>(); return rs.filter(r => { const k = JSON.stringify(r.map(v => v.trim())); if (s.has(k)) return false; s.add(k); return true; }); },
  fixLabel: ['Quitar repetidas', 'Remove duplicates'], fixDone: [`Quité ${plural(dup.length, 'fila repetida', 'filas repetidas')}`, `Removed ${plural(dup.length, 'duplicate row', 'duplicate rows')}`] });

 headers.forEach((h, c) => {
  const values = col(c), present = values.filter(v => v.trim());
  // 3. Mismo valor escrito distinto (mayúsculas, acentos, espacios).
  const groups = new Map<string, Map<string, number>>();
  present.forEach(v => { const k = fold(v), t = v.trim(); if (!groups.has(k)) groups.set(k, new Map()); groups.get(k)!.set(t, (groups.get(k)!.get(t) ?? 0) + 1); });
  const messy = [...groups.values()].filter(g => g.size > 1);
  if (messy.length && groups.size <= Math.max(4, present.length * 0.6)) {
   const canon = new Map<string, string>();
   messy.forEach(g => { const best = [...g].sort((a, b) => b[1] - a[1] || tidy(b[0]) - tidy(a[0]))[0][0]; g.forEach((_, form) => canon.set(fold(form), best)); });
   const cells = values.map((v, i) => [i, v] as const).filter(([, v]) => v.trim() && canon.has(fold(v)) && v.trim() !== canon.get(fold(v))).map(([i]) => [i, c] as [number, number]);
   const forms = messy.map(g => [...g.keys()].map(f => `«${f}»`).join(' / '));
   issues.push({ id: `case-${c}`, severity: 'medium', column: c, title: [`«${h}» escrito de varias formas`, `“${h}” written several ways`],
    detail: [`${forms.join('; ')}. Para contar y agrupar deben ser un solo valor; se unifica con la forma más usada.`, `${forms.join('; ')}. To count and group they must be one value; unified to the most common form.`],
    example: cells.length ? `«${values[cells[0][0]].trim()}» → «${canon.get(fold(values[cells[0][0]]))}»` : forms[0], cells,
    fix: rs => rs.map(r => r.map((v, j) => j === c && v.trim() && canon.has(fold(v)) ? canon.get(fold(v))! : v)),
    fixLabel: ['Unificar', 'Unify'], fixDone: [`Unifiqué ${plural(cells.length, 'valor', 'valores')} en «${h}»`, `Unified ${plural(cells.length, 'value', 'values')} in “${h}”`] });
  }
  // 4. Fechas escritas de varias formas (02/03/2026, 2-mar-2026, 2026-03-02…): mezcladas se ordenan mal.
  // Se corta en el primer valor que no es fecha: en columnas de texto cuesta una sola lectura.
  const shapes = new Set<string>(); let allDates = present.length > 0;
  for (const v of present) { const p = parseDate(v); if (!p) { allDates = false; break; } shapes.add(p.shape); }
  if (allDates && shapes.size > 1) {
   const cells = values.map((v, i) => [i, v.trim() ? parseDate(v) : null] as const).filter(([, p]) => p && p.shape !== 'iso').map(([i]) => [i, c] as [number, number]);
   const n = cells.length, first = values[cells[0][0]].trim();
   issues.push({ id: `date-${c}`, severity: 'medium', column: c, title: [`Fechas en ${shapes.size} formatos en «${h}»`, `${shapes.size} date formats in “${h}”`],
    detail: [`${present.length - n} en AAAA-MM-DD y ${n} escritas de otra forma. Mezcladas se ordenan mal; se convierten a AAAA-MM-DD leyendo día antes que mes (formato de México).`, `${present.length - n} as YYYY-MM-DD and ${n} written another way. Mixed, they sort wrong; converted to YYYY-MM-DD reading day before month (Mexican format).`],
    example: `${first} → ${toIso(first)}`, cells,
    fix: rs => rs.map(r => r.map((v, j) => j === c && v.trim() ? toIso(v) ?? v : v)),
    fixLabel: ['Convertir', 'Convert'], fixDone: [`Convertí ${plural(n, 'fecha', 'fechas')} a AAAA-MM-DD`, `Converted ${plural(n, 'date', 'dates')} to YYYY-MM-DD`] });
  }
  // 5. Números con separador de miles, guardados como texto.
  const thousands = values.map((v, i) => [i, v] as const).filter(([, v]) => THOUSANDS.test(v.trim()));
  if (thousands.length && present.every(v => THOUSANDS.test(v.trim()) || PLAIN.test(v.trim()))) {
   issues.push({ id: `num-${c}`, severity: 'low', column: c, title: [`Separador de miles en «${h}»`, `Thousands separator in “${h}”`],
    detail: [`Excel lo mostraría como texto y no lo sumaría. Se quita la coma.`, `Excel would treat it as text and not add it up. The comma is removed.`],
    example: `${thousands[0][1]} → ${thousands[0][1].replace(/,/g, '')}`, cells: thousands.map(([i]) => [i, c] as [number, number]),
    fix: rs => rs.map(r => r.map((v, j) => j === c && THOUSANDS.test(v.trim()) ? v.trim().replace(/,/g, '') : v)),
    fixLabel: ['Quitar comas', 'Remove commas'], fixDone: [`Normalicé ${plural(thousands.length, 'número', 'números')} en «${h}»`, `Normalized ${plural(thousands.length, 'number', 'numbers')} in “${h}”`] });
  }
  // 6. Vacíos: se señalan, no se inventan.
  const blanks = values.map((v, i) => [i, v] as const).filter(([, v]) => !v.trim());
  if (blanks.length) issues.push({ id: `blank-${c}`, severity: 'info', column: c, title: [`Vacíos en «${h}»`, `Blanks in “${h}”`],
   detail: [`${plural(blanks.length, 'celda vacía', 'celdas vacías')} (fila ${blanks.map(([i]) => line(i)).join(', ')}). No se rellenan solas: completar un dato es una decisión.`, `${plural(blanks.length, 'blank cell', 'blank cells')} (row ${blanks.map(([i]) => line(i)).join(', ')}). Not filled automatically: completing data is a decision.`],
   cells: blanks.map(([i]) => [i, c] as [number, number]) });
 });

 // 7. Espacios sobrantes.
 const spaced: [number, number][] = [];
 rows.forEach((r, i) => r.forEach((v, c) => { if (v !== v.trim()) spaced.push([i, c]); }));
 if (spaced.length) issues.push({ id: 'trim', severity: 'low', title: ['Espacios sobrantes', 'Extra spaces'],
  detail: [`${plural(spaced.length, 'celda empieza o termina', 'celdas empiezan o terminan')} con espacios: «Pintura» y «Pintura » no cuentan como lo mismo.`, `${plural(spaced.length, 'cell starts or ends', 'cells start or end')} with spaces: “Paint” and “Paint ” don’t count as the same.`],
  example: `«${rows[spaced[0][0]][spaced[0][1]]}» → «${rows[spaced[0][0]][spaced[0][1]].trim()}»`, cells: spaced,
  fix: rs => rs.map(r => r.map(v => v.trim())), fixLabel: ['Recortar', 'Trim'], fixDone: [`Recorté espacios en ${plural(spaced.length, 'celda', 'celdas')}`, `Trimmed ${plural(spaced.length, 'cell', 'cells')}`] });

 // 8. Datos de México: RFC, CURP, correo, teléfono y código postal. Lo que se arregla sólo con dar formato
 // (mayúsculas, guiones, lada +52, el cero que Excel le quita al CP) se corrige; lo que sigue mal se marca.
 headers.forEach((h, c) => {
  const spec = MX.find(m => m.col.test(fold(h)));
  if (!spec) return;
  const bad = col(c).map((v, i) => [i, v.trim()] as const).filter(([, v]) => v && !spec.ok(v));
  if (!bad.length) return;
  const fixable = bad.filter(([, v]) => spec.ok(spec.fmt(v)));
  const [, first] = fixable[0] ?? bad[0];
  issues.push({ id: `mx-${c}`, severity: fixable.length ? 'low' : 'medium', column: c, title: [`${spec.bad} en «${h}»`, `Invalid ${spec.name[1]} in “${h}”`],
   detail: [`${plural(bad.length, 'valor no cumple', 'valores no cumplen')} el formato de ${spec.name[0]} (${spec.rule[0]}).${fixable.length ? ` ${plural(fixable.length, 'se corrige', 'se corrigen')} sólo con dar formato.` : ''}${bad.length > fixable.length ? ` ${plural(bad.length - fixable.length, 'queda', 'quedan')} para revisar a mano.` : ''}`,
    `${plural(bad.length, 'value does not', 'values do not')} match the ${spec.name[1]} format (${spec.rule[1]}).${fixable.length ? ` ${fixable.length} fixed by formatting alone.` : ''}${bad.length > fixable.length ? ` ${bad.length - fixable.length} left to review by hand.` : ''}`],
   example: fixable.length ? `${first} → ${spec.fmt(first)}` : first, cells: bad.map(([i]) => [i, c] as [number, number]),
   ...(fixable.length ? { fix: (rs: string[][]) => rs.map(r => r.map((v, j) => j === c && v.trim() && !spec.ok(v.trim()) && spec.ok(spec.fmt(v.trim())) ? spec.fmt(v.trim()) : v)),
    fixLabel: ['Dar formato', 'Format'] as [string, string], fixDone: [`Di formato a ${plural(fixable.length, 'valor', 'valores')} en «${h}»`, `Formatted ${plural(fixable.length, 'value', 'values')} in “${h}”`] as [string, string] } : {}) });
 });

 const order: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 };
 return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}
