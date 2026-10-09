// Tests del origen de tareas, el perfil de equipo y los issues de GitHub. Corren con: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';

const dirPrueba = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-origen-'));
process.env.ORQ_ESPACIO = dirPrueba;

const { RAIZ } = await import('../lib/rutas.mjs');
const espacio = await import('../lib/espacio.mjs');
const equipo = await import('../lib/equipo.mjs');
const propuestas = await import('../lib/propuestas.mjs');
const { entregablesDe, recetaEfectiva } = await import('../lib/receta-efectiva.mjs');
const { grafoEntregable } = await import('../lib/grafo.mjs');
const f = await import('../lib/fuentes-locales.mjs');

await espacio.asegurarEspacio();
const ejemplo = YAML.parse(fs.readFileSync(path.join(RAIZ, 'config.example.yaml'), 'utf8'));
const ZONA = 'America/Argentina/Buenos_Aires';

const perfilEquipo = () => ({
  version: 1,
  equipo: 'Producto',
  origen_tareas: [
    { fuente: 'slack', canales: ['#pedidos-producto', '#soporte'] },
    { fuente: 'mail', remitentes: ['@acme.example.com'] },
  ],
  fuentes: {
    slack: { activo: true, via: 'mcp', servidor: 'Slack', canales: ['#pedidos-producto'] },
    mail: { activo: true, via: 'mcp', servidor: 'Microsoft 365' },
  },
  reglas_redaccion: ['Frases cortas y sin adjetivos.'],
});

test('la fusión deja que la persona pise al equipo: objetos clave por clave, listas completas', () => {
  const persona = structuredClone(ejemplo);
  persona.fuentes.slack = { activo: false, via: 'mcp', servidor: 'Slack', canales: ['#mi-canal'] };
  const base = perfilEquipo();
  const e = equipo.configEfectiva(base, persona);
  // Lo que la persona no define viene del equipo.
  assert.deepEqual(e.origen_tareas, base.origen_tareas);
  // Lo que define, gana (la lista de canales se reemplaza, no se mezcla).
  assert.deepEqual(e.fuentes.slack.canales, ['#mi-canal']);
  assert.equal(e.fuentes.slack.activo, false);
  // Lo propio de la persona queda como está y el nombre del equipo no se cuela en la config.
  assert.equal(e.persona.nombre, ejemplo.persona.nombre);
  assert.equal(e.equipo, undefined);
  assert.equal(e.version, 1);
  // Si define la clave, la lista de reglas es la suya.
  persona.reglas_redaccion = ['Una sola regla.'];
  assert.deepEqual(equipo.configEfectiva(base, persona).reglas_redaccion, ['Una sola regla.']);
});

test('valoresDelEquipo marca solo lo que la persona no definió', () => {
  const persona = structuredClone(ejemplo);
  persona.origen_tareas = [{ fuente: 'jira' }];
  const rutas = equipo.valoresDelEquipo(perfilEquipo(), persona);
  assert.ok(!rutas.includes('/origen_tareas'), 'la persona definió origen_tareas');
  assert.ok(rutas.includes('/reglas_redaccion') === false, 'el ejemplo ya define reglas_redaccion');
  assert.deepEqual(equipo.valoresDelEquipo(perfilEquipo(), { fuentes: { slack: { canales: ['#x'] } } }).filter((r) => r.startsWith('/fuentes')).sort(), ['/fuentes/mail', '/fuentes/slack/activo', '/fuentes/slack/servidor', '/fuentes/slack/via']);
});

test('sinHeredado no copia al archivo de la persona lo que solo viene del equipo', () => {
  const base = perfilEquipo();
  const propia = { version: 1, persona: { nombre: 'Ana Ejemplo' }, fuentes: { slack: { canales: ['#mio'] } } };
  const efectiva = equipo.configEfectiva(base, propia);
  efectiva.fuentes.mail.activo = false; // un cambio de la persona desde la interfaz
  const guardada = equipo.sinHeredado(efectiva, base, propia);
  assert.equal(guardada.origen_tareas, undefined);
  assert.equal(guardada.reglas_redaccion, undefined);
  assert.deepEqual(guardada.fuentes.mail, { activo: false });
  assert.deepEqual(guardada.fuentes.slack.canales, ['#mio']);
  assert.deepEqual(equipo.configEfectiva(base, guardada).fuentes.mail, { activo: false, via: 'mcp', servidor: 'Microsoft 365' });
});

