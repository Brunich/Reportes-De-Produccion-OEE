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

test('turno nocturno que cruza la medianoche y fechas dd/mm de Excel: el lote se cruza igual', () => {
 const prod = parseCsv('fecha,turno,linea,lote,plan,producidas,min programados,ciclo\n09/03/2026,Nocturno,L1,77,100,98,450,60\n2026-03-09,Matutino,L1,78,100,99,450,60');
 // Calidad anota el lote nocturno con el día en que lo inspeccionó (ya 10 de marzo) y otro formato de fecha.
 const qual = parseCsv('fecha,turno,linea,lote,revisadas,rechazadas\n10 mar 2026,noche,Linea 1,77,98,1\n9/3/2026,1,L1,78,99,0');
 const r = consolidate(prod, qual, null);
 assert.equal(r.orphans.length, 0);
 assert.equal(r.lots.filter(l => l.rev !== undefined).length, 2);
 assert.ok(!r.exceptions.some(e => e.rule === 'sin-produccion' || e.rule === 'sin-inspeccion'));
 // Pero un día que no es el anterior sí se marca: no se esconde un error de captura.
 const lejos = consolidate(prod, parseCsv('fecha,turno,linea,lote,revisadas,rechazadas\n12/03/2026,Nocturno,L1,77,98,1\n2026-03-09,Matutino,L1,78,99,0'), null);
 assert.equal(lejos.orphans.length, 1);
});

test('una columna con nombre raro se asigna a mano y manda sobre la adivinada', () => {
 const headers = ['Fecha de producción', 'Turno', 'Línea', 'No. de orden', 'Meta', 'Piezas OK', 'Tiempo disponible', 'Ciclo'];
 const auto = mapColumns('prod', headers);
 assert.deepEqual(auto.missing, ['lote', 'prod']);
 const hand = mapColumns('prod', headers, { lote: 3, prod: 5 });
 assert.deepEqual(hand.missing, []);
 assert.equal(hand.map.lote, 3);
 // Un índice fuera del archivo se ignora.
 assert.deepEqual(mapColumns('prod', headers, { lote: 40 }).missing, ['lote', 'prod']);
});

test('el resumen por turno suma lo de cada turno', () => {
 const r = consolidate(parseCsv(SAMPLE_PROD), parseCsv(SAMPLE_QUAL), parseCsv(SAMPLE_STOPS));
 assert.deepEqual(r.shifts.map(s => s.turno), ['Matutino', 'Vespertino', 'Nocturno']);
 assert.equal(r.shifts.reduce((a, s) => a + s.prod, 0), r.lots.reduce((a, l) => a + l.prod, 0));
 assert.equal(r.shifts.reduce((a, s) => a + s.stops, 0), r.pareto.reduce((a, p) => a + p[1], 0));
});
