// Tests de la lógica compartida. Corren con: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';

const dirPrueba = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-test-'));
process.env.ORQ_ESPACIO = dirPrueba;

const { RAIZ } = await import('../lib/rutas.mjs');
const espacio = await import('../lib/espacio.mjs');
const { calcularVentana, tocaAhora, ahoraEn, textoHorario, semana } = await import('../lib/horario.mjs');
const { grafoGeneral, grafoEntregable, diffGrafos, aplicarCorrida, MEDIDAS, cajaDe } = await import('../lib/grafo.mjs');
const { entregablesDe, recetaEfectiva } = await import('../lib/receta-efectiva.mjs');
const { generarEntregable, configConEntregable } = await import('../lib/asistente.mjs');
const { parsearMcpList, parsearGhStatus, estadoFuentes } = await import('../lib/conectores.mjs');
const corridas = await import('../lib/corridas.mjs');
const propuestas = await import('../lib/propuestas.mjs');

await espacio.asegurarEspacio();
const ejemplo = YAML.parse(fs.readFileSync(path.join(RAIZ, 'config.example.yaml'), 'utf8'));

test('la config de ejemplo y todas las recetas son válidas', () => {
  const e = espacio.estadoEspacio();
  assert.equal(e.validacion.ok, true, JSON.stringify(e.validacion.errores));
  assert.deepEqual(Object.keys(e.recetas).sort(), ['bitacora-reuniones', 'daily', 'deck-avance', 'digest-jira', 'registro-tareas', 'reunion-comercial']);
});

test('la validación encuentra errores de esquema y de referencias', () => {
  const mala = structuredClone(ejemplo);
  mala.entregables.daily.horario = { dias: ['lunes'], hora: '9' };
  mala.entregables.daily.fuentes = ['github', 'no_existe'];
  mala.entregables.daily.destino = { tipo: 'slack' };
  const r = espacio.validarTodo(mala, espacio.listarRecetas(), espacio.listarModulos());
  assert.equal(r.ok, false);
  const texto = r.errores.map((e) => `${e.ruta} ${e.mensaje}`).join('\n');
  assert.match(texto, /canal/);
  assert.match(texto, /horario/);
});

test('ventanas de tiempo', () => {
  const lunes = { fecha: '2026-10-05', dia: 'lun', hora: '09:00', minutos: 540 };
  assert.deepEqual(
    { desde: calcularVentana('dia_habil_anterior', lunes).desde, hasta: calcularVentana('dia_habil_anterior', lunes).hasta },
    { desde: '2026-10-02', hasta: '2026-10-05' },
  );
  assert.equal(calcularVentana('ultimos_7_dias', lunes).desde, '2026-09-28');
  assert.equal(calcularVentana('desde_ultima_corrida', lunes, '2026-10-01').desde, '2026-10-01');
  assert.equal(ahoraEn('America/Argentina/Buenos_Aires', new Date('2026-10-09T03:30:00Z')).fecha, '2026-10-09');
  assert.equal(ahoraEn('America/Argentina/Buenos_Aires', new Date('2026-10-09T02:30:00Z')).fecha, '2026-10-08');
});

test('qué toca ahora y la semana', () => {
  const recetas = espacio.listarRecetas();
  const lista = entregablesDe(ejemplo, recetas, espacio.listarModulos());
  const jueves = { fecha: '2026-10-08', dia: 'jue', hora: '16:20', minutos: 980 };
  assert.deepEqual(tocaAhora(lista, jueves).map((e) => e.id), ['deck-avance']);
  const s = semana(lista);
  assert.equal(s.dias.find((d) => d.dia === 'jue').items.length, 3);
  assert.deepEqual(s.aPedido.map((x) => x.id), ['reunion-comercial']);
  assert.equal(textoHorario({ dias: ['lun', 'mar', 'mie', 'jue', 'vie'], hora: '09:00' }), 'Lun a vie, 09:00');
});

