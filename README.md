# Planta: consolidador y OEE

[![CI](https://github.com/Brunich/planta-oee/actions/workflows/ci.yml/badge.svg)](https://github.com/Brunich/planta-oee/actions/workflows/ci.yml)

*Tres reportes, un OEE, cero copiar y pegar.*

Subes el Excel de producción, el de calidad y el de paros del turno. Se cruzan solos, sale lo que no cuadra, el OEE de cada línea y el reporte listo en Excel.

![Captura de Planta: consolidador y OEE](docs/captura.png)

**Pruébalo en vivo:** [bruno-portfolio-azure.vercel.app/proyectos/planta](https://bruno-portfolio-azure.vercel.app/proyectos/planta)

## Cómo funciona

1. **Sube.** Producción, calidad y paros en Excel o CSV. Reconoce las columnas por nombre, aunque vengan con acentos o en otro orden.
2. **Cruza.** Une cada lote por fecha, turno y línea, y marca lo que no cuadra: lotes sin inspección, inspecciones de lotes que no existen, rechazo alto, plan incumplido.
3. **Mide.** OEE por línea (disponibilidad × rendimiento × calidad), dónde se pierde el tiempo y el Pareto de paros. Sale en Excel o por WhatsApp.

## Qué hay adentro

| Archivo | Qué hace |
| --- | --- |
| `src/planta-logic.ts` | Reconoce las columnas por nombre, cruza los tres archivos por fecha, turno, línea y lote, aplica las reglas de excepción y calcula el OEE. |
| `src/Planta.tsx` | Las tres ranuras de archivo, los anillos de OEE por línea, el Pareto de paros y la descarga del reporte. |
| `src/csv.ts` | Lector de CSV compartido con el analizador. |

La lógica está separada de la interfaz, así se prueba sin navegador (`tests/`).

## Decisiones

- OEE = disponibilidad × rendimiento × calidad, por línea, con el tiempo planeado de cada turno.
- Las columnas se buscan por nombre y sin acentos: «Línea», «linea» o «LINEA» son la misma.
- SheetJS (Excel) sólo se descarga al subir un .xlsx o al exportar, no al abrir la página.
- El reporte sale en cuatro hojas: resumen, OEE por línea, excepciones y paros.

## Correrlo

```bash
npm install
npm run dev
```

```bash
npm test        # pruebas de la lógica (node:test)
npm run build   # tipos + build de producción
```

Hecho con React 19, TypeScript y Vite. Necesita Node 22 o más nuevo (las pruebas corren TypeScript directo con Node).

## Lo que sigue

- Histórico por semana para ver la tendencia del OEE.
- Metas por línea configurables en vez de fijas.

---

Parte del [portafolio de Bruno Salas](https://bruno-portfolio-azure.vercel.app) · [GitHub](https://github.com/Brunich)
