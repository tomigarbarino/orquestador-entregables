// Tests de Slack y Teams como fuentes propias (y del alias "chat"). Corren con: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';

process.env.ORQ_ESPACIO = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-chat-'));

const { RAIZ } = await import('../lib/rutas.mjs');
const espacio = await import('../lib/espacio.mjs');
const { parsearMcpList, estadoFuentes } = await import('../lib/conectores.mjs');
const { contextoPlantilla } = await import('../lib/plantilla.mjs');

await espacio.asegurarEspacio();
const ejemplo = YAML.parse(fs.readFileSync(path.join(RAIZ, 'config.example.yaml'), 'utf8'));
const catalogo = espacio.catalogo();
const ENVIAR = /send|post|create|delete|update|reply|schedule|react|write/i;

const detectar = (lineas) => ({ mcp: { ok: true, servidores: parsearMcpList(lineas.join('\n')) }, gh: { ok: true }, ollama: { ok: false } });
const M365 = 'claude.ai Microsoft 365: https://ejemplo.invalid/m365 (HTTP) - ✔ Connected';
const SLACK = 'claude.ai Slack: https://ejemplo.invalid/slack (HTTP) - ✔ Connected';
const SLACK_SIN_AUTH = 'claude.ai Slack: https://ejemplo.invalid/slack (HTTP) - ! Needs authentication';

const activas = (extra = {}) => {
  const c = structuredClone(ejemplo);
  c.fuentes.slack.activo = true;
  c.fuentes.teams.activo = true;
  return Object.assign(c, extra);
};

test('el catálogo tiene slack y teams solo con herramientas de lectura, y chat como alias', () => {
  const { slack, teams, chat } = catalogo.fuentes;
  for (const f of [slack, teams]) {
    assert.ok(f.como_referenciar && f.como_conectar);
    assert.ok(!f.alias);
  }
  const hs = slack.proveedores.flatMap((p) => p.herramientas);
  assert.ok(hs.length && hs.every((h) => h.startsWith('slack_')) && !hs.some((h) => ENVIAR.test(h)));
  assert.deepEqual(teams.proveedores.map((p) => p.nombre), ['Microsoft 365']);
  assert.deepEqual(teams.proveedores[0].herramientas, ['teams_list_chats', 'chat_message_search', 'teams_list_channel_messages', 'teams_list_channels', 'teams_list_teams', 'read_resource']);
  assert.equal(chat.alias, true);
});

test('estadoFuentes: slack y teams tienen estado propio', () => {
  const e = estadoFuentes(activas(), detectar([M365, SLACK_SIN_AUTH]), catalogo);
  assert.equal(e.slack.conectada, false);
  assert.match(e.slack.detalle, /falta autorizarlo/);
  assert.equal(e.teams.conectada, true);
  assert.equal(e.teams.servidor, 'claude.ai Microsoft 365');
  assert.ok(e.teams.herramientas.includes('mcp__claude_ai_Microsoft_365__teams_list_chats'));
  assert.ok(e.teams.herramientas.includes('mcp__claude_ai_Microsoft_365__chat_message_search'));
  assert.equal(e.teams.registrar_con, 'registrar_lectura');
  assert.match(e.teams.como_referenciar, /^teams:/);

  const ambas = estadoFuentes(activas(), detectar([M365, SLACK]), catalogo);
  assert.equal(ambas.slack.conectada, true);
  assert.equal(ambas.teams.conectada, true);
  assert.ok(ambas.slack.herramientas.every((h) => h.startsWith('mcp__claude_ai_Slack__slack_')));
  const todas = [...ambas.slack.herramientas, ...ambas.teams.herramientas];
  assert.ok(!todas.some((h) => ENVIAR.test(h.split('__').pop())), 'sin herramientas que envíen');
});

test('estadoFuentes: Slack conectado no conecta Teams, y al revés', () => {
  const soloSlack = estadoFuentes(activas(), detectar([SLACK]), catalogo);
  assert.equal(soloSlack.slack.conectada, true);
  assert.equal(soloSlack.teams.conectada, false);
  const soloM365 = estadoFuentes(activas(), detectar([M365]), catalogo);
  assert.equal(soloM365.slack.conectada, false);
  assert.equal(soloM365.teams.conectada, true);
  assert.equal(soloM365.mail.conectada, true, 'mail y calendario usan el mismo servidor');
});

test('alias chat: una config vieja sigue valiendo y resolviendo Slack o Teams', () => {
  const vieja = structuredClone(ejemplo);
  delete vieja.fuentes.slack;
  delete vieja.fuentes.teams;
  vieja.fuentes.chat = { activo: true, via: 'mcp', servidor: 'Slack' };
  vieja.entregables.daily.fuentes = ['github', 'chat'];
  const v = espacio.validarTodo(vieja, espacio.listarRecetas(), espacio.listarModulos());
  assert.equal(v.ok, true, JSON.stringify(v.errores));
  const e = estadoFuentes(vieja, detectar([SLACK]), catalogo);
  assert.equal(e.chat.conectada, true);
  assert.ok(e.chat.herramientas.includes('mcp__claude_ai_Slack__slack_read_channel'));
  const conTeams = estadoFuentes({ ...vieja, fuentes: { chat: { activo: true, via: 'mcp', servidor: 'Microsoft 365' } } }, detectar([M365]), catalogo);
  assert.ok(conTeams.chat.herramientas.includes('mcp__claude_ai_Microsoft_365__teams_list_chats'));
  // Una receta sin lista explícita en el entregable tampoco rompe la validación.
  delete vieja.entregables.daily.fuentes;
  assert.equal(espacio.validarTodo(vieja, espacio.listarRecetas(), espacio.listarModulos()).ok, true);
});

test('esquema: canales, menciones_directas, equipos y chats_directos', () => {
  const listar = () => [espacio.listarRecetas(), espacio.listarModulos()];
  assert.equal(espacio.validarTodo(activas(), ...listar()).ok, true);
  const mala = activas();
  mala.fuentes.slack.canales = '#pedidos-producto';
  mala.fuentes.slack.menciones_directas = 'si';
  mala.fuentes.teams.equipos = [1];
  mala.fuentes.teams.chats_directos = 'no';
  const r = espacio.validarTodo(mala, ...listar());
  assert.equal(r.ok, false);
  const rutas = r.errores.map((x) => x.ruta || x.instancePath || '').join(' ');
  for (const campo of ['canales', 'menciones_directas', 'equipos', 'chats_directos']) assert.match(rutas, new RegExp(campo));
});

test('ejemplo y recetas: slack y teams en lugar de chat', () => {
  assert.equal(ejemplo.fuentes.chat, undefined);
  assert.deepEqual(ejemplo.fuentes.slack.canales, ['#pedidos-producto']);
  const recetas = espacio.listarRecetas();
  for (const id of ['daily', 'registro-tareas', 'reunion-comercial']) {
    const ids = recetas[id].receta.fuentes.map((f) => f.id);
    assert.ok(ids.includes('slack') && ids.includes('teams') && !ids.includes('chat'), id);
    assert.match(recetas[id].instrucciones, /registrar_lectura/);
  }
  const ctx = contextoPlantilla(ejemplo, ejemplo.entregables.daily);
  assert.equal(ctx.fuentes.slack.canales, '#pedidos-producto');
  assert.equal(ctx.fuentes.teams.equipos, 'Producto Acme');
});
