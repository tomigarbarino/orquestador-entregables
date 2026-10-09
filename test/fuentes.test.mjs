// Tests de los lectores propios (lib/fuentes-locales.mjs). Corren con: npm test
// Las sesiones se arman con transcripts sintéticos en carpetas temporales y gh se reemplaza
// por un ejecutor falso: no hace falta red ni cuentas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-fuentes-'));
process.env.ORQ_ESPACIO = path.join(base, 'espacio');
fs.mkdirSync(process.env.ORQ_ESPACIO, { recursive: true });

const f = await import('../lib/fuentes-locales.mjs');

const ZONA = 'America/Argentina/Buenos_Aires';
const escribirJsonl = (archivo, lineas) => {
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  fs.writeFileSync(archivo, lineas.map((l) => JSON.stringify(l)).join('\n'));
};

// ---------- Sesiones ----------

const dirClaude = path.join(base, 'claude');
const dirCodex = path.join(base, 'codex');
const cwdProyecto = path.join(base, 'proyectos', 'acme-ejemplo');
const relleno = 'Detalle del trabajo hecho en la pantalla de búsquedas. '.repeat(60);

const usuario = (t, timestamp, extra = {}) => ({ type: 'user', timestamp, cwd: cwdProyecto, sessionId: 'aaaa1111-2222', message: { role: 'user', content: t }, ...extra });
const asistente = (t, timestamp, id) => ({ type: 'assistant', timestamp, cwd: cwdProyecto, sessionId: 'aaaa1111-2222', message: { id, role: 'assistant', content: [{ type: 'text', text: t }] } });

escribirJsonl(path.join(dirClaude, 'proyecto-acme', 'aaaa1111-2222.jsonl'), [
  { type: 'custom-title', customTitle: 'Búsquedas de acme-ejemplo' },
  // Fuera de la ventana: no cuenta.
  usuario('pedido viejo', '2026-10-01T15:00:00Z'),
  asistente('Falta algo viejo que no tiene que aparecer', '2026-10-01T15:01:00Z', 'm0'),
  // 06/10 hora local
  usuario('armá el login de acme-ejemplo', '2026-10-06T14:00:00Z'),
  { type: 'user', timestamp: '2026-10-06T14:01:00Z', cwd: cwdProyecto, message: { role: 'user', content: [{ type: 'tool_result', content: 'salida de una herramienta' }] } },
  usuario('<system-reminder>ruido</system-reminder>', '2026-10-06T14:01:30Z'),
  usuario('meta', '2026-10-06T14:01:40Z', { isMeta: true }),
  asistente('Voy a revisar el código.', '2026-10-06T14:02:00Z', 'm1'),
  asistente('Listo el login.', '2026-10-06T14:05:00Z', 'm2'),
  asistente('\nPendientes:\n- probar en QA con Ana Ejemplo\n- revisar textos\n\nNada más.', '2026-10-06T14:05:01Z', 'm2'),
  { ...asistente('Esto es de un subagente: Falta nada', '2026-10-06T14:06:00Z', 'm3'), isSidechain: true },
  // 02:30 UTC del 07/10 = 23:30 del 06/10; el cierre llega a la 01:00 del 07/10.
  usuario([{ type: 'text', text: 'ahora hacé el deploy' }], '2026-10-07T02:30:00Z'),
  asistente(`Hecho el deploy. ${relleno}\n**Riesgo:** el webhook no tiene reintentos.\nFalta cambiar las URLs en la configuración.`, '2026-10-07T04:00:00Z', 'm4'),
]);

