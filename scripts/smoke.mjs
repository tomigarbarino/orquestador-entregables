#!/usr/bin/env node
// Smoke de cada entregable, sin gastar tokens: esquema, grafo, instrucciones completas,
// servidor MCP del orquestador (preparar, reportar y control) y una corrida demo.
//   node scripts/smoke.mjs                  con la config de ejemplo
//   node scripts/smoke.mjs --espacio <dir>  con otra config (se copia a una carpeta temporal: la original no se toca)
// Corre dos veces: con la config tal cual y con todos los módulos prendidos.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { RAIZ, rutas, expandirHome } from '../lib/rutas.mjs';

const args = process.argv.slice(2);
const i = args.indexOf('--espacio');
const origen = i >= 0 && args[i + 1] ? path.resolve(expandirHome(args[i + 1])) : null;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-smoke-'));
process.env.ORQ_ESPACIO = tmp;
process.env.ORQ_DEMO_PAUSA = '0';

if (origen) {
  fs.copyFileSync(path.join(origen, 'config.yaml'), path.join(tmp, 'config.yaml'));
  if (fs.existsSync(path.join(origen, 'recetas'))) fs.cpSync(path.join(origen, 'recetas'), path.join(tmp, 'recetas'), { recursive: true });
} else {
  fs.copyFileSync(rutas.configEjemplo, path.join(tmp, 'config.yaml'));
}

const espacio = await import('../lib/espacio.mjs');
const { grafoEntregable } = await import('../lib/grafo.mjs');
const { entregablesDe } = await import('../lib/receta-efectiva.mjs');
const { correrEntregable } = await import('../lib/orquestacion.mjs');
const corridas = await import('../lib/corridas.mjs');
await espacio.asegurarEspacio();

const configBase = espacio.leerConfig().datos;
const conModulos = structuredClone(configBase);
for (const m of espacio.listarModulos()) conModulos.modulos = { ...(conModulos.modulos || {}), [m.clave]: { activo: true } };
for (const f of ['jira', 'ollama']) if (conModulos.fuentes[f]) conModulos.fuentes[f].activo = true;

function chequear(nombre, fn, fila) {
  try {
    const r = fn();
    fila[nombre] = r === undefined ? 'ok' : r;
  } catch (e) {
    fila[nombre] = `FALLA: ${e.message}`;
  }
}

async function chequearAsync(nombre, fn, fila) {
  try {
    const r = await fn();
    fila[nombre] = r === undefined ? 'ok' : r;
  } catch (e) {
    fila[nombre] = `FALLA: ${e.message}`;
  }
}

const afirmar = (cond, msj) => {
  if (!cond) throw new Error(msj);
};

async function correrVariante(nombre, config) {
  fs.writeFileSync(path.join(tmp, 'config.yaml'), YAML.stringify(config, { lineWidth: 0 }));
  const e = espacio.estadoEspacio();
  afirmar(e.validacion.ok, `config inválida: ${e.validacion.errores.map((x) => `${x.ruta} ${x.mensaje}`).join('; ')}`);
  const lista = entregablesDe(config, e.recetas, e.modulos);
  const transporte = new StdioClientTransport({ command: process.execPath, args: [rutas.mcp, '--modo', 'corrida', '--espacio', tmp], stderr: 'pipe' });
  const cliente = new Client({ name: 'smoke', version: '1' });
  await cliente.connect(transporte);
  const filas = [];
  for (const ent of lista) {
    const fila = { variante: nombre, entregable: ent.id };
    const receta = e.recetas[ent.receta];
    chequear('esquema', () => {
      const v = espacio.validadores().receta(receta.receta);
      afirmar(v.ok, v.errores.map((x) => x.mensaje).join('; '));
    }, fila);
    chequear('grafo', () => {
      const g = grafoEntregable({ entregableId: ent.id, config, recetas: e.recetas, modulos: e.modulos, estadoFuentes: {} });
      afirmar(!g.error, g.error);
      const ids = new Set(g.nodes.map((n) => n.id));
      afirmar(ids.has('disparador') && ids.has('control') && ids.has('destino'), 'faltan nodos fijos');
      for (const a of g.edges) afirmar(ids.has(a.source) && ids.has(a.target), `arista colgada ${a.id}`);
      return `${g.nodes.length} nodos`;
    }, fila);
    chequear('instrucciones', () => {
      const prep = espacio.prepararReceta(config, ent.id);
      afirmar(!/\{\{/.test(prep.instrucciones), 'quedó un {{dato}} sin completar');
    }, fila);
    await chequearAsync('mcp', async () => {
      const r = await cliente.callTool({ name: 'preparar_corrida', arguments: { entregable: ent.id } });
      afirmar(!r.isError, r.content?.[0]?.text);
      const j = JSON.parse(r.content[0].text);
      const paso = j.pasos[0].nodo;
      const rep = await cliente.callTool({ name: 'reportar_paso', arguments: { corrida: j.corrida, nodo: paso, estado: 'ok', resultado: 'smoke' } });
      afirmar(!rep.isError, `reportar_paso: ${rep.content?.[0]?.text}`);
      const mal = await cliente.callTool({ name: 'guardar_borrador', arguments: { corrida: j.corrida, borrador: 'x', items: [{ texto: 'sin evidencia', evidencia: [] }] } });
      afirmar(mal.isError, 'el control dejó pasar un ítem sin evidencia');
      return `${j.pasos.length} pasos, ${j.fuentes.filter((f) => f.conectada).length}/${j.fuentes.length} fuentes conectadas`;
    }, fila);
    await chequearAsync('demo', async () => {
      const resultado = await new Promise((resolve, reject) => {
        correrEntregable({ entregable: ent.id, origen: 'interfaz', demo: true, alTerminar: resolve }).then(({ id }) => { fila._corrida = id; }).catch(reject);
      });
      afirmar(resultado.ok, 'la corrida demo falló');
      const c = corridas.leerCorrida(fila._corrida);
      afirmar(c.meta.estado === 'lista' && c.borrador, `estado ${c.meta.estado}`);
      delete fila._corrida;
      return `${c.evidencia.items.length} con evidencia`;
    }, fila);
    filas.push(fila);
  }
  await cliente.close();
  return filas;
}

const todas = [
  ...(await correrVariante('config', configBase)),
  ...(await correrVariante('módulos on', conModulos)),
];
fs.rmSync(tmp, { recursive: true, force: true });

const columnas = ['variante', 'entregable', 'esquema', 'grafo', 'instrucciones', 'mcp', 'demo'];
console.log(columnas.join(' | '));
for (const f of todas) console.log(columnas.map((c) => f[c] ?? '-').join(' | '));
const fallas = todas.filter((f) => columnas.some((c) => String(f[c]).startsWith('FALLA')));
console.log(fallas.length ? `\n✗ ${fallas.length} entregable(s) con fallas` : `\n✓ ${todas.length} flujos sin fallas`);
process.exit(fallas.length ? 1 : 0);
