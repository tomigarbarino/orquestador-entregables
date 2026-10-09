// Tests de la semilla de la demo (ejemplo/demo/semilla): el espacio de ejemplo arranca completo y coherente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dirPrueba = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'orq-semilla-')), 'espacio');
process.env.ORQ_ESPACIO = dirPrueba;

const { rutas, enEspacio } = await import('../lib/rutas.mjs');
const espacio = await import('../lib/espacio.mjs');
const corridas = await import('../lib/corridas.mjs');
const propuestas = await import('../lib/propuestas.mjs');
const historial = await import('../lib/historial.mjs');
const chat = await import('../lib/chat.mjs');
const { estadoFuentes, leerDemo } = await import('../lib/conectores.mjs');
const { entregablesDe } = await import('../lib/receta-efectiva.mjs');
const { sembrarDemo } = await import('../lib/demo.mjs');

assert.equal(await sembrarDemo(), true);
await espacio.asegurarEspacio();
const estado = espacio.estadoEspacio();

test('la semilla pasa la validación completa y aplica el perfil del equipo', () => {
  assert.deepEqual(estado.validacion.errores, []);
  assert.deepEqual(estado.validacion.avisos, []);
  assert.equal(estado.equipo.nombre, 'Producto');
  assert.ok(estado.equipo.valores.length > 5, 'Perfil muestra valores del equipo');
});

test('la semilla tiene todo prendido y todas las fuentes en verde', () => {
  const c = estado.config;
  for (const id of ['daily', 'registro-tareas', 'deck-avance', 'reunion-comercial', 'bitacora-reuniones']) assert.equal(c.entregables[id].activo, true, id);
  assert.equal(c.entregables['bitacora-reuniones'].opciones.periodo, 'semana');
  assert.equal(c.modulos.digest_jira.activo, true);
  assert.equal(c.modulos.seguimiento_comercial.activo, true);
  assert.deepEqual(c.origen_tareas.map((o) => o.fuente), ['slack', 'teams', 'reuniones', 'jira']);
  const fuentes = estadoFuentes(c, leerDemo());
  for (const f of ['github', 'sesiones_ia', 'calendario', 'mail', 'reuniones', 'slack', 'teams', 'jira', 'ollama', 'registros']) {
    assert.equal(fuentes[f]?.activa, true, `${f} activa`);
    assert.equal(fuentes[f]?.conectada, true, `${f} conectada`);
  }
  assert.ok(!Object.values(fuentes).some((f) => f.activa && !f.conectada));
});

test('el historial tiene entre 6 y 8 cambios fechados y los archivos coinciden con el último', async () => {
  const log = await historial.log(enEspacio(), 40);
  assert.ok(log.length >= 6 && log.length <= 8, `hay ${log.length} cambios`);
  assert.ok(log.every((l) => /^2026-/.test(l.fecha)));
  assert.match(log[0].mensaje, /regla nueva/);
  assert.ok(log.some((l) => /Slack/.test(l.mensaje)) && log.some((l) => /módulo/.test(l.mensaje)));
});

test('una corrida terminada por entregable, todas con el control en verde', () => {
  const todas = corridas.listarCorridas(50);
  const entregables = entregablesDe(estado.config, estado.recetas, estado.modulos).filter((e) => e.activo);
  assert.ok(entregables.length >= 6);
  for (const e of entregables) {
    assert.ok(todas.some((m) => m.entregable === e.id && m.estado === 'lista'), `falta una corrida de ${e.id}`);
  }
  assert.ok(todas.some((m) => m.aprobada) && todas.some((m) => !m.aprobada));
  for (const m of todas) {
    const c = corridas.leerCorrida(m.id);
    const receta = JSON.parse(fs.readFileSync(path.join(corridas.dirCorridas(), m.id, 'receta.json'), 'utf8'));
    assert.ok(c.borrador.length > 100, `${m.id}: borrador`);
    assert.ok(c.evidencia.items.length > 0 && c.evidencia.descartados.length > 0, `${m.id}: evidencia y descartados`);
    const esperados = [...receta.fuentes.map((f) => `fuente:${f.id}`), ...receta.pasos.map((p) => `paso:${p.id}`), 'disparador', 'control', 'destino'];
    for (const nodo of esperados) assert.equal(c.nodos[nodo]?.estado, 'ok', `${m.id}: ${nodo}`);
    const r = corridas.controlarCierre({ id: m.id, receta, items: c.evidencia.items, descartados: c.evidencia.descartados });
    assert.equal(r.ok, true, `${m.id}: ${corridas.problemasDelControl(r).join(' | ')}`);
  }
});

test('reglas aprendidas con fecha en tres recetas, una propuesta pendiente y el chat precargado', () => {
  const recetas = espacio.listarRecetas();
  for (const id of ['daily', 'registro-tareas', 'deck-avance']) {
    assert.equal(recetas[id].origen, 'propia', id);
    assert.ok(recetas[id].receta.reglas.every((r) => /^2026-10-\d\d$/.test(r.fecha) && r.texto), `${id}: reglas con fecha`);
  }
  const pendientes = propuestas.listarPropuestas({ estado: 'pendiente' });
  assert.equal(pendientes.length, 1);
  assert.ok(pendientes[0].diffs.length > 0);
  assert.ok(propuestas.listarPropuestas({ estado: 'aplicada' }).length >= 3);
  const conv = chat.ultimaConversacion();
  assert.equal(conv.mensajes.filter((m) => m.rol === 'persona').length, 2);
  assert.equal(conv.mensajes.filter((m) => m.rol === 'claude').length, 2);
  const citadas = conv.mensajes.flatMap((m) => m.propuestas || []);
  assert.ok(citadas.includes(pendientes[0].id));
  for (const pid of citadas) assert.ok(propuestas.leerPropuesta(pid), pid);
  assert.ok(fs.existsSync(rutas.demo));
});

test('pedir Jira en el chat de la demo suma Jira sin quitar las fuentes que vienen del equipo', async () => {
  const { responderDemo } = await import('../lib/demo.mjs');
  const antes = entregablesDe(espacio.leerConfig().datos, espacio.listarRecetas()).find((e) => e.id === 'daily').fuentes;
  let pid = null;
  await responderDemo({ texto: 'Sumá los tickets de Jira', pantalla: { entregable: 'daily' }, onDelta: () => {}, onPropuesta: (id) => { pid = id; } });
  assert.ok(pid, 'propone un cambio');
  const vista = propuestas.vistaPrevia(pid);
  const despues = entregablesDe(vista.config, vista.recetas).find((e) => e.id === 'daily').fuentes;
  assert.deepEqual(despues, [...antes, 'jira']);
  propuestas.descartarPropuesta(pid);
});