test('el grafo por entregable sigue disparador → fuentes → pasos → control → destino', () => {
  const recetas = espacio.listarRecetas();
  const modulos = espacio.listarModulos();
  const g = grafoEntregable({ entregableId: 'daily', config: ejemplo, recetas, modulos, estadoFuentes: { github: { conectada: true }, sesiones_ia: { conectada: true }, calendario: { conectada: false }, reuniones: { conectada: false }, slack: { conectada: false }, teams: { conectada: false } } });
  const ids = g.nodes.map((n) => n.id);
  assert.deepEqual(ids, ['disparador', 'fuente:github', 'fuente:sesiones_ia', 'fuente:calendario', 'fuente:reuniones', 'fuente:slack', 'fuente:teams', 'paso:ventana', 'paso:evidencia', 'paso:agrupar', 'paso:redactar', 'control', 'destino']);
  assert.equal(g.nodes.find((n) => n.id === 'fuente:github').data.conexion, 'conectada');
  assert.equal(g.nodes.find((n) => n.id === 'fuente:calendario').data.conexion, 'desconectada');
  assert.ok(g.edges.some((e) => e.source === 'paso:redactar' && e.target === 'control'));
  const pintado = aplicarCorrida(g, { 'fuente:github': { estado: 'ok', resultado: '3 PRs' } });
  assert.equal(pintado.nodes.find((n) => n.id === 'fuente:github').data.corrida.resultado, '3 PRs');
});

test('los módulos activos suman pasos y fuentes al flujo', () => {
  const recetas = espacio.listarRecetas();
  const modulos = espacio.listarModulos();
  const conModulos = structuredClone(ejemplo);
  conModulos.modulos.resumen_local.activo = true;
  conModulos.modulos.seguimiento_comercial.activo = true;
  const daily = entregablesDe(conModulos, recetas, modulos).find((e) => e.id === 'daily');
  const ef = recetaEfectiva(daily, conModulos, recetas, modulos);
  const pasos = ef.receta.pasos.map((p) => p.id);
  assert.ok(pasos.indexOf('resumen-local') < pasos.indexOf('redactar'));
  assert.ok(pasos.includes('seguimiento-comercial'));
  assert.ok(ef.receta.fuentes.some((f) => f.id === 'ollama'));
  conModulos.modulos.digest_jira.activo = true;
  assert.ok(grafoGeneral({ config: conModulos, recetas, modulos }).nodes.some((n) => n.id === 'entregable:digest-jira'));
});

test('el diff marca nodos agregados, quitados y modificados', () => {
  const recetas = espacio.listarRecetas();
  const modulos = espacio.listarModulos();
  const antes = grafoEntregable({ entregableId: 'daily', config: ejemplo, recetas, modulos });
  const cambiada = structuredClone(ejemplo);
  cambiada.fuentes.jira.activo = true;
  cambiada.entregables.daily.fuentes = ['github', 'sesiones_ia', 'jira'];
  const recetasCambiadas = structuredClone(recetas);
  recetasCambiadas.daily.receta.reglas = [{ fecha: '2026-10-09', texto: 'Máximo tres ítems por bloque.' }];
  const despues = grafoEntregable({ entregableId: 'daily', config: cambiada, recetas: recetasCambiadas, modulos });
  const d = diffGrafos(antes, despues);
  assert.deepEqual(d.resumen.agregados, ['jira']);
  assert.deepEqual(d.resumen.quitados, ['calendario', 'reuniones', 'slack', 'teams']);
  assert.ok(d.resumen.modificados.includes('Control de evidencia'));
});

// Ningún par de nodos se toca: entre dos cajas queda al menos 16 px en x o en y.
function sinSuperposicion(g, contexto) {
  const m = g.medidas || MEDIDAS.entregable;
  for (let i = 0; i < g.nodes.length; i++) {
    for (let j = i + 1; j < g.nodes.length; j++) {
      const a = g.nodes[i].position;
      const b = g.nodes[j].position;
      const ok = Math.abs(a.x - b.x) >= m.ancho + 16 || Math.abs(a.y - b.y) >= m.alto + 16;
      assert.ok(ok, `${contexto}: ${g.nodes[i].id} y ${g.nodes[j].id} se tocan`);
    }
  }
}

