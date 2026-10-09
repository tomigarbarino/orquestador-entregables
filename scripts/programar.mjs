#!/usr/bin/env node
// Arma las rutinas programadas a partir de la config.
//   node scripts/programar.mjs            muestra el plan (no cambia nada)
//   node scripts/programar.mjs --aplicar  lo aplica, después de pedir confirmación
import readline from 'node:readline/promises';
import { estadoEspacio, asegurarEspacio } from '../lib/espacio.mjs';
import { entregablesDe } from '../lib/receta-efectiva.mjs';
import { planRutinas, aplicarRutinas } from '../lib/rutinas.mjs';
import { textoHorario } from '../lib/horario.mjs';

await asegurarEspacio();
const { config, recetas, modulos, validacion } = estadoEspacio();
if (!validacion.ok) {
  console.log('La configuración tiene errores; corregila antes de programar rutinas:');
  for (const e of validacion.errores) console.log(`  ${e.ruta}: ${e.mensaje}`);
  process.exit(1);
}
const plan = planRutinas(entregablesDe(config, recetas, modulos));
console.log(plan.explicacion);
console.log(plan.requisitos);
for (const t of plan.tareas) console.log(`\n- ${t.nombre} (${textoHorario(t)})\n  ${t.comando}`);

if (!process.argv.includes('--aplicar')) {
  console.log('\nEsto es solo el plan. Para aplicarlo: node scripts/programar.mjs --aplicar');
  process.exit(0);
}
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const respuesta = await rl.question(`\n¿Programar ${plan.tareas.length} rutinas en esta computadora? (s/N) `);
rl.close();
if (!/^s(i|í)?$/i.test(respuesta.trim())) {
  console.log('No se programó nada.');
  process.exit(0);
}
for (const r of await aplicarRutinas(plan)) console.log(`${r.ok ? '✓' : '✗'} ${r.id}: ${r.detalle}`);
