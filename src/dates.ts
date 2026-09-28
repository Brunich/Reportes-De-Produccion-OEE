// Fechas como las escribe la gente en México: 2026-03-02, 02/03/2026, 2-mar-2026, «2 de marzo de 2026»,
// con o sin hora. Día antes que mes (formato de México); sólo acepta fechas que existen.
export type DateShape = 'iso' | 'dmy' | 'text';
export type ParsedDate = { iso: string; time: string; shape: DateShape };

const MONTHS: Record<string, number> = {};
[['ene', 'enero', 'jan', 'january'], ['feb', 'febrero', 'february'], ['mar', 'marzo', 'march'], ['abr', 'abril', 'apr', 'april'],
 ['may', 'mayo'], ['jun', 'junio', 'june'], ['jul', 'julio', 'july'], ['ago', 'agosto', 'aug', 'august'],
 ['sep', 'sept', 'septiembre', 'setiembre', 'september'], ['oct', 'octubre', 'october'], ['nov', 'noviembre', 'november'], ['dic', 'diciembre', 'dec', 'december'],
].forEach((names, i) => names.forEach(n => { MONTHS[n] = i + 1; }));

const TIME = String.raw`(?:[ T](\d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]\.?\s?m\.?)?))?`;
const RE_ISO = new RegExp(String.raw`^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})${TIME}$`, 'i');
const RE_DMY = new RegExp(String.raw`^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})${TIME}$`, 'i');
const RE_TXT = new RegExp(String.raw`^(\d{1,2})(?:\s+de)?[\s-]+([a-zé]{3,10})\.?(?:\s+de)?[\s-]+(\d{4}|\d{2})${TIME}$`, 'i');
const RE_MDY_TXT = new RegExp(String.raw`^([a-z]{3,10})\.?\s+(\d{1,2}),?\s+(\d{4})${TIME}$`, 'i');

const year = (y: string) => y.length === 2 ? 2000 + Number(y) : Number(y);
function valid(y: number, m: number, d: number) {
 if (m < 1 || m > 12 || d < 1 || y < 1900 || y > 2100) return false;
 return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const month = (s: string) => MONTHS[s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')];

// Las columnas de fecha repiten mucho el mismo valor: se recuerda lo ya leído (con tope, para no crecer sin fin).
const seen = new Map<string, ParsedDate | null>();
export function parseDate(value: string): ParsedDate | null {
 const hit = seen.get(value);
 if (hit !== undefined) return hit;
 const out = read(value);
 if (seen.size > 20000) seen.clear();
 seen.set(value, out);
 return out;
}
function read(value: string): ParsedDate | null {
 const t = value.trim();
 // Descarte rápido: una fecha empieza con número o con el nombre del mes y no es larga.
 if (!t || t.length > 32 || !/^[\dA-Za-zé]/.test(t) || !/\d/.test(t)) return null;
 let m = RE_ISO.exec(t);
 if (m) { const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]; return valid(y, mo, d) ? { iso: iso(y, mo, d), time: m[4] ?? '', shape: 'iso' } : null; }
 m = RE_DMY.exec(t);
 if (m) { const [d, mo, y] = [Number(m[1]), Number(m[2]), year(m[3])]; return valid(y, mo, d) ? { iso: iso(y, mo, d), time: m[4] ?? '', shape: 'dmy' } : null; }
 m = RE_TXT.exec(t);
 if (m) { const mo = month(m[2]), [d, y] = [Number(m[1]), year(m[3])]; return mo && valid(y, mo, d) ? { iso: iso(y, mo, d), time: m[4] ?? '', shape: 'text' } : null; }
 m = RE_MDY_TXT.exec(t);
 if (m) { const mo = month(m[1]), [d, y] = [Number(m[2]), Number(m[3])]; return mo && valid(y, mo, d) ? { iso: iso(y, mo, d), time: m[4] ?? '', shape: 'text' } : null; }
 return null;
}

// Forma canónica: AAAA-MM-DD, y la hora detrás si la tenía.
export const toIso = (value: string) => { const p = parseDate(value); return p ? (p.time ? `${p.iso} ${p.time}` : p.iso) : null; };