test('la vista general agrupa las fuentes apagadas, no tiene destinos y trae rótulos', () => {
  const recetas = espacio.listarRecetas();
  const modulos = espacio.listarModulos();
  const g = grafoGeneral({ config: ejemplo, recetas, modulos });
  const apagadas = Object.entries(ejemplo.fuentes).filter(([, f]) => f.activo === false).map(([id]) => id);
  assert.ok(apagadas.length > 0);
  const grupo = g.nodes.find((n) => n.id === 'fuentes-apagadas');
  assert.equal(grupo.data.tipo, 'fuente');
  assert.deepEqual(grupo.data.agrupadas.map((x) => x.id), apagadas);
  assert.equal(grupo.data.titulo, `${apagadas.length} fuentes sin usar`);
  for (const id of apagadas) assert.ok(!g.nodes.some((n) => n.id === `fuente:${id}`), `${id} no va suelta`);
  assert.ok(!g.nodes.some((n) => n.id.startsWith('destino:')));
  assert.equal(g.nodes.find((n) => n.id === 'orquestador').data.titulo, 'Claude');
  const daily = g.nodes.find((n) => n.id === 'entregable:daily');
  assert.equal(daily.data.horarioTexto, 'Lun a vie, 09:00');
  assert.ok(daily.data.destino);
  assert.deepEqual(g.rotulos.map((r) => r.texto), ['Lee de', 'Claude arma', 'Entregables']);
  sinSuperposicion(g, 'general');
  // Prender Jira la suma, pero el grupo de apagadas no figura como cambio.
  const conJira = structuredClone(ejemplo);
  conJira.fuentes.jira.activo = true;
  const d = diffGrafos(g, grafoGeneral({ config: conJira, recetas, modulos }));
  assert.deepEqual(d.resumen.agregados, ['jira']);
  assert.ok(!d.resumen.modificados.some((t) => /sin usar/.test(t)));
  assert.ok(!d.nodes.find((n) => n.id === 'fuentes-apagadas').data.cambio);
  sinSuperposicion(d, 'diff general');
});

test('con más de 4 fuentes, la disposición ancha las pone en dos columnas y baja el alto', () => {
  const recetas = espacio.listarRecetas();
  const modulos = espacio.listarModulos();
  const siete = structuredClone(ejemplo);
  siete.fuentes.jira.activo = true;
  siete.entregables.daily.fuentes = ['github', 'sesiones_ia', 'calendario', 'reuniones', 'slack', 'teams', 'jira'];
  const g = grafoEntregable({ entregableId: 'daily', config: siete, recetas, modulos });
  const fuentes = g.nodes.filter((n) => n.data.tipo === 'fuente');
  assert.equal(fuentes.length, 7);
  assert.equal(new Set(fuentes.map((n) => n.position.x)).size, 2);
  assert.ok(cajaDe(g).alto < 650, `alto: ${cajaDe(g).alto}`);
  const posiciones = g.nodes.map((n) => `${n.position.x},${n.position.y}`);
  assert.equal(new Set(posiciones).size, g.nodes.length);
  sinSuperposicion(g, 'siete fuentes');
  for (const f of fuentes) assert.ok(g.edges.some((e) => e.source === f.id && e.target.startsWith('paso:')), `${f.id} sin arista`);
  // Angosta: sigue en una sola columna.
  const angosta = grafoEntregable({ entregableId: 'daily', config: siete, recetas, modulos, disposicion: 'angosta' });
  assert.equal(new Set(angosta.nodes.filter((n) => n.data.tipo === 'fuente').map((n) => n.position.x)).size, 1);
});

