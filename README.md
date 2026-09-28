# Planta: consolidador y OEE

[![CI](https://github.com/Brunich/planta-oee/actions/workflows/ci.yml/badge.svg)](https://github.com/Brunich/planta-oee/actions/workflows/ci.yml)

*Tres reportes, un OEE, cero copiar y pegar.*

Subes el Excel de producción, el de calidad y el de detenciones del turno. Se cruzan solos, se marcan las incoherencias, sale el OEE (eficiencia general del equipo) de cada línea y el reporte listo en Excel.

![Captura de Planta: consolidador y OEE](docs/captura.png)

**Pruébalo en vivo:** [bruno-portfolio-azure.vercel.app/proyectos/planta](https://bruno-portfolio-azure.vercel.app/proyectos/planta)

## Cómo funciona

1. **Sube.** Producción, calidad y detenciones en Excel o CSV. Reconoce las columnas por nombre, aunque vengan con acentos o en otro orden.
2. **Cruza.** Une cada lote por fecha, turno y línea, y marca las incoherencias: lotes sin inspección, inspecciones de lotes que no existen, rechazo alto, plan incumplido.
3. **Mide.** OEE (eficiencia general del equipo) por línea: disponibilidad × rendimiento × calidad, dónde se pierde el tiempo y el Pareto de detenciones. Sale en Excel o por WhatsApp.

## Qué hay adentro

| Archivo | Qué hace |
| --- | --- |
| `src/planta-logic.ts` | Reconoce las columnas por nombre, cruza los tres archivos por fecha, turno, línea y lote, aplica las reglas de excepción y calcula el OEE. |
| `src/Planta.tsx` | Las tres ranuras de archivo (con columnas asignables a mano), los anillos de OEE por línea, el Pareto de paros, la comparación por turno, las excepciones revisadas y la descarga del reporte. |
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

---

Parte del [portafolio de Bruno Salas](https://bruno-portfolio-azure.vercel.app) · [GitHub](https://github.com/Brunich)