test('el perfil exportado no tiene persona, nombre, mails, carpetas ni destinos personales', () => {
  const config = structuredClone(ejemplo);
  config.persona.nombre = 'Ana Ejemplo';
  config.persona.github_usuario = 'ana-ejemplo';
  config.origen_tareas = [
    { fuente: 'mail', remitentes: ['@acme.example.com', 'beto@acme.example.com'], solo_mios: true },
    { fuente: 'slack', canales: ['#pedidos-producto'] },
  ];
  config.fuentes.registros = { activo: true, via: 'local', carpeta: '~/registros-de-ana' };
  config.fuentes.mail.remitentes_resumen = ['no-reply@notetaker.example.com'];
  config.entregables.daily.destino = { tipo: 'slack', canal: '@ana.ejemplo' };

  const perfil = equipo.perfilDeEquipo(config);
  const texto = YAML.stringify(perfil);
  assert.equal(perfil.persona, undefined);
  assert.deepEqual(Object.keys(perfil).filter((k) => !['version', 'equipo', 'origen_tareas', 'fuentes', 'entregables', 'modulos', 'reglas_redaccion'].includes(k)), []);
  assert.doesNotMatch(texto, /Ana|ana-ejemplo|ana\.ejemplo|registros-de-ana/);
  assert.doesNotMatch(texto, /[\w.+-]+@[\w-]+\.[\w.-]+/, 'ninguna dirección de mail completa');
  assert.match(texto, /@acme\.example\.com/, 'los dominios sí se conservan');
  assert.equal(perfil.entregables.daily.destino.tipo, 'borrador');
  assert.equal(perfil.fuentes.registros.carpeta, undefined);
  assert.equal(perfil.equipo, 'Producto');
  const v = espacio.validadores().equipo(perfil);
  assert.equal(v.ok, true, JSON.stringify(v.errores));
});

test('el esquema del perfil de equipo rechaza datos personales', () => {
  const v = espacio.validadores();
  const con = (cambios) => ({ ...perfilEquipo(), ...cambios });
  assert.equal(v.equipo(perfilEquipo()).ok, true);
  assert.equal(v.equipo(con({ persona: { nombre: 'Ana Ejemplo' } })).ok, false);
  assert.equal(v.equipo(con({ fuentes: { registros: { activo: true, via: 'local', carpeta: '~/algo' } } })).ok, false);
  assert.equal(v.equipo(con({ origen_tareas: [{ fuente: 'mail', remitentes: ['beto@acme.example.com'] }] })).ok, false);
});

test('al importar el perfil de equipo, lo que la persona cambia después se conserva', async () => {
  const base = perfilEquipo();
  const p = propuestas.crearPropuesta({ motivo: 'Usar la configuración del equipo', origen: 'interfaz', cambios: [{ tipo: 'equipo', yaml: YAML.stringify(base) }] });
  assert.equal(p.estado, 'pendiente', JSON.stringify(p.errores));
  assert.ok(p.diffs.some((d) => d.archivo === 'equipo.yaml'));
  await propuestas.aplicarPropuesta(p.id);
  assert.ok(fs.existsSync(path.join(dirPrueba, 'equipo.yaml')));

  let est = espacio.estadoEspacio();
  assert.equal(est.validacion.ok, true, JSON.stringify(est.validacion.errores));
  assert.deepEqual(est.config.origen_tareas, base.origen_tareas);
  assert.equal(est.equipo.nombre, 'Producto');
  assert.ok(est.equipo.valores.includes('/origen_tareas'));

  // La persona cambia un canal en su config.yaml: gana lo suyo.
  const propia = YAML.parse(fs.readFileSync(path.join(dirPrueba, 'config.yaml'), 'utf8'));
  propia.fuentes.slack.canales = ['#mi-canal'];
  const p2 = propuestas.crearPropuesta({ motivo: 'Cambio un canal', origen: 'interfaz', cambios: [{ tipo: 'config', yaml: YAML.stringify(propia) }] });
  assert.equal(p2.estado, 'pendiente', JSON.stringify(p2.errores));
  await propuestas.aplicarPropuesta(p2.id);
  est = espacio.estadoEspacio();
  assert.deepEqual(est.config.fuentes.slack.canales, ['#mi-canal']);
  assert.deepEqual(est.config.origen_tareas, base.origen_tareas, 'lo demás sigue viniendo del equipo');

  // Un perfil con datos personales no se importa.
  const mala = propuestas.crearPropuesta({ motivo: 'Perfil con datos personales', origen: 'interfaz', cambios: [{ tipo: 'equipo', yaml: YAML.stringify({ ...base, persona: { nombre: 'Ana Ejemplo' } }) }] });
  assert.equal(mala.estado, 'invalida');

  fs.rmSync(path.join(dirPrueba, 'equipo.yaml'));
});