test('la daily entra en las dos disposiciones y sus datos son legibles', () => {
  const recetas = espacio.listarRecetas();
  const modulos = espacio.listarModulos();
  const ancha = grafoEntregable({ entregableId: 'daily', config: ejemplo, recetas, modulos });
  const cajaAncha = cajaDe(ancha);
  assert.ok(cajaAncha.ancho <= 880 && cajaAncha.alto <= 620, `ancha: ${cajaAncha.ancho}x${cajaAncha.alto}`);
  const angosta = grafoEntregable({ entregableId: 'daily', config: ejemplo, recetas, modulos, disposicion: 'angosta' });
  assert.ok(cajaDe(angosta).ancho <= 420, `angosta: ${cajaDe(angosta).ancho}`);
  assert.deepEqual(angosta.nodes.map((n) => n.id), ancha.nodes.map((n) => n.id));
  for (const g of [ancha, angosta]) {
    sinSuperposicion(g, g.armado.disposicion);
    assert.ok(g.edges.some((e) => e.source === 'disparador' && e.target === 'paso:ventana'));
    assert.ok(!g.edges.some((e) => e.source === 'disparador' && e.target.startsWith('fuente:')));
  }
  // El control queda alineado al fondo de la columna de pasos.
  const y = (id) => ancha.nodes.find((n) => n.id === id).position.y;
  const pasos = ancha.nodes.filter((n) => n.data.tipo === 'paso');
  assert.equal(y('control'), pasos.at(-2).position.y);
  assert.equal(y('destino'), pasos.at(-1).position.y);
  assert.equal(ancha.nodes.find((n) => n.id === 'destino').data.destino.tipo, 'borrador');
  assert.equal(ancha.nodes.find((n) => n.id === 'disparador').data.titulo, 'Lun a vie, 09:00');
  assert.equal(ancha.nodes.find((n) => n.id === 'disparador').data.subtitulo, 'Desde el día hábil anterior');
  assert.equal(ancha.nodes.find((n) => n.id === 'control').data.titulo, 'Control de evidencia');
});

test('fuentes apagadas o sin definir, y nodos en espera durante la prueba', () => {
  const recetas = espacio.listarRecetas();
  const modulos = espacio.listarModulos();
  const config = structuredClone(ejemplo);
  config.fuentes.calendario.activo = false;
  config.entregables.daily.fuentes = ['github', 'calendario', 'no_definida'];
  const g = grafoEntregable({ entregableId: 'daily', config, recetas, modulos, estadoFuentes: { github: { conectada: true } } });
  const cal = g.nodes.find((n) => n.id === 'fuente:calendario').data;
  assert.equal(cal.conexion, 'apagada');
  assert.equal(cal.detalleConexion, 'Apagada en Conectores: no se usa');
  const nd = g.nodes.find((n) => n.id === 'fuente:no_definida').data;
  assert.equal(nd.conexion, 'desconectada');
  assert.equal(nd.detalleConexion, 'No está en tu configuración');
  const estados = { disparador: { estado: 'ok' }, 'fuente:github': { estado: 'en_curso' } };
  const enCurso = aplicarCorrida(g, estados, { enCurso: true });
  assert.equal(enCurso.nodes.find((n) => n.id === 'fuente:github').data.corrida.estado, 'en_curso');
  assert.equal(enCurso.nodes.find((n) => n.id === 'control').data.corrida.estado, 'espera');
  const terminada = aplicarCorrida(g, estados);
  assert.equal(terminada.nodes.find((n) => n.id === 'control').data.corrida, undefined);
});

test('el diff de Jira y Calendario conserva el orden, no superpone y alinea el control', () => {
  const recetas = espacio.listarRecetas();
  const modulos = espacio.listarModulos();
  const cambiada = structuredClone(ejemplo);
  cambiada.fuentes.jira.activo = true;
  cambiada.entregables.daily.fuentes = ['github', 'sesiones_ia', 'jira'];
  for (const disposicion of ['ancha', 'angosta']) {
    const antes = grafoEntregable({ entregableId: 'daily', config: ejemplo, recetas, modulos, disposicion });
    const despues = grafoEntregable({ entregableId: 'daily', config: cambiada, recetas, modulos, disposicion });
    const d = diffGrafos(antes, despues);
    const fuentes = d.nodes.filter((n) => n.data.tipo === 'fuente').map((n) => n.id);
    assert.deepEqual(fuentes, ['fuente:github', 'fuente:sesiones_ia', 'fuente:calendario', 'fuente:reuniones', 'fuente:slack', 'fuente:teams', 'fuente:jira']);
    assert.equal(d.nodes.find((n) => n.id === 'fuente:calendario').data.cambio, 'quitado');
    sinSuperposicion(d, `diff ${disposicion}`);
    const pasos = d.nodes.filter((n) => n.data.tipo === 'paso');
    const control = d.nodes.find((n) => n.id === 'control').position;
    if (disposicion === 'ancha') assert.equal(control.y, pasos.at(-2).position.y);
    else assert.ok(control.y > pasos.at(-1).position.y);
    assert.ok(d.edges.some((e) => e.source === 'fuente:calendario' && e.data?.cambio === 'quitado'));
  }
});

