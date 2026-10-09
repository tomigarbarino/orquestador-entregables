import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ORIGEN_PRUEBA,
  avisoCoherencia,
  archivoHumano,
  destinoHumano,
  dinero,
  entregableDePropuesta,
  entregableSugerido,
  fecha,
  fechaHora,
  haceCuanto,
  nombreEntregable,
  origenHumano,
  plural,
  refHumana,
  rutaHumana,
} from '../web/src/textos.js';

const s = {
  demo: true,
  config: {
    fuentes: { github: { activo: true }, calendario: { activo: false } },
    entregables: {
      daily: { receta: 'daily', activo: true, fuentes: ['github', 'calendario'] },
      'registro-tareas': { receta: 'registro-tareas', activo: true },
      deck: { receta: 'deck-avance', activo: false, nombre: 'Deck semanal' },
    },
  },
  recetas: {
    daily: { receta: { nombre: 'Daily' } },
    'registro-tareas': { receta: { nombre: 'Registro de tareas' } },
    'deck-avance': { receta: { nombre: 'Deck de avance' } },
  },
  fuentes: { github: { nombre: 'GitHub' }, calendario: { nombre: 'Calendario' } },
};

test('rutaHumana traduce rutas de entregables', () => {
  assert.deepEqual(rutaHumana('/entregables/daily/fuentes', s), { texto: 'Daily › Fuentes', pagina: 'entregables', entregable: 'daily' });
  assert.equal(rutaHumana('/fuentes/github', s).pagina, 'conectores');
  assert.equal(rutaHumana('/glosario/0/termino', s).pagina, 'perfil');
  assert.equal(rutaHumana('', s).texto, 'Configuración');
});

test('fechas sin pasar por UTC y entradas inválidas', () => {
  const f = fecha('2026-10-09');
  assert.ok(f.includes('9'));
  assert.ok(!f.includes('8'));
  assert.equal(f, '9 oct 2026');
  assert.equal(fecha('x'), '');
  assert.equal(fechaHora('x'), '');
  assert.equal(haceCuanto('x'), '');
  assert.equal(dinero('x'), '');
  assert.equal(dinero(0.125), 'US$ 0,13');
});

test('origenHumano con clave desconocida', () => {
  assert.equal(origenHumano(ORIGEN_PRUEBA, 'otra'), 'Otro origen');
  assert.equal(origenHumano(ORIGEN_PRUEBA, 'rutina'), 'Programada');
});

test('refHumana', () => {
  assert.equal(refHumana('github', 'acme-ejemplo/rutas-api#212').texto, 'PR #212 · rutas-api');
  assert.equal(refHumana('github', 'acme-ejemplo/rutas-api#212').title, 'acme-ejemplo/rutas-api#212');
  assert.equal(refHumana('sesiones_ia', 'claude:7b2e9d14').texto, 'Sesión de Claude Code');
  assert.equal(refHumana('mail', 'algo').texto, 'algo');
});

test('avisoCoherencia entiende los dos formatos de validar.mjs', () => {
  const apagada = avisoCoherencia({ ruta: '/entregables/daily/fuentes', mensaje: 'la fuente "calendario" está apagada' }, s);
  assert.equal(apagada.accion, 'prender');
  assert.equal(apagada.fuente, 'calendario');
  assert.equal(apagada.entregable, 'daily');
  assert.ok(apagada.texto.startsWith('Calendario'));
  const necesita = avisoCoherencia({ ruta: '/entregables/daily/fuentes', mensaje: 'la receta necesita la fuente "github" (los PRs del día)' }, s);
  assert.equal(necesita.accion, null);
  assert.equal(necesita.fuente, 'github');
  assert.ok(necesita.texto.includes('GitHub'));
  assert.ok(!necesita.texto.includes('receta'));
});

test('destinoHumano', () => {
  assert.equal(destinoHumano({ tipo: 'borrador' }).titulo, 'Queda como borrador');
  assert.equal(destinoHumano(undefined).titulo, 'Queda como borrador');
  assert.equal(destinoHumano({ tipo: 'slack', canal: '#equipo' }).titulo, 'Slack · #equipo');
});

test('entregableSugerido', () => {
  assert.equal(entregableSugerido(s), 'daily');
  const sinDaily = { ...s, config: { ...s.config, entregables: { ...s.config.entregables, daily: { ...s.config.entregables.daily, activo: false } } } };
  assert.equal(entregableSugerido(sinDaily), 'registro-tareas');
  assert.equal(entregableSugerido({ config: { entregables: {} } }), null);
});

test('entregableDePropuesta', () => {
  assert.equal(entregableDePropuesta({ regla: { receta: 'daily' } }, s), 'daily');
  assert.equal(entregableDePropuesta({ entregable: 'deck' }, s), 'deck');
  assert.equal(entregableDePropuesta({ diffs: [{ archivo: 'recetas/deck-avance/instrucciones.md' }] }, s), 'deck');
  assert.equal(entregableDePropuesta({ diffs: [{ archivo: 'config.yaml' }] }, s), null);
});

test('nombres y archivos', () => {
  assert.equal(nombreEntregable(s, 'deck'), 'Deck semanal');
  assert.equal(nombreEntregable(s, 'daily'), 'Daily');
  assert.equal(archivoHumano('config.yaml', s), 'Configuración');
  assert.equal(archivoHumano('recetas/daily/instrucciones.md', s), 'Instrucciones de Daily');
  assert.equal(plural(1, 'quedó afuera', 'quedaron afuera'), 'quedó afuera');
  assert.equal(plural(3, 'quedó afuera', 'quedaron afuera'), 'quedaron afuera');
});