test('el paso "Pedidos que me llegaron" aparece solo con origen_tareas, con sus fuentes', () => {
  const recetas = espacio.listarRecetas();
  const modulos = espacio.listarModulos();
  const pasosDe = (config, id) => {
    const e = entregablesDe(config, recetas, modulos).find((x) => x.id === id);
    return recetaEfectiva(e, config, recetas, modulos);
  };

  for (const id of ['daily', 'registro-tareas']) {
    const sin = pasosDe(ejemplo, id);
    assert.ok(!sin.receta.pasos.some((p) => p.id === 'pedidos'), `${id} sin origen_tareas`);
    assert.ok(!sin.modulos.includes('pedidos-recibidos'));
    const vacio = pasosDe({ ...ejemplo, origen_tareas: [] }, id);
    assert.ok(!vacio.receta.pasos.some((p) => p.id === 'pedidos'), `${id} con origen_tareas vacío`);
  }

  const config = structuredClone(ejemplo);
  config.origen_tareas = [{ fuente: 'slack', canales: ['#pedidos-producto'] }, { fuente: 'mail' }];
  for (const id of ['daily', 'registro-tareas']) {
    const ef = pasosDe(config, id);
    const ids = ef.receta.pasos.map((p) => p.id);
    assert.equal(ids.indexOf('pedidos'), ids.indexOf('redactar') - 1, `${id}: pedidos justo antes de redactar`);
    const paso = ef.receta.pasos.find((p) => p.id === 'pedidos');
    assert.deepEqual(paso.usa, ['slack', 'mail']);
    assert.ok(ef.receta.fuentes.some((x) => x.id === 'mail'), `${id}: suma la fuente mail`);
    assert.ok(ef.modulos.includes('pedidos-recibidos'));
    assert.match(ef.instrucciones, /pedidos que me llegaron/i);
  }

  // El flujo de la daily dibuja el nodo con esas dos fuentes conectadas.
  const g = grafoEntregable({ entregableId: 'daily', config, recetas, modulos, estadoFuentes: {} });
  const nodo = g.nodes.find((n) => n.id === 'paso:pedidos');
  assert.equal(nodo?.data.titulo, 'Pedidos que me llegaron');
  for (const fuente of ['slack', 'mail']) {
    assert.ok(g.edges.some((a) => a.source === `fuente:${fuente}` && a.target === 'paso:pedidos'), `arista de ${fuente}`);
  }
  // Otros entregables no cambian.
  assert.ok(!pasosDe(config, 'deck-avance').receta.pasos.some((p) => p.id === 'pedidos'));
});