test('una fuente que ningún paso declara llega al paso que junta las demás', () => {
  const recetas = espacio.listarRecetas();
  const modulos = espacio.listarModulos();
  const conJira = structuredClone(ejemplo);
  conJira.fuentes.jira.activo = true;
  conJira.entregables.daily.fuentes = [...(conJira.entregables.daily.fuentes || ['github', 'sesiones_ia', 'calendario']), 'jira'];
  const g = grafoEntregable({ entregableId: 'daily', config: conJira, recetas, modulos });
  const destinoDe = (fuente) => g.edges.find((e) => e.source === `fuente:${fuente}`)?.target;
  assert.ok(destinoDe('jira'), 'Jira tiene arista');
  assert.equal(destinoDe('jira'), destinoDe('calendario'));
  assert.notEqual(destinoDe('jira'), 'paso:ventana');
});

test('la vista general junta las aristas de cada lado en un único bus', () => {
  const recetas = espacio.listarRecetas();
  const modulos = espacio.listarModulos();
  for (const disposicion of ['ancha', 'angosta']) {
    const g = grafoGeneral({ config: ejemplo, recetas, modulos, disposicion });
    const buses = (pred) => new Set(g.edges.filter(pred).map((e) => e.data.bus));
    assert.equal(buses((e) => e.target === 'orquestador').size, 1, `${disposicion}: entrada`);
    assert.equal(buses((e) => e.source === 'orquestador').size, 1, `${disposicion}: salida`);
    const m = g.medidas;
    const xEntrada = [...buses((e) => e.target === 'orquestador')][0];
    assert.ok(xEntrada > m.ancho && xEntrada < m.columna, `${disposicion}: el bus va en el hueco`);
  }
});

test('el grafo sigue sin superponerse después de pintar una prueba', () => {
  const recetas = espacio.listarRecetas();
  const modulos = espacio.listarModulos();
  const g = grafoEntregable({ entregableId: 'daily', config: ejemplo, recetas, modulos });
  const pintado = aplicarCorrida(g, { control: { estado: 'ok', resultado: '3 con evidencia' } });
  sinSuperposicion(pintado, 'daily pintada');
  assert.deepEqual(pintado.nodes.map((n) => n.position), g.nodes.map((n) => n.position));
});

test('el asistente genera una receta válida y su entrada en la config', () => {
  const g = generarEntregable({
    nombre: 'Resumen semanal para clientes',
    que_armas: 'Mail de los viernes',
    formato: 'Tres bloques',
    fuentes: [{ id: 'github', para: 'PRs de la semana' }, { id: 'calendario', para: 'Reuniones' }],
    reglas_tono: ['Sin tecnicismos'],
    horario: { dias: ['vie'], hora: '17:00' },
    destino: { tipo: 'slack', canal: '#clientes' },
  });
  assert.equal(g.id, 'resumen-semanal-para-clientes');
  const v = espacio.validadores();
  assert.equal(v.receta(g.receta).ok, true, JSON.stringify(v.receta(g.receta).errores));
  const config = configConEntregable(ejemplo, g, espacio.catalogo());
  assert.equal(v.config(config).ok, true, JSON.stringify(v.config(config).errores));
  assert.match(g.instrucciones, /Sin tecnicismos/);
});