escribirJsonl(path.join(dirCodex, '2026', '10', '07', 'rollout-x.jsonl'), [
  { type: 'session_meta', timestamp: '2026-10-07T12:00:00Z', payload: { id: 'cccc2222-3333', cwd: cwdProyecto, originator: 'codex_cli' } },
  { type: 'event_msg', timestamp: '2026-10-07T12:01:00Z', payload: { type: 'user_message', message: 'revisá el reporte de horas' } },
  { type: 'event_msg', timestamp: '2026-10-07T12:05:00Z', payload: { type: 'agent_message', message: 'Revisé el reporte.\n- Queda confirmar las horas del viernes' } },
  { type: 'response_item', timestamp: '2026-10-07T12:05:00Z', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Revisé el reporte.\n- Queda confirmar las horas del viernes' }] } },
  { type: 'event_msg', timestamp: '2026-10-07T12:05:01Z', payload: { type: 'task_complete', last_agent_message: 'Revisé el reporte.\n- Queda confirmar las horas del viernes' } },
]);

// Una sesión que corrió dentro del espacio del orquestador: no se cuenta.
escribirJsonl(path.join(dirClaude, 'espacio', 'bbbb0000.jsonl'), [
  { ...usuario('corré la daily', '2026-10-07T12:00:00Z'), cwd: process.env.ORQ_ESPACIO, sessionId: 'bbbb0000' },
  { ...asistente('Listo', '2026-10-07T12:01:00Z', 'x'), cwd: process.env.ORQ_ESPACIO, sessionId: 'bbbb0000' },
]);

const catalogo = { fuentes: { sesiones_ia: { carpetas: { claude: dirClaude, codex: dirCodex } } } };
const config = { zona_horaria: ZONA, fuentes: { sesiones_ia: { codex: true } } };

test('leerSesiones devuelve hitos partidos por fecha local, pendientes y un cierre largo con su final', async () => {
  const r = await f.leerSesiones({ config, desde: '2026-10-06', hasta: '2026-10-07', catalogo });
  assert.deepEqual(r.refs.sort(), ['claude:aaaa1111', 'codex:cccc2222']);
  const c = r.sesiones.find((s) => s.ref === 'claude:aaaa1111');
  assert.equal(c.titulo, 'Búsquedas de acme-ejemplo');
  assert.equal(c.mensajes_de_la_persona, 2, 'no cuenta resultados de herramientas, avisos del sistema ni mensajes meta');
  assert.equal(c.primer_pedido, 'armá el login de acme-ejemplo');
  assert.equal(c.inicio, '2026-10-06');
  assert.equal(c.fin, '2026-10-07');

  assert.equal(c.hitos.length, 2);
  assert.deepEqual(c.hitos.map((h) => h.fecha), ['2026-10-06', '2026-10-07']);
  assert.equal(c.hitos[0].pedido, 'armá el login de acme-ejemplo');
  assert.match(c.hitos[0].cierre, /^Listo el login\. Pendientes:/, 'une las partes del mismo mensaje y toma la última respuesta, no la intermedia');
  assert.equal(c.hitos[1].pedido, 'ahora hacé el deploy');
  assert.ok(c.hitos[1].cierre.length <= 600);
  assert.match(c.hitos[1].cierre, /Falta cambiar las URLs en la configuración\.$/, 'el recorte conserva el final');

  assert.ok(c.cierre.length <= 1500);
  assert.match(c.cierre, /^Hecho el deploy\./);
  assert.match(c.cierre, /Falta cambiar las URLs en la configuración\.$/);

  assert.deepEqual(c.pendientes, [
    'Pendientes: probar en QA con Ana Ejemplo; revisar textos',
    'Riesgo: el webhook no tiene reintentos.',
    'Falta cambiar las URLs en la configuración.',
  ]);
  assert.ok(!JSON.stringify(c).includes('subagente'), 'ignora los mensajes de subagentes');
  assert.ok(!JSON.stringify(c).includes('algo viejo'), 'ignora lo de fuera de la ventana');

  const x = r.sesiones.find((s) => s.ref === 'codex:cccc2222');
  assert.equal(x.herramienta, 'Codex');
  assert.equal(x.hitos.length, 1);
  assert.equal(x.hitos[0].fecha, '2026-10-07');
  assert.deepEqual(x.pendientes, ['Queda confirmar las horas del viernes'], 'sin duplicados aunque Codex repita el mensaje');
});

test('extraerPendientes reconoce las palabras clave, limpia el formato y respeta el largo', () => {
  const texto = [
    '## Próximos pasos',
    '1. Publicar en producción',
    '- **Bloqueo:** falta el permiso de DNS',
    '> Lo único que persiste es el aviso de sesión',
    'Lo que queda: revisar la carga',
    'Quedan dos tickets abiertos',
    'Esto no es un pendiente',
    'Quedaron hechos los dos módulos',
    `Falta ${'x'.repeat(400)}`,
  ].join('\n');
  const p = f.extraerPendientes(texto);
  assert.deepEqual(p.slice(0, 5), [
    'Próximos pasos: Publicar en producción',
    'Bloqueo: falta el permiso de DNS',
    'Lo único que persiste es el aviso de sesión',
    'Lo que queda: revisar la carga',
    'Quedan dos tickets abiertos',
  ]);
  assert.equal(p.length, 6);
  assert.ok(p[5].length <= 240);
});

test('elegirHitos se queda con 10 y conserva al menos uno por día', () => {
  const hitos = [];
  for (let i = 0; i < 3; i++) hitos.push({ fecha: '2026-10-05', pedido: `a${i}`, cierre: 'ok' });
  for (let i = 0; i < 11; i++) hitos.push({ fecha: '2026-10-06', pedido: `b${i}`, cierre: 'ok' });
  const e = f.elegirHitos(hitos);
  assert.equal(e.length, 10);
  assert.deepEqual(e[0], { fecha: '2026-10-05', pedido: 'a2', cierre: 'ok' }, 'el último del día más viejo sigue estando');
  assert.equal(e.at(-1).pedido, 'b10');
  assert.deepEqual(f.elegirHitos(hitos.slice(0, 4)), hitos.slice(0, 4));
});

test('limitarTamano recorta primero los hitos de las sesiones más viejas y las marca', () => {
  const hito = (i) => ({ fecha: '2026-10-06', pedido: `pedido ${i}`, cierre: 'c'.repeat(600) });
  const sesiones = [3, 1, 2].map((n) => ({
    ref: `claude:000000${n}0`, inicio: `2026-10-0${n}`, cierre: 'z'.repeat(1500), pendientes: [],
    hitos: Array.from({ length: 10 }, (_, i) => hito(i)),
  }));
  const max = 15_000;
  f.limitarTamano(sesiones, max);
  assert.ok(JSON.stringify(sesiones).length <= max);
  const porRef = Object.fromEntries(sesiones.map((s) => [s.ref, s]));
  assert.equal(porRef['claude:00000010'].recortado, true);
  assert.equal(porRef['claude:00000030'].recortado, undefined, 'la más nueva queda entera');
  assert.equal(porRef['claude:00000030'].hitos.length, 10);
  const chica = [{ ref: 'claude:1', inicio: '2026-10-01', hitos: [hito(1)], pendientes: [] }];
  f.limitarTamano(chica, 80_000);
  assert.equal(chica[0].recortado, undefined);
});

test('recortarExtremos deja el principio y el final', () => {
  const t = `inicio ${'m'.repeat(500)} final`;
  const r = f.recortarExtremos(t, 100);
  assert.ok(r.length <= 100);
  assert.match(r, /^inicio/);
  assert.match(r, /final$/);
  assert.equal(f.recortarExtremos('corto', 100), 'corto');
});

// ---------- GitHub: parseo puro ----------

test('autoresGithub junta github_usuario y github_usuarios sin repetir', () => {
  assert.deepEqual(f.autoresGithub({ persona: { github_usuario: 'Ana-Ejemplo', github_usuarios: ['ana-ejemplo', 'ana-alt'] } }), ['ana-ejemplo', 'ana-alt']);
  assert.deepEqual(f.autoresGithub({ persona: {} }), []);
  assert.deepEqual(f.autoresGithub({}), []);
});

test('resumirCuerpoPr prioriza Problema, Cambios y Riesgos y respeta el largo', () => {
  const body = [
    '<!-- plantilla -->',
    '## Problema',
    'El link de la entrevista no abría sin voz.',
    '## Capturas',
    '![img](https://ejemplo.example/a.png)',
    'Muchas capturas que no importan. '.repeat(30),
    '## Cambios',
    '- El link abre aunque no haya voz.',
    '- Se avisa al candidato.',
    '**Riesgos conocidos:** el aviso no se traduce todavía.',
  ].join('\n');
  const r = f.resumirCuerpoPr(body);
  assert.equal(r, 'Problema: El link de la entrevista no abría sin voz. | Cambios: - El link abre aunque no haya voz. - Se avisa al candidato. | Riesgos: el aviso no se traduce todavía.');
  const largo = f.resumirCuerpoPr(`## Por qué\n${'a '.repeat(900)}\n## Cambios\n${'b '.repeat(900)}\n## Riesgos\nuno solo`);
  assert.ok(largo.length <= 800);
  assert.match(largo, /^Problema: a a/);
  assert.match(largo, /Cambios: b b/);
  assert.match(largo, /Riesgos: uno solo$/, 'una sección corta entra entera');
  assert.equal(f.resumirCuerpoPr('Arregla el botón de guardar.'), 'Arregla el botón de guardar.');
  assert.equal(f.resumirCuerpoPr(''), null);
  assert.equal(f.resumirCuerpoPr(null), null);
});

test('prsIncluidos saca los números de los commits de merge y de squash', () => {
  const commits = [
    { messageHeadline: 'Merge pull request #12 from acme-ejemplo/feat/login' },
    { messageHeadline: 'Arregla el aviso (#15)' },
    { messageHeadline: 'Merge pull request #12 from acme-ejemplo/feat/login' },
    { messageHeadline: 'Merge branch develop into release' },
    { messageHeadline: 'Release (#20)' },
  ];
  assert.deepEqual(f.prsIncluidos(commits, 20), [12, 15]);
  assert.deepEqual(f.prsIncluidos([], 1), []);
  assert.deepEqual(f.prsIncluidos(undefined, 1), []);
});

test('llegoAProduccion interpreta el compare de GitHub', () => {
  assert.equal(f.llegoAProduccion({ status: 'behind', ahead_by: 0, behind_by: 4 }), true);
  assert.equal(f.llegoAProduccion('{"status":"identical"}'), true);
  assert.equal(f.llegoAProduccion({ status: 'ahead' }), false);
  assert.equal(f.llegoAProduccion({ status: 'diverged' }), false);
  assert.equal(f.llegoAProduccion(null), null);
  assert.equal(f.llegoAProduccion('no es json'), null);
});

test('motivoCierre toma el último comentario con texto', () => {
  assert.equal(f.motivoCierre([{ body: 'primero' }, { body: 'Cierro: el código ya está en develop por #9' }, { body: '  ' }]), 'Cierro: el código ya está en develop por #9');
  assert.equal(f.motivoCierre([]), null);
  assert.ok(f.motivoCierre([{ body: 'x'.repeat(500) }]).length <= 300);
});

test('estadoPr nombra la rama y si ya llegó a producción', () => {
  const merged = { mergedAt: '2026-10-06T12:00:00Z', baseRefName: 'develop' };
  assert.equal(f.estadoPr({ ...merged, baseRefName: 'main' }, 'main'), 'mergeado a main (producción)');
  assert.equal(f.estadoPr(merged, 'main', { enProduccion: true, via: 30 }), 'mergeado a develop y ya en producción (vía #30)');
  assert.equal(f.estadoPr(merged, 'main', { enProduccion: true }), 'mergeado a develop y ya en producción');
  assert.equal(f.estadoPr(merged, 'main', { enProduccion: false }), 'mergeado a develop; todavía no llegó a producción (main)');
  assert.match(f.estadoPr(merged, 'main'), /no se pudo comprobar/);
  assert.equal(f.estadoPr({ state: 'OPEN', baseRefName: 'main' }, 'main'), 'abierto');
  assert.equal(f.estadoPr({ state: 'OPEN', isDraft: true, baseRefName: 'develop' }, 'main'), 'abierto, en borrador, contra develop (no va directo a producción)');
  assert.equal(f.estadoPr({ state: 'CLOSED', baseRefName: 'main' }, 'main'), 'cerrado sin mergear');
});

// ---------- GitHub: leerGithub con un gh falso ----------

test('leerGithub arma estado, cuerpo, incluye, motivo_cierre y en_produccion sin red', async () => {
  const repo = 'acme-ejemplo/app';
  const pr = (n, extra) => ({
    number: n, title: `PR ${n}`, body: `## Problema\nproblema ${n}\n## Cambios\ncambios ${n}`, state: 'MERGED', isDraft: false,
    createdAt: '2026-10-06T13:00:00Z', updatedAt: '2026-10-07T13:00:00Z', closedAt: null, mergedAt: null, mergeCommit: null,
    baseRefName: 'develop', headRefName: `feat/${n}`, url: `https://github.test/${repo}/pull/${n}`, author: { login: 'ana-ejemplo' }, ...extra,
  });
  const lista = [
    pr(10, { mergedAt: '2026-10-06T15:00:00Z', mergeCommit: { oid: 'sha10' } }), // en develop y ya en main vía #30
    pr(11, { mergedAt: '2026-10-07T15:00:00Z', mergeCommit: { oid: 'sha11' } }), // en develop, todavía no en main
    pr(12, { state: 'CLOSED', closedAt: '2026-10-07T16:00:00Z' }), // cerrado sin mergear
    pr(13, { state: 'OPEN', baseRefName: 'main' }), // release abierto
    pr(30, { mergedAt: '2026-10-07T18:00:00Z', baseRefName: 'main', author: { login: 'otra-persona' } }), // release ajeno
    pr(40, { author: { login: 'ana-alt' }, state: 'OPEN' }), // otra cuenta de la persona
    pr(50, { author: { login: 'otra-persona' }, state: 'OPEN' }), // de otra persona: no va
    pr(60, { createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z', state: 'OPEN' }), // fuera de la ventana
  ];
  const llamadas = [];
  const ejecutor = async (cmd, args) => {
    llamadas.push(args.join(' '));
    const ok = (j) => ({ ok: true, stdout: JSON.stringify(j), stderr: '' });
    if (args[0] === 'repo') return ok({ nameWithOwner: repo });
    if (args[0] === 'pr' && args[1] === 'list') return ok(lista);
    if (args[0] === 'pr' && args[1] === 'view') {
      const n = Number(args[2]);
      if (args.at(-1) === 'commits') {
        if (n === 30) return ok({ commits: [{ messageHeadline: 'Merge pull request #10 from acme-ejemplo/feat/10' }] });
        if (n === 13) return ok({ commits: [{ messageHeadline: 'Arregla algo (#11)' }, { messageHeadline: 'Merge pull request #13 from x' }] });
      }
      if (args.at(-1) === 'comments' && n === 12) return ok({ comments: [{ body: 'Cierro sin mergear: ya entró por #10' }] });
      return { ok: false, stdout: '', stderr: 'no encontrado' };
    }
    if (args[0] === 'api') {
      if (args[1].endsWith('main...sha10')) return ok({ status: 'behind', ahead_by: 0, behind_by: 3 });
      if (args[1].endsWith('main...sha11')) return ok({ status: 'ahead', ahead_by: 1, behind_by: 0 });
    }
    return { ok: false, stdout: '', stderr: 'inesperado' };
  };
  const cfg = {
    zona_horaria: ZONA,
    persona: { github_usuario: 'ana-ejemplo', github_usuarios: ['ana-alt'] },
    proyectos: [{ nombre: 'Acme', repos: [repo], rama_produccion: 'main' }],
  };
  const r = await f.leerGithub({ config: cfg, desde: '2026-10-06', hasta: '2026-10-07', ejecutor });
  assert.deepEqual(r.filtro_autor, ['ana-ejemplo', 'ana-alt']);
  const porNumero = Object.fromEntries(r.repos[0].prs.map((p) => [p.numero, p]));
  assert.deepEqual(Object.keys(porNumero).map(Number).sort((a, b) => a - b), [10, 11, 12, 13, 40]);

  assert.equal(porNumero[10].estado, 'mergeado a develop y ya en producción (vía #30)');
  assert.equal(porNumero[10].en_produccion, true);
  assert.equal(porNumero[10].cuerpo, 'Problema: problema 10 | Cambios: cambios 10');
  assert.equal(porNumero[11].estado, 'mergeado a develop; todavía no llegó a producción (main)');
  assert.equal(porNumero[11].en_produccion, false);
  assert.equal(porNumero[12].motivo_cierre, 'Cierro sin mergear: ya entró por #10');
  assert.equal(porNumero[12].en_produccion, null);
  assert.deepEqual(porNumero[13].incluye, [11]);
  assert.equal(porNumero[13].en_produccion, false);
  assert.equal(porNumero[10].incluye, undefined, 'incluye es solo para PRs a producción');
  assert.equal(porNumero[40].autor, 'ana-alt');

  // Las llamadas extra son solo para PRs de la ventana.
  const extra = llamadas.filter((l) => l.startsWith('pr view') || l.startsWith('api'));
  assert.deepEqual(extra.filter((l) => /pr view (40|50|60) /.test(l)), [], 'ni fuera de la ventana, ni de otra persona, ni un PR abierto que no va a producción');
  assert.equal(extra.length, 5, extra.join('\n'));
});

test('leerGithub informa el repo sin acceso sin romper el resto', async () => {
  const ejecutor = async (cmd, args) => (args[0] === 'repo'
    ? { ok: false, stdout: '', stderr: 'Could not resolve to a Repository' }
    : { ok: true, stdout: '[]', stderr: '' });
  const r = await f.leerGithub({
    config: { zona_horaria: ZONA, proyectos: [{ nombre: 'Acme', repos: ['acme-ejemplo/no-existe'] }] },
    desde: '2026-10-06', hasta: '2026-10-07', ejecutor,
  });
  assert.equal(r.repos[0].ok, false);
  assert.match(r.resumen, /sin acceso a acme-ejemplo\/no-existe/);
  assert.equal(r.filtro_autor, null);
});

test('resumirCuerpoPr suma la sección de pendientes o de lo no incluido', () => {
  const r = f.resumirCuerpoPr('## Cambios\nLos clientes externos ya no llegan a las rutas internas.\n## Pendiente (no incluido)\nLos roles internos todavía ven datos de otros clientes.');
  assert.match(r, /Cambios: Los clientes externos/);
  assert.match(r, /Pendiente: Los roles internos todavía ven datos de otros clientes\.$/);
});

test('paginarPorTamano reparte la lista en páginas que no pasan el máximo y no pierde elementos', () => {
  const lista = Array.from({ length: 30 }, (_, i) => ({ ref: `claude:${String(i).padStart(8, '0')}`, texto: 'x'.repeat(900) }));
  const paginas = f.paginarPorTamano(lista, 5_000);
  assert.ok(paginas.length > 1);
  assert.ok(paginas.every((p) => JSON.stringify(p).length <= 5_000));
  assert.deepEqual(paginas.flat(), lista);
  assert.deepEqual(f.paginarPorTamano([], 5_000), [[]]);
  // Un elemento más grande que el máximo va solo en su página, entero.
  const grande = [{ texto: 'y'.repeat(6_000) }, { texto: 'z' }];
  assert.deepEqual(f.paginarPorTamano(grande, 5_000).map((p) => p.length), [1, 1]);
});
