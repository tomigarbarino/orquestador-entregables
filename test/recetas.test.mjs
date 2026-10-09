// Tests de cada receta y cada módulo: esquema, coherencia interna, grafo, instrucciones y corrida demo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';

const dirPrueba = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-recetas-'));
process.env.ORQ_ESPACIO = dirPrueba;
process.env.ORQ_DEMO_PAUSA = '0';

const { RAIZ } = await import('../lib/rutas.mjs');
const espacio = await import('../lib/espacio.mjs');
const { grafoEntregable, MEDIDAS } = await import('../lib/grafo.mjs');
const { entregablesDe } = await import('../lib/receta-efectiva.mjs');
const { contextoPlantilla, completar } = await import('../lib/plantilla.mjs');
const { simularCorrida } = await import('../lib/demo.mjs');
const corridas = await import('../lib/corridas.mjs');

await espacio.asegurarEspacio();
const ejemplo = YAML.parse(fs.readFileSync(path.join(RAIZ, 'config.example.yaml'), 'utf8'));
const recetas = espacio.listarRecetas();
const modulos = espacio.listarModulos();
const catalogo = espacio.catalogo();

function conTodosLosModulos(config) {
  const c = structuredClone(config);
  for (const m of modulos) c.modulos[m.clave] = { activo: true };
  for (const id of ['jira', 'ollama']) c.fuentes[id] = { ...c.fuentes[id], activo: true };
  return c;
}

// Ningún par de nodos se toca: entre dos cajas queda al menos 16 px en x o en y.
function sinSuperposicion(g, contexto) {
  const m = g.medidas || MEDIDAS.entregable;
  for (let i = 0; i < g.nodes.length; i++) {
    for (let j = i + 1; j < g.nodes.length; j++) {
      const a = g.nodes[i].position;
      const b = g.nodes[j].position;
      const separadosX = Math.abs(a.x - b.x) >= m.ancho + 16;
      const separadosY = Math.abs(a.y - b.y) >= m.alto + 16;
      assert.ok(separadosX || separadosY, `${contexto}: ${g.nodes[i].id} y ${g.nodes[j].id} se tocan`);
    }
  }
}

const DISPOSICIONES = [
  ['ancha', { disposicion: 'ancha' }],
  ['angosta', { disposicion: 'angosta' }],
  ['compacta', { disposicion: 'angosta', compacto: true }],
];

const VARIANTES = [
  ['config de ejemplo', ejemplo],
  ['con todos los módulos', conTodosLosModulos(ejemplo)],
];

for (const [id, r] of Object.entries(recetas)) {
  test(`receta ${id}: esquema y coherencia interna`, () => {
    const v = espacio.validadores().receta(r.receta);
    assert.equal(v.ok, true, JSON.stringify(v.errores));
    assert.equal(path.basename(r.ruta), id, 'el id coincide con la carpeta');
    const fuentes = new Set(r.receta.fuentes.map((f) => f.id));
    for (const p of r.receta.pasos) {
      for (const u of p.usa || []) assert.ok(fuentes.has(u), `el paso ${p.id} usa "${u}", que no es una fuente de la receta`);
    }
    for (const f of fuentes) assert.ok(catalogo.fuentes[f], `la fuente "${f}" no está en el catálogo`);
    assert.ok(r.receta.pasos.some((p) => p.id === 'redactar'), 'tiene un paso "redactar" (los módulos se enganchan ahí)');
    assert.equal(new Set(r.receta.pasos.map((p) => p.id)).size, r.receta.pasos.length, 'ids de pasos únicos');
    assert.ok(r.instrucciones.trim().length > 200, 'tiene instrucciones');
  });
}

