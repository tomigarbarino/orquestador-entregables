// Tests del control de cierre de una corrida: evidencia, lecturas registradas, refs sin
// clasificar, nodos sin estado final, ventana y la demo. Corren con: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';

const dirPrueba = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-control-'));
process.env.ORQ_ESPACIO = dirPrueba;
process.env.ORQ_DEMO_PAUSA = '0';

const { RAIZ, rutas } = await import('../lib/rutas.mjs');
const espacio = await import('../lib/espacio.mjs');
const corridas = await import('../lib/corridas.mjs');
const { calcularVentana, ahoraEn } = await import('../lib/horario.mjs');
const { contextoPlantilla } = await import('../lib/plantilla.mjs');
const { simularCorrida } = await import('../lib/demo.mjs');

await espacio.asegurarEspacio();
const ejemplo = YAML.parse(fs.readFileSync(path.join(RAIZ, 'config.example.yaml'), 'utf8'));

// Receta mínima, con una fuente propia y una por conector.
const receta = {
  id: 'prueba',
  fuentes: [{ id: 'github' }, { id: 'calendario' }],
  pasos: [{ id: 'evidencia' }, { id: 'redactar' }],
};

function corridaNueva() {
  return corridas.nuevaCorrida({ entregable: 'daily', zona: 'UTC' });
}

function cerrarNodos(id, nodos = ['fuente:github', 'fuente:calendario', 'paso:evidencia', 'paso:redactar']) {
  for (const nodo of nodos) corridas.agregarEvento(id, { nodo, estado: 'ok' });
}

test('ventana desde_ultima_corrida: manda la fecha más nueva entre la última corrida aprobada y la última entrega', () => {
  const ahora = ahoraEn('UTC', new Date('2026-10-09T15:00:00Z'));
  assert.equal(calcularVentana('desde_ultima_corrida', ahora, '2026-09-25', '2026-10-01').desde, '2026-10-01');
  assert.equal(calcularVentana('desde_ultima_corrida', ahora, '2026-10-03', '2026-10-01').desde, '2026-10-03');
  const soloEntrega = calcularVentana('desde_ultima_corrida', ahora, null, '2026-09-30');
  assert.equal(soloEntrega.desde, '2026-09-30');
  assert.equal(soloEntrega.base, 'ultima_entrega');
  const respaldo = calcularVentana('desde_ultima_corrida', ahora, null, null);
  assert.equal(respaldo.desde, '2026-10-02');
  assert.match(respaldo.aviso, /siete días/);
  // Una fecha futura o mal escrita no se usa.
  assert.equal(calcularVentana('desde_ultima_corrida', ahora, null, '2026-12-01').base, 'respaldo_7_dias');
  assert.equal(calcularVentana('hoy', ahora).desde, '2026-10-09');
});

test('refs: las formas cortas coinciden, pero "#21" no coincide con "#212"', () => {
  const leidas = ['acme-ejemplo/rutas-api#212', 'claude:3f9a21c0', 'evento:demo-cliente'];
  assert.ok(corridas.coincideRef('https://github.com/acme-ejemplo/rutas-api/pull/212', leidas));
  assert.ok(corridas.coincideRef('rutas-api#212', leidas));
  assert.ok(corridas.coincideRef('#212', leidas));
  assert.ok(corridas.coincideRef('3f9a21c0', leidas));
  assert.ok(corridas.coincideRef('demo-cliente', leidas));
  assert.ok(!corridas.coincideRef('acme-ejemplo/rutas-api#21', leidas));
  assert.ok(!corridas.coincideRef('#21', leidas));
  assert.ok(!corridas.coincideRef('cliente', leidas));
});