test('parseo de claude mcp list y gh auth status', () => {
  const s = parsearMcpList([
    'Checking MCP server health…',
    '',
    'claude.ai Microsoft 365: https://ejemplo.invalid/mcp (HTTP) - ✔ Connected',
    'claude.ai Slack: https://ejemplo.invalid/slack - ! Needs authentication',
    'local-db: npx -y servidor - ✗ Failed to connect',
  ].join('\n'));
  assert.deepEqual(s.map((x) => [x.clave, x.estado]), [['claude_ai_Microsoft_365', 'conectado'], ['claude_ai_Slack', 'requiere_auth'], ['local-db', 'fallo']]);
  const fuentes = estadoFuentes(ejemplo, { mcp: { ok: true, servidores: s }, gh: { ok: true, detalle: 'ok' }, ollama: { ok: false } }, espacio.catalogo());
  assert.equal(fuentes.calendario.conectada, true);
  assert.ok(fuentes.calendario.herramientas.includes('mcp__claude_ai_Microsoft_365__outlook_calendar_search'));
  assert.ok(!fuentes.calendario.herramientas.some((h) => /send|create|delete/.test(h)));
  const gh = parsearGhStatus('github.com\n  ✓ Logged in to github.com account ana (keyring)\n  - Active account: true\n  ✓ Logged in to github.com account otra (keyring)\n  - Active account: false');
  assert.deepEqual(gh.filter((c) => c.activa).map((c) => c.cuenta), ['ana']);
});

test('control de evidencia: sin evidencia o con una referencia que no se leyó, no se cuenta', () => {
  const id = corridas.nuevaCorrida({ entregable: 'daily', zona: 'UTC' });
  corridas.registrarLectura(id, 'github', { refs: ['acme-ejemplo/rutas-api#212'], resumen: '1 PR' });
  const receta = espacio.listarRecetas().daily.receta;
  const r = corridas.controlarEvidencia({
    id,
    receta,
    items: [
      { texto: 'Con evidencia', evidencia: [{ fuente: 'github', ref: 'https://github.com/acme-ejemplo/rutas-api/pull/212' }] },
      { texto: 'Sin evidencia', evidencia: [] },
      { texto: 'PR inventado', evidencia: [{ fuente: 'github', ref: 'acme-ejemplo/rutas-api#999' }] },
      { texto: 'Fuente ajena', evidencia: [{ fuente: 'jira', ref: 'RUT-1' }] },
    ],
  });
  assert.deepEqual(r.aceptados.map((x) => x.texto), ['Con evidencia']);
  assert.deepEqual(r.rechazados.map((x) => x.texto), ['Sin evidencia', 'PR inventado', 'Fuente ajena']);
});

test('propuestas: se validan, se aplican con commit y la regla queda con fecha', async () => {
  const p = propuestas.crearPropuesta({ motivo: 'Guion más corto', cambios: [], regla: { receta: 'daily', texto: 'Máximo tres ítems por bloque.' } });
  assert.equal(p.estado, 'pendiente');
  assert.equal(p.diffs[0].archivo, 'recetas/daily/receta.yaml');
  await propuestas.aplicarPropuesta(p.id);
  const daily = espacio.listarRecetas().daily;
  assert.equal(daily.origen, 'propia');
  assert.equal(daily.receta.reglas.at(-1).texto, 'Máximo tres ítems por bloque.');
  assert.match(daily.receta.reglas.at(-1).fecha, /^\d{4}-\d{2}-\d{2}$/);
  const invalida = propuestas.crearPropuesta({ motivo: 'Rompe todo', cambios: [{ tipo: 'config', yaml: 'version: 2\n' }] });
  assert.equal(invalida.estado, 'invalida');
  await assert.rejects(() => propuestas.aplicarPropuesta(invalida.id));
});

test('las rutas fuera del espacio se rechazan', async () => {
  const { dentroDe } = await import('../lib/rutas.mjs');
  assert.throws(() => dentroDe(dirPrueba, '..', 'otro'));
  assert.throws(() => espacio.escribirReceta('../fuera', { recetaTexto: 'x' }));
});

test.after(() => fs.rmSync(dirPrueba, { recursive: true, force: true }));
