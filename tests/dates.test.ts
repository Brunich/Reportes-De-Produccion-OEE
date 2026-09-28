import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDate, toIso } from '../src/dates.ts';
import { detectIssues } from '../src/quality.ts';
import { parseCsv, profileColumns } from '../src/csv.ts';

test('lee las fechas como las escribe la gente en México', () => {
 const cases: [string, string | null][] = [
  ['2026-03-02', '2026-03-02'], ['2026/3/2', '2026-03-02'], ['02/03/2026', '2026-03-02'], ['2-3-2026', '2026-03-02'], ['02.03.26', '2026-03-02'],
  ['2 mar 2026', '2026-03-02'], ['2-mar-2026', '2026-03-02'], ['2 de marzo de 2026', '2026-03-02'], ['02-Mar-26', '2026-03-02'], ['Mar 2, 2026', '2026-03-02'],
  ['2026-03-02 14:00', '2026-03-02 14:00'], ['02/03/2026 7:05 p.m.', '2026-03-02 7:05 p.m.'], ['1 sept 2026', '2026-09-01'], ['3 dic. 2026', '2026-12-03'],
 ];
 for (const [v, want] of cases) assert.equal(toIso(v), want, v);
});

test('no inventa fechas: 31 de febrero, mes 13 o números sueltos no son fecha', () => {
 for (const v of ['31/02/2026', '12/13/2026', '2026-02-30', '120', '3.14', 'marzo', '2 foo 2026', '']) assert.equal(parseDate(v), null, v);
 assert.equal(toIso('29/02/2028'), '2028-02-29'); // bisiesto
});

test('una columna con fechas en varias formas se marca y se convierte; una sola forma no', () => {
 const { headers, rows } = parseCsv('fecha,n\n2026-03-02,1\n3 mar 2026,2\n04/03/2026 08:30,3');
 const issue = detectIssues(headers, rows).find(i => i.id === 'date-0');
 assert.ok(issue);
 assert.equal(issue!.cells.length, 2);
 assert.deepEqual(issue!.fix!(rows).map(r => r[0]), ['2026-03-02', '2026-03-03', '2026-03-04 08:30']);
 assert.equal(profileColumns(headers, rows)[0].kind, 'date');
 const same = parseCsv('fecha\n2 mar 2026\n3 mar 2026');
 assert.ok(!detectIssues(same.headers, same.rows).some(i => i.id === 'date-0'));
 assert.equal(profileColumns(same.headers, same.rows)[0].kind, 'date');
});
