import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../src/csv.ts';
import { consolidate, mapColumns, SAMPLE_PROD, SAMPLE_QUAL, SAMPLE_STOPS } from '../src/planta-logic.ts';

const r = consolidate(parseCsv(SAMPLE_PROD), parseCsv(SAMPLE_QUAL), parseCsv(SAMPLE_STOPS));

test('reconoce las columnas por nombre, sin importar acentos ni mayúsculas', () => {
 assert.deepEqual(mapColumns('prod', ['Fecha', 'Turno', 'Línea', 'Lote', 'Plan', 'Piezas producidas', 'Min programados', 'Ciclo ideal (s)']).missing, []);
 assert.deepEqual(mapColumns('qual', ['fecha', 'turno', 'linea', 'lote']).missing, ['rev', 'rej']);
});

test('encuentra lo que no cuadra entre producción y calidad', () => {
 const rules = r.exceptions.map(e => `${e.rule} ${e.where}`);
 assert.ok(rules.some(x => x.startsWith('sin-inspeccion') && x.includes('lote 4419')));
 assert.ok(rules.some(x => x.startsWith('sin-produccion') && x.includes('lote 4482')), 'lote mal escrito en calidad');
 assert.ok(rules.some(x => x.startsWith('revisadas') && x.includes('lote 4424')));
 assert.ok(rules.some(x => x.startsWith('rechazo') && x.includes('lote 4415')));
 assert.ok(rules.some(x => x.startsWith('paro') && x.includes('L3')));
});

test('el OEE es disponibilidad × rendimiento × calidad', () => {
 const l2 = r.lines.find(l => l.linea === 'L2')!;
 assert.equal(l2.prog, 6 * 450);
 assert.equal(l2.stops, 18 + 64 + 12 + 16);
 assert.ok(Math.abs(l2.oee - l2.A * l2.R * l2.Q) < 1e-9);
 assert.ok(l2.oee > 0.5 && l2.oee < 0.95, `OEE L2 ${l2.oee}`);
 assert.equal(r.pareto[0][0], 'Falla en robot de soldadura');
});