test('módulos: definiciones válidas y anclas existentes', () => {
  for (const m of modulos) {
    assert.ok(['entregable', 'extension'].includes(m.tipo), `${m.id}: tipo`);
    if (m.tipo === 'entregable') {
      assert.ok(recetas[m.entregable_por_defecto.receta], `${m.id}: su receta existe`);
      continue;
    }
    for (const [destino, inserciones] of Object.entries(m.aplica_a)) {
      const objetivos = destino === '*' ? Object.values(recetas) : [recetas[destino]];
      for (const r of objetivos) {
        assert.ok(r, `${m.id}: la receta ${destino} existe`);
        for (const ins of inserciones) {
          const ancla = ins.antes_de || ins.despues_de;
          assert.ok(r.receta.pasos.some((p) => p.id === ancla), `${m.id}: el paso "${ancla}" existe en ${r.id}`);
        }
      }
    }
    for (const f of m.fuentes || []) assert.ok(catalogo.fuentes[f], `${m.id}: la fuente ${f} está en el catálogo`);
  }
});

for (const [nombre, config] of VARIANTES) {
  for (const e of entregablesDe(config, recetas, modulos)) {
    test(`flujo ${e.id} (${nombre}): grafo completo e instrucciones sin huecos`, () => {
      for (const [disp, opciones] of DISPOSICIONES) {
        const g = grafoEntregable({ entregableId: e.id, config, recetas, modulos, estadoFuentes: {}, ...opciones });
        const ctx = `${disp}`;
        assert.equal(g.error, undefined, g.error);
        const ids = new Set(g.nodes.map((n) => n.id));
        for (const fijo of ['disparador', 'control', 'destino']) assert.ok(ids.has(fijo), `${ctx}: falta ${fijo}`);
        assert.ok(g.nodes.some((n) => n.data.tipo === 'fuente'), 'tiene fuentes');
        assert.ok(g.nodes.some((n) => n.data.tipo === 'paso'), 'tiene pasos');
        for (const a of g.edges) assert.ok(ids.has(a.source) && ids.has(a.target), `arista colgada ${a.id}`);
        // Las fuentes no tienen entrada (alimentan a un paso); todo lo demás, salvo el disparador, sí.
        for (const n of g.nodes.filter((x) => !['disparador', 'fuente'].includes(x.data.tipo))) {
          assert.ok(g.edges.some((a) => a.target === n.id), `${ctx}: el nodo ${n.id} no tiene entrada`);
        }
        for (const n of g.nodes.filter((x) => x.data.tipo === 'fuente')) {
          assert.ok(g.edges.some((a) => a.source === n.id && a.target.startsWith('paso:')), `${ctx}: la fuente ${n.id} no sale a ningún paso`);
        }
        for (const a of g.edges) assert.equal(a.type, 'smoothstep', `${ctx}: ${a.id} no es smoothstep`);
        const pos = new Set(g.nodes.map((n) => `${n.position.x},${n.position.y}`));
        assert.equal(pos.size, g.nodes.length, `${ctx}: dos nodos en la misma posición`);
        sinSuperposicion(g, `${e.id} ${ctx}`);
      }
      const base = recetas[e.receta];
      const instrucciones = completar(base.instrucciones, contextoPlantilla(config, e));
      assert.doesNotMatch(instrucciones, /\{\{/, 'quedó un {{dato}} sin completar');
    });
  }
}

for (const id of ['daily', 'registro-tareas', 'deck-avance', 'reunion-comercial', 'digest-jira']) {
  test(`corrida demo de ${id}: pasa el control de evidencia y deja el borrador`, async () => {
    const config = conTodosLosModulos(ejemplo);
    const prep = espacio.prepararReceta(config, id);
    const idCorrida = corridas.nuevaCorrida({ entregable: id, zona: config.zona_horaria });
    await simularCorrida({ id: idCorrida, entregable: id, prep, config });
    const c = corridas.leerCorrida(idCorrida);
    assert.equal(c.meta.estado, 'lista');
    assert.ok(c.borrador.length > 50);
    assert.ok(c.evidencia.items.length >= 1, 'al menos un ítem con evidencia');
    assert.equal(c.nodos.destino.estado, 'ok');
  });
}

test.after(() => fs.rmSync(dirPrueba, { recursive: true, force: true }));
