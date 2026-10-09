// Tests de la fuente "reuniones" (notetaker): elección Fathom vs Outlook y validación del esquema.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-reuniones-'));
process.env.ORQ_ESPACIO = path.join(base, 'espacio');
fs.mkdirSync(process.env.ORQ_ESPACIO, { recursive: true });

const { estadoFuentes } = await import('../lib/conectores.mjs');
const espacio = await import('../lib/espacio.mjs');
const { RAIZ } = await import('../lib/rutas.mjs');
const { default: YAML } = await import('yaml');
const ejemplo = YAML.parse(fs.readFileSync(path.join(RAIZ, 'config.example.yaml'), 'utf8'));

const srv = (nombre, estado = 'conectado') => ({ nombre, clave: nombre.replace(/[^A-Za-z0-9_-]/g, '_'), estado, detalle: estado });
const config = (extra = {}) => ({ fuentes: { reuniones: { activo: true, via: 'mcp', notetaker: 'fathom', ...extra } } });
const detectado = (...servidores) => ({ mcp: { ok: true, servidores } });
const catalogo = espacio.catalogo();

test('con Fathom conectado, la fuente lo usa aunque Microsoft 365 también esté', () => {
  const e = estadoFuentes(config(), detectado(srv('claude.ai Microsoft 365'), srv('claude.ai Fathom')), catalogo).reuniones;
  assert.equal(e.conectada, true);
  assert.equal(e.servidor, 'claude.ai Fathom');
  // Fathom es entero de lectura: se permite el servidor completo.
  assert.ok(e.herramientas.includes('mcp__claude_ai_Fathom'));
  assert.ok(!e.detalle.includes('Outlook'));
  assert.match(e.como_referenciar, /^reunion:/);
});

test('sin Fathom, lee los resúmenes de Outlook y lo dice en el detalle', () => {
  const e = estadoFuentes(config(), detectado(srv('claude.ai Microsoft 365')), catalogo).reuniones;
  assert.equal(e.conectada, true);
  assert.match(e.detalle, /Resúmenes por mail de Outlook/);
  assert.deepEqual(e.herramientas, ['mcp__claude_ai_Microsoft_365__outlook_email_search', 'mcp__claude_ai_Microsoft_365__read_resource']);
  assert.match(e.como_referenciar, /^mail:/);
});

test('Fathom sin autorizar y Outlook conectado: usa Outlook', () => {
  const e = estadoFuentes(config(), detectado(srv('claude.ai Fathom', 'requiere_auth'), srv('claude.ai Microsoft 365')), catalogo).reuniones;
  assert.equal(e.conectada, true);
  assert.equal(e.servidor, 'claude.ai Microsoft 365');
});

test('sin ningún conector, la fuente no está conectada', () => {
  const e = estadoFuentes(config(), detectado(srv('claude.ai Slack')), catalogo).reuniones;
  assert.equal(e.conectada, false);
  assert.deepEqual(e.herramientas, []);
});

test('herramientas_extra se suman a las del proveedor', () => {
  const e = estadoFuentes(config({ herramientas_extra: ['get_action_items'] }), detectado(srv('claude.ai Fathom')), catalogo).reuniones;
  assert.ok(e.herramientas.includes('mcp__claude_ai_Fathom__get_action_items'));
});

test('esquema: notetaker acepta fathom, read_ai y otro, y rechaza lo demás', () => {
  const con = (notetaker) => {
    const c = structuredClone(ejemplo);
    c.fuentes.reuniones = { activo: true, via: 'mcp', notetaker, remitentes_resumen: ['resumenes@notetaker.example.com'] };
    return espacio.validarTodo(c, espacio.listarRecetas(), espacio.listarModulos());
  };
  for (const n of ['fathom', 'read_ai', 'otro']) assert.equal(con(n).ok, true, n);
  assert.equal(con('zoom').ok, false);
  assert.equal(ejemplo.fuentes.reuniones.notetaker, 'fathom');
  assert.ok(ejemplo.entregables.daily.fuentes.includes('reuniones'));
});
