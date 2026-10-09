#!/usr/bin/env node
// Corre un entregable en modo borrador desde la consola. Lo usan las rutinas programadas.
//   node scripts/correr.mjs daily
//   node scripts/correr.mjs daily --espacio ~/otra-carpeta
// El borrador queda en el espacio y se ve en la interfaz. No manda nada a ningún lado.
const args = process.argv.slice(2);
const i = args.indexOf('--espacio');
if (i >= 0 && args[i + 1]) process.env.ORQ_ESPACIO = args[i + 1];
const entregable = args.find((a, n) => !a.startsWith('--') && args[n - 1] !== '--espacio');

const { estadoEspacio, asegurarEspacio } = await import('../lib/espacio.mjs');
const { correrEntregable } = await import('../lib/orquestacion.mjs');
const { leerCorrida } = await import('../lib/corridas.mjs');

await asegurarEspacio();
const { config } = estadoEspacio();
if (!entregable) {
  console.log(`Uso: node scripts/correr.mjs <entregable>\nEntregables: ${Object.keys(config?.entregables || {}).join(', ')}`);
  process.exit(1);
}

const origen = process.stdin.isTTY ? 'consola' : 'rutina';
const { id } = await correrEntregable({
  entregable,
  origen,
  alTerminar: (r) => {
    const c = leerCorrida(id);
    console.log(`\nCorrida ${id}: ${c.meta.estado}${r.costo != null ? ` (US$ ${r.costo.toFixed(3)})` : ''}`);
    if (c.borrador) console.log(`\n${c.borrador}\n`);
    else console.log(c.meta.error || r.error || 'Sin borrador');
    process.exit(c.borrador ? 0 : 1);
  },
});
console.log(`Corriendo ${entregable} en modo borrador (${id})…`);