test('las instrucciones del paso de pedidos llevan el detalle de cada origen', () => {
  const config = structuredClone(ejemplo);
  config.origen_tareas = [{ fuente: 'slack', canales: ['#pedidos-producto'], solo_mios: true }, { fuente: 'github', repos: ['acme-ejemplo/rutas-api'] }];
  const prep = espacio.prepararReceta(config, 'daily');
  assert.doesNotMatch(prep.instrucciones, /\{\{/);
  assert.match(prep.instrucciones, /slack: canales #pedidos-producto · solo lo asignado o mencionado a la persona/);
  assert.match(prep.instrucciones, /github: repos acme-ejemplo\/rutas-api/);
  assert.match(prep.instrucciones, /leer_issues_github/);
});

test('la config valida el origen de tareas contra las fuentes definidas', () => {
  const recetas = espacio.listarRecetas();
  const modulos = espacio.listarModulos();
  const mala = structuredClone(ejemplo);
  mala.origen_tareas = [{ fuente: 'no_existe' }, { fuente: 'slack', canales: [] }, { fuente: 'slack' }];
  const r = espacio.validarTodo(mala, recetas, modulos);
  const texto = r.errores.map((e) => `${e.ruta} ${e.mensaje}`).join('\n');
  assert.match(texto, /no_existe/);
  assert.match(texto, /repetida/);
  const sinBarra = structuredClone(ejemplo);
  sinBarra.origen_tareas = [{ fuente: 'github', repos: ['sin-barra'] }];
  assert.match(espacio.validarTodo(sinBarra, recetas, modulos).errores.map((e) => e.ruta).join(), /origen_tareas\/0\/repos/);
  const buena = structuredClone(ejemplo);
  buena.origen_tareas = [{ fuente: 'slack', canales: ['#pedidos-producto'], solo_mios: true }];
  assert.equal(espacio.validarTodo(buena, recetas, modulos).ok, true);
});

test('leerIssuesGithub arma los issues asignados con un gh falso', async () => {
  const issue = (n, extra) => ({
    number: n, title: `Issue ${n}`, body: `Pedido ${n}`, state: 'OPEN', stateReason: null,
    createdAt: '2026-10-06T13:00:00Z', updatedAt: '2026-10-07T13:00:00Z', closedAt: null,
    url: `https://github.com/acme-ejemplo/app/issues/${n}`, author: { login: 'beto-ejemplo' }, labels: [{ name: 'pedido' }], ...extra,
  });
  const lista = [
    issue(1),
    issue(2, { state: 'CLOSED', stateReason: 'COMPLETED', closedAt: '2026-10-07T15:00:00Z' }),
    issue(3, { createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z' }), // fuera de la ventana
  ];
  const llamadas = [];
  const ejecutor = async (cmd, args) => {
    llamadas.push([cmd, ...args].join(' '));
    if (args.includes('acme-ejemplo/sin-acceso')) return { ok: false, stdout: '', stderr: 'Could not resolve to a Repository' };
    return { ok: true, stdout: JSON.stringify(lista), stderr: '' };
  };
  const config = {
    zona_horaria: ZONA,
    proyectos: [{ nombre: 'Acme', repos: ['acme-ejemplo/app', 'acme-ejemplo/otro'] }],
    origen_tareas: [{ fuente: 'github', repos: ['acme-ejemplo/app', 'acme-ejemplo/sin-acceso'] }],
  };
  const r = await f.leerIssuesGithub({ config, desde: '2026-10-06', hasta: '2026-10-07', ejecutor });
  // Sin "repos" usa los del origen de tareas, no todos los de los proyectos.
  assert.equal(llamadas.length, 2);
  assert.ok(llamadas.every((l) => /^gh issue list --repo \S+ --assignee @me /.test(l)), llamadas.join('\n'));
  const app = r.repos.find((x) => x.repo === 'acme-ejemplo/app');
  assert.deepEqual(app.issues.map((i) => i.ref), ['acme-ejemplo/app#1', 'acme-ejemplo/app#2']);
  assert.equal(app.issues[0].estado, 'abierto');
  assert.equal(app.issues[1].estado, 'cerrado (completed)');
  assert.equal(app.issues[1].cerrado_el, '2026-10-07');
  assert.equal(app.issues[0].pedido_por, 'beto-ejemplo');
  assert.equal(app.proyecto, 'Acme');
  assert.equal(r.repos.find((x) => x.repo === 'acme-ejemplo/sin-acceso').ok, false);
  assert.deepEqual(r.refs, ['acme-ejemplo/app#1', 'acme-ejemplo/app#2']);
  assert.match(r.resumen, /2 issues asignados/);
  assert.match(r.resumen, /sin acceso a acme-ejemplo\/sin-acceso/);

  // Pasar "repos" limita la lectura; sin origen_tareas se usan los repos de los proyectos.
  llamadas.length = 0;
  await f.leerIssuesGithub({ config: { ...config, origen_tareas: undefined }, desde: '2026-10-06', hasta: '2026-10-07', ejecutor });
  assert.equal(llamadas.length, 2);
  llamadas.length = 0;
  await f.leerIssuesGithub({ config, desde: '2026-10-06', hasta: '2026-10-07', repos: ['acme-ejemplo/otro'], ejecutor });
  assert.equal(llamadas.length, 1);
  assert.match(llamadas[0], /--repo acme-ejemplo\/otro/);
});