test('control (a): todas las refs de un ítem tienen que ser válidas, y las de conector necesitan registrar_lectura', () => {
  const id = corridaNueva();
  corridas.registrarLectura(id, 'github', { refs: ['acme-ejemplo/rutas-api#212'], resumen: '1 PR' });
  const items = [
    { texto: 'Mezcla', evidencia: [{ fuente: 'github', ref: 'acme-ejemplo/rutas-api#212' }, { fuente: 'github', ref: 'acme-ejemplo/rutas-api#999' }] },
    { texto: 'Reunión', evidencia: [{ fuente: 'calendario', ref: 'evento:planning' }] },
  ];
  let r = corridas.controlarEvidencia({ id, receta, items });
  assert.deepEqual(r.aceptados.map((x) => x.texto), []);
  assert.match(r.rechazados[0].motivo, /#999/);
  assert.match(r.rechazados[1].motivo, /registrar_lectura/);
  corridas.registrarLectura(id, 'calendario', { refs: ['evento:planning'], resumen: '1 reunión' });
  r = corridas.controlarEvidencia({ id, receta, items });
  assert.deepEqual(r.aceptados.map((x) => x.texto), ['Reunión']);
});

test('control (b) y (c): refs leídas sin clasificar, descartados sin refs y nodos sin estado final', () => {
  const id = corridaNueva();
  const refs = Array.from({ length: 25 }, (_, i) => `acme-ejemplo/rutas-api#${300 + i}`);
  corridas.registrarLectura(id, 'github', { refs, resumen: '25 PRs' });
  corridas.registrarLectura(id, 'calendario', { refs: [], resumen: 'sin reuniones' });
  corridas.agregarEvento(id, { nodo: 'fuente:github', estado: 'ok' });
  corridas.agregarEvento(id, { nodo: 'paso:evidencia', estado: 'en_curso' });
  const items = [{ texto: 'Uno', evidencia: [{ fuente: 'github', ref: refs[0] }] }];
  const descartados = [
    { texto: 'Dos', motivo: 'duplicado de #300', ref: refs[1] },
    { texto: 'Tres', motivo: 'sin entrega' },
  ];
  const r = corridas.controlarCierre({ id, receta, items, descartados });
  assert.equal(r.ok, false);
  assert.equal(r.sinClasificar.length, 23);
  assert.deepEqual(r.descartados[0].refs, [refs[1]]);
  assert.deepEqual(r.descartadosSinRef.map((d) => d.texto), ['Tres']);
  assert.deepEqual(r.nodosPendientes.map((n) => n.nodo), ['fuente:calendario', 'paso:evidencia', 'paso:redactar']);
  const texto = corridas.problemasDelControl(r).join('\n');
  assert.match(texto, /23 ref\(s\) leídas sin clasificar \(se muestran 20 de 23\)/);
  assert.equal(texto.split('\n').filter((l) => l.startsWith('- github:')).length, 20);
  assert.match(texto, /paso:evidencia \(en_curso\)/);
});

test('control: descartados con refs que no están en lo leído o con motivo "no se leyó" no pasan', () => {
  const id = corridaNueva();
  corridas.registrarLectura(id, 'github', { refs: ['acme-ejemplo/rutas-api#212'], resumen: '1 PR' });
  corridas.registrarLectura(id, 'calendario', { refs: ['codex:01a11c9f', 'codex:01a11c9f '], resumen: '1' });
  assert.deepEqual(corridas.leerLecturas(id).calendario.refs, ['codex:01a11c9f'], 'sin duplicados');
  cerrarNodos(id);
  const r = corridas.controlarCierre({
    id,
    receta,
    items: [{ texto: 'Uno', evidencia: [{ fuente: 'github', ref: 'acme-ejemplo/rutas-api#212' }] }],
    descartados: [
      { texto: 'Prueba técnica', motivo: 'cierre: "solo una prueba"', refs: ['claude:01a11c9f'] },
      { texto: 'Sesiones de la semana', motivo: 'la consulta excedió el límite de salida', refs: ['codex:01a11c9f'] },
    ],
  });
  assert.equal(r.ok, false);
  assert.deepEqual(r.descartadosRefInvalida.map((d) => d.invalidas), [['claude:01a11c9f']]);
  assert.deepEqual(r.descartadosSinLeer.map((d) => d.texto), ['Sesiones de la semana']);
  const texto = corridas.problemasDelControl(r).join('\n');
  assert.match(texto, /con su prefijo/);
  assert.match(texto, /faltantes/);
});

test('cerrarCorrida suma a faltantes los nodos en error u omitido que no se nombraron', () => {
  const id = corridaNueva();
  corridas.registrarLectura(id, 'github', { refs: ['acme-ejemplo/rutas-api#212'], resumen: '1 PR' });
  cerrarNodos(id, ['fuente:github', 'paso:evidencia', 'paso:redactar']);
  corridas.agregarEvento(id, { nodo: 'fuente:calendario', estado: 'error', resultado: 'No conectada' });
  const r = corridas.cerrarCorrida({
    id,
    receta,
    borrador: 'ok',
    items: [{ texto: 'Uno', evidencia: [{ fuente: 'github', ref: 'rutas-api#212' }] }],
  });
  assert.equal(r.guardado, true);
  assert.equal(r.resumen.ok, true);
  const c = corridas.leerCorrida(id);
  assert.deepEqual(c.evidencia.faltantes, [{ fuente: 'calendario', motivo: 'Fuente con error: No conectada' }]);
  assert.match(c.nodos.control.resultado, /1 faltante$/);
});

test('recetas y módulos: ningún texto queda cortado por un " #" sin comillas', async () => {
  const { textosCortados } = await import('../lib/propuestas.mjs');
  const archivos = [
    ...fs.readdirSync(path.join(RAIZ, 'recetas')).map((d) => path.join(RAIZ, 'recetas', d, 'receta.yaml')),
    ...fs.readdirSync(path.join(RAIZ, 'modulos')).flatMap((d) => ['receta.yaml', 'modulo.yaml'].map((a) => path.join(RAIZ, 'modulos', d, a))),
  ].filter((a) => fs.existsSync(a));
  for (const a of archivos) assert.deepEqual(textosCortados(fs.readFileSync(a, 'utf8')), [], a);
  assert.equal(textosCortados('control:\n  - va como ya integrado por #N, nunca obsoleto\n').length, 1);
});

test('cerrarCorrida rechaza dos veces y al tercer intento guarda con observaciones', () => {
  const id = corridaNueva();
  corridas.registrarLectura(id, 'github', { refs: ['acme-ejemplo/rutas-api#212', 'acme-ejemplo/rutas-api#214'], resumen: '2 PRs' });
  const args = {
    id,
    receta,
    borrador: '**Hecho**\n- Ventanas horarias',
    items: [{ texto: 'Ventanas horarias', evidencia: [{ fuente: 'github', ref: 'acme-ejemplo/rutas-api#212' }] }],
  };
  const r1 = corridas.cerrarCorrida(args);
  assert.equal(r1.guardado, false);
  assert.match(r1.mensaje, /intento 1 de 3/);
  assert.match(r1.mensaje, /rutas-api#214/);
  assert.match(r1.mensaje, /fuente:calendario/);
  assert.equal(corridas.cerrarCorrida(args).guardado, false);
  const r3 = corridas.cerrarCorrida(args);
  assert.equal(r3.guardado, true);
  assert.equal(r3.resumen.ok, false);
  const c = corridas.leerCorrida(id);
  assert.match(c.borrador, /^> \*\*Observaciones del control de evidencia\*\*/);
  assert.equal(c.nodos.control.estado, 'error');
});

test('cerrarCorrida guarda limpio cuando todo está clasificado y todos los nodos cerraron', () => {
  const id = corridaNueva();
  corridas.registrarLectura(id, 'github', { refs: ['acme-ejemplo/rutas-api#212', 'acme-ejemplo/rutas-api#214'], resumen: '2 PRs' });
  corridas.registrarLectura(id, 'calendario', { refs: ['evento:planning'], resumen: '1 reunión' });
  cerrarNodos(id);
  const r = corridas.cerrarCorrida({
    id,
    receta,
    borrador: 'ok',
    items: [{ texto: 'Ventanas horarias', evidencia: [{ fuente: 'github', ref: 'acme-ejemplo/rutas-api#212' }] }],
    descartados: [{ texto: 'PR en borrador', motivo: 'su descripción dice que no está listo', refs: ['rutas-api#214', 'evento:planning'] }],
  });
  assert.equal(r.guardado, true);
  assert.equal(r.resumen.ok, true);
  const c = corridas.leerCorrida(id);
  assert.equal(c.borrador, 'ok');
  assert.deepEqual(c.evidencia.descartados[0].refs, ['rutas-api#214', 'evento:planning']);
  assert.equal(c.nodos.control.estado, 'ok');
});

test('aprobar una corrida solo la marca: no escribe nada fuera de la corrida', () => {
  const id = corridaNueva();
  corridas.guardarBorrador({ id, borrador: 'x', items: [], descartados: [], faltantes: [], control: {} });
  const antes = fs.readdirSync(dirPrueba).sort();
  const meta = corridas.aprobarCorrida(id);
  assert.ok(meta.aprobada);
  assert.deepEqual(fs.readdirSync(dirPrueba).sort(), antes);
});

test('config: github_usuarios y dias_especiales validan, y la plantilla los expone', () => {
  const config = structuredClone(ejemplo);
  config.persona.github_usuarios = ['ana-ejemplo', 'ana-ejemplo-2'];
  config.dias_especiales = [{ fecha: '2026-10-08', nota: 'Día libre' }];
  const r = espacio.validarTodo(config, espacio.listarRecetas(), espacio.listarModulos());
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  const ctx = contextoPlantilla(config, config.entregables.daily);
  assert.equal(ctx.lista.dias_especiales, '- 2026-10-08: Día libre');
  assert.deepEqual(ctx.persona.github_usuarios, ['ana-ejemplo', 'ana-ejemplo-2']);
  const mala = structuredClone(config);
  mala.dias_especiales = [{ fecha: '8/10', nota: 'x' }];
  assert.equal(espacio.validarTodo(mala, espacio.listarRecetas(), espacio.listarModulos()).ok, false);
});

test('las corridas de la demo pasan el control nuevo sin observaciones', async () => {
  const config = espacio.estadoEspacio().config;
  const configDemo = structuredClone(config);
  configDemo.entregables['reunion-comercial'].activo = true;
  for (const m of espacio.listarModulos()) configDemo.modulos[m.clave] = { activo: true };
  for (const f of ['jira', 'ollama']) configDemo.fuentes[f] = { ...configDemo.fuentes[f], activo: true };
  for (const entregable of [...Object.keys(configDemo.entregables), 'digest-jira']) {
    const prep = espacio.prepararReceta(configDemo, entregable);
    const id = corridas.nuevaCorrida({ entregable, zona: 'UTC' });
    const r = await simularCorrida({ id, entregable, prep, config: configDemo });
    const c = corridas.leerCorrida(id);
    assert.equal(r.control.ok, true, `${entregable}: ${corridas.problemasDelControl(corridas.controlarCierre({ id, receta: prep.receta, items: c.evidencia.items, descartados: c.evidencia.descartados })).join(' | ')}`);
    assert.ok(c.evidencia.items.length > 0, `${entregable} sin ítems`);
    assert.ok(c.evidencia.descartados.every((d) => d.refs.length), `${entregable}: descartado sin refs`);
  }
  assert.ok(fs.existsSync(rutas.demo));
});

test('MCP: preparar_corrida, registrar_lectura y guardar_borrador con el control nuevo', async () => {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  // Conectores de la demo en la caché, para no depender de `claude mcp list` ni de gh.
  const detectado = JSON.parse(fs.readFileSync(path.join(rutas.demo, 'conectores.json'), 'utf8'));
  fs.writeFileSync(path.join(dirPrueba, '.cache', 'conectores.json'), JSON.stringify({ ...detectado, actualizado: new Date().toISOString() }));
  const configTexto = fs.readFileSync(path.join(dirPrueba, 'config.yaml'), 'utf8');
  const config = YAML.parse(configTexto);
  config.dias_especiales = [{ fecha: '2026-10-12', nota: 'Feriado' }];
  fs.writeFileSync(path.join(dirPrueba, 'config.yaml'), YAML.stringify(config));
  const transporte = new StdioClientTransport({ command: process.execPath, args: [path.join(RAIZ, 'mcp', 'servidor.mjs'), '--modo', 'corrida', '--espacio', dirPrueba], stderr: 'pipe' });
  const cliente = new Client({ name: 'test-control', version: '1' });
  await cliente.connect(transporte);
  try {
    const herramientas = (await cliente.listTools()).tools.map((t) => t.name);
    assert.ok(herramientas.includes('registrar_lectura'));
    const llamar = async (name, args) => {
      const r = await cliente.callTool({ name, arguments: args });
      return { error: Boolean(r.isError), texto: r.content?.[0]?.text || '' };
    };
    const prep = await llamar('preparar_corrida', { entregable: 'daily' });
    assert.equal(prep.error, false, prep.texto);
    const j = JSON.parse(prep.texto);
    assert.deepEqual(j.dias_especiales.map((d) => d.fecha), ['2026-10-12']);
    assert.ok(j.recordatorios.some((r) => /registrar_lectura/.test(r)));
    assert.match(j.fuentes.find((f) => f.id === 'calendario').despues, /registrar_lectura/);
    const pedido = await llamar('preparar_corrida', { entregable: 'registro-tareas', desde: '2026-10-07' });
    assert.deepEqual([JSON.parse(pedido.texto).ventana.desde, JSON.parse(pedido.texto).ventana.hasta], ['2026-10-07', '2026-10-07']);

    const corrida = j.corrida;
    assert.equal((await llamar('registrar_lectura', { corrida, fuente: 'jira', refs: ['RUT-1'], resumen: 'x' })).error, true);
    assert.match((await llamar('registrar_lectura', { corrida, fuente: 'github', refs: ['a/b#1'], resumen: 'x' })).texto, /leer_github/);
    // El paso de la ventana queda hecho al preparar la corrida.
    assert.equal(corridas.leerCorrida(corrida).nodos['paso:ventana'].estado, 'ok');
    // Una búsqueda registrada a medias se rechaza.
    const parcial = await llamar('registrar_lectura', { corrida, fuente: 'calendario', refs: ['evento:planning'], resumen: '2 eventos', consulta: 'planning', total: 2 });
    assert.equal(parcial.error, true);
    assert.match(parcial.texto, /devolvió 2 resultados/);
    // control y destino los cierra guardar_borrador.
    assert.equal((await llamar('reportar_paso', { corrida, nodo: 'destino', estado: 'omitido' })).error, true);
    const reg = await llamar('registrar_lectura', { corrida, fuente: 'calendario', refs: ['evento:planning', 'evento:planning'], resumen: '1 reunión', consulta: 'planning', total: 1 });
    assert.deepEqual(JSON.parse(reg.texto).consultas, [{ consulta: 'planning', resultados: 2 }]);
    assert.equal(JSON.parse(reg.texto).refs_registradas, 1);
    assert.equal(reg.error, false, reg.texto);
    assert.equal(corridas.leerCorrida(corrida).nodos['fuente:calendario'].estado, 'ok');

    const borrador = { corrida, borrador: 'Hecho: nada', items: [{ texto: 'Planning', evidencia: [{ fuente: 'calendario', ref: 'evento:planning' }] }] };
    const mal = await llamar('guardar_borrador', borrador);
    assert.equal(mal.error, true);
    assert.match(mal.texto, /sin estado final/);
    for (const nodo of ['fuente:github', 'fuente:sesiones_ia', 'fuente:reuniones', ...j.pasos.map((p) => p.nodo)]) {
      await llamar('reportar_paso', { corrida, nodo, estado: nodo.startsWith('fuente:') ? 'omitido' : 'ok' });
    }
    const bien = await llamar('guardar_borrador', { ...borrador, descartados: [{ texto: 'Nada más', motivo: 'sin más lecturas', ref: 'evento:planning' }] });
    assert.equal(bien.error, false, bien.texto);
    assert.equal(corridas.leerCorrida(corrida).meta.control.ok, true);
  } finally {
    await cliente.close();
  }
});

test.after(() =>fs.rmSync(dirPrueba, { recursive: true, force: true }));
