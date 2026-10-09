#!/usr/bin/env node
// Interfaz web local del orquestador. Escucha solo en 127.0.0.1.
//   npm start          tu espacio real (mi-espacio/)
//   npm run demo       espacio de ejemplo con corridas y chat simulados (sin tokens)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import express from 'express';
import YAML from 'yaml';

const args = process.argv.slice(2);
const DEMO = args.includes('--demo') || process.env.ORQ_DEMO === '1';
const ABRIR = !args.includes('--no-abrir') && process.env.ORQ_NO_ABRIR !== '1';
const PUERTO = Number(process.env.PORT || (args.includes('--puerto') ? args[args.indexOf('--puerto') + 1] : DEMO ? 4318 : 4317));
const HOST = '127.0.0.1';

if (DEMO && !process.env.ORQ_ESPACIO) {
  const dir = path.join(os.tmpdir(), 'orquestador-entregables-demo');
  fs.rmSync(dir, { recursive: true, force: true });
  process.env.ORQ_ESPACIO = dir;
}

const { RAIZ, rutaEspacio, enEspacio, rutaVisible } = await import('../lib/rutas.mjs');
const espacio = await import('../lib/espacio.mjs');
const conectores = await import('../lib/conectores.mjs');
const corridas = await import('../lib/corridas.mjs');
const propuestas = await import('../lib/propuestas.mjs');
const historial = await import('../lib/historial.mjs');
const chat = await import('../lib/chat.mjs');
const { correrEntregable, cancelarCorrida } = await import('../lib/orquestacion.mjs');
const { estadoAuth } = await import('../lib/claude.mjs');
const { planRutinas, aplicarRutinas } = await import('../lib/rutinas.mjs');
const { entregablesDe } = await import('../lib/receta-efectiva.mjs');
const { perfilDeEquipo, sinHeredado } = await import('../lib/equipo.mjs');
const { generarEntregable } = await import('../lib/asistente.mjs');
const { ahoraEn } = await import('../lib/horario.mjs');

// La demo arranca con el espacio de ejemplo ya armado (ejemplo/demo/semilla): historial, corridas, reglas y chat.
if (DEMO) await (await import('../lib/demo.mjs')).sembrarDemo();
await espacio.asegurarEspacio();

// ---------- Eventos en vivo (SSE) ----------

const clientes = new Set();
function emitir(tipo, datos) {
  const linea = `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
  for (const res of clientes) res.write(linea);
}

// Se revisa el espacio cada medio segundo: así el visualizador también ve las corridas
// que se lanzan desde Claude Code directo, no solo las de esta interfaz.
const firmas = new Map();
function firmaDe(ruta) {
  try {
    const s = fs.statSync(ruta);
    return `${s.mtimeMs}-${s.size}`;
  } catch {
    return 'x';
  }
}
function vigilar() {
  for (const meta of corridas.listarCorridas(8)) {
    const dir = path.join(corridas.dirCorridas(), meta.id);
    const f = `${firmaDe(path.join(dir, 'eventos.jsonl'))}|${firmaDe(path.join(dir, 'meta.json'))}|${firmaDe(path.join(dir, 'borrador.md'))}`;
    if (firmas.get(meta.id) !== f) {
      firmas.set(meta.id, f);
      emitir('corrida', corridas.leerCorrida(meta.id));
    }
  }
  const dirP = enEspacio('.propuestas');
  const fp = fs.existsSync(dirP) ? fs.readdirSync(dirP).map((n) => `${n}:${firmaDe(path.join(dirP, n))}`).join(',') : '';
  if (firmas.get('propuestas') !== fp) {
    firmas.set('propuestas', fp);
    emitir('propuestas', propuestas.listarPropuestas());
  }
  const fc = [firmaDe(enEspacio('config.yaml')), firmaDe(enEspacio('equipo.yaml')), ...listarArchivosRecetas().map(firmaDe)].join(',');
  if (firmas.has('config') && firmas.get('config') !== fc) emitir('espacio', resumenEspacio());
  firmas.set('config', fc);
}
function listarArchivosRecetas() {
  const dir = enEspacio('recetas');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap((d) => [path.join(dir, d, 'receta.yaml'), path.join(dir, d, 'instrucciones.md')]);
}
setInterval(() => {
  try {
    vigilar();
  } catch (e) {
    console.error('vigilar:', e.message);
  }
}, 500);

// ---------- Estado ----------

let detectado = null;
let auth = null;

async function refrescarConectores(forzar = false) {
  detectado = await conectores.detectar({ forzar, demo: DEMO });
  auth = DEMO ? { instalado: true, logueado: true, detalle: 'Modo demo' } : await estadoAuth();
  return detectado;
}

function resumenEspacio() {
  const e = espacio.estadoEspacio();
  return {
    demo: DEMO,
    espacio: DEMO ? 'Espacio de demo (temporal)' : rutaVisible(e.espacio),
    config: e.config,
    configPropia: e.configPropia,
    equipo: e.equipo,
    configTexto: e.configTexto,
    validacion: e.validacion,
    recetas: Object.fromEntries(Object.entries(e.recetas).map(([id, r]) => [id, { id, origen: r.origen, sobrescribe: r.sobrescribe, receta: r.receta, instrucciones: r.instrucciones, errorYaml: r.errorYaml }])),
    modulos: e.modulos,
    fuentes: e.config ? conectores.estadoFuentes(e.config, detectado || {}) : {},
    detectado,
    auth,
    ahora: ahoraEn(e.config?.zona_horaria),
  };
}

// ---------- App ----------

const app = express();
app.disable('x-powered-by');

// Solo se aceptan pedidos dirigidos a 127.0.0.1 o localhost (evita DNS rebinding).
app.use((req, res, next) => {
  const host = String(req.headers.host || '').replace(/:\d+$/, '');
  if (!['127.0.0.1', 'localhost'].includes(host)) return res.status(403).send('Host no permitido');
  next();
});
app.use('/api', express.json({ limit: '2mb' }));
// Los pedidos que cambian algo llevan un encabezado propio: otra página no puede mandarlo sin permiso.
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.get('x-orquestador') !== '1') return res.status(403).json({ error: 'Pedido sin el encabezado de la interfaz' });
  next();
});

const ruta = (fn) => async (req, res) => {
  try {
    const r = await fn(req, res);
    if (r !== undefined && !res.headersSent) res.json(r);
  } catch (e) {
    if (!res.headersSent) res.status(400).json({ error: e.message || String(e) });
  }
};

app.get('/api/eventos', (req, res) => {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  res.write(': conectado\n\n');
  clientes.add(res);
  const latido = setInterval(() => res.write(': latido\n\n'), 20_000);
  req.on('close', () => {
    clearInterval(latido);
    clientes.delete(res);
  });
});

app.get('/api/estado', ruta(async () => {
  if (!detectado) await refrescarConectores(false);
  return {
    ...resumenEspacio(),
    esquemas: espacio.esquemas(),
    catalogo: espacio.catalogo(),
    corridas: corridas.listarCorridas(20),
    propuestas: propuestas.listarPropuestas(),
  };
}));

app.get('/api/conectores', ruta(async (req) => {
  await refrescarConectores(req.query.refrescar === '1');
  const r = resumenEspacio();
  emitir('espacio', r);
  return { fuentes: r.fuentes, detectado, auth };
}));

app.post('/api/conectores/mcp', ruta(async (req) => {
  if (DEMO) throw new Error('En modo demo no se agregan conectores');
  const r = await conectores.agregarMcpLocal(req.body || {});
  await refrescarConectores(true);
  emitir('espacio', resumenEspacio());
  return r;
}));

async function guardarConfig(datos, motivo, origen = 'interfaz') {
  // La interfaz trabaja con la config efectiva: lo que solo viene del equipo no se copia al archivo de la persona.
  const actual = espacio.leerConfig();
  const propia = actual.equipo.usable ? sinHeredado(datos, actual.equipo.datos, actual.propios) : datos;
  const doc = YAML.stringify(propia, { lineWidth: 0 });
  const p = propuestas.crearPropuesta({ motivo, origen, cambios: [{ tipo: 'config', yaml: doc }] });
  if (p.estado !== 'pendiente') throw new Error(p.errores.map((e) => `${e.ruta}: ${e.mensaje}`).join('; '));
  await propuestas.aplicarPropuesta(p.id);
  const r = resumenEspacio();
  emitir('espacio', r);
  return r;
}

app.put('/api/config', ruta(async (req) => guardarConfig(req.body.config, req.body.motivo || 'Cambio desde la interfaz')));

app.post('/api/config/importar', ruta(async (req) => {
  const texto = String(req.body.yaml || '');
  let datos;
  try {
    datos = YAML.parse(texto);
  } catch (e) {
    throw new Error(`El archivo no es YAML válido: ${e.message}`);
  }
  const v = espacio.validadores().config(datos);
  if (!v.ok) throw new Error(`La configuración no es válida: ${v.errores.map((e) => `${e.ruta}: ${e.mensaje}`).join('; ')}`);
  const p = propuestas.crearPropuesta({ motivo: req.body.motivo || 'Configuración importada', origen: 'interfaz', cambios: [{ tipo: 'config', yaml: texto }] });
  if (p.estado !== 'pendiente') throw new Error(p.errores.map((e) => `${e.ruta}: ${e.mensaje}`).join('; '));
  await propuestas.aplicarPropuesta(p.id);
  await refrescarConectores(false);
  const r = resumenEspacio();
  emitir('espacio', r);
  return r;
}));

app.post('/api/modulos/:clave', ruta(async (req) => {
  const { config, modulos } = espacio.estadoEspacio();
  const modulo = modulos.find((m) => m.clave === req.params.clave);
  if (!modulo) throw new Error('Módulo desconocido');
  if (modulo.activo_si) throw new Error('Este módulo se activa solo, según de dónde te llegan las tareas (Perfil)');
  const activo = Boolean(req.body.activo);
  const nueva = JSON.parse(JSON.stringify(config));
  nueva.modulos = { ...(nueva.modulos || {}), [modulo.clave]: { ...(nueva.modulos?.[modulo.clave] || {}), activo } };
  if (modulo.tipo === 'entregable') {
    const previo = nueva.entregables?.[modulo.id];
    nueva.entregables = { ...(nueva.entregables || {}), [modulo.id]: previo ? { ...previo, activo } : { ...modulo.entregable_por_defecto, activo } };
    for (const f of modulo.entregable_por_defecto?.fuentes || []) {
      if (!nueva.fuentes?.[f]) nueva.fuentes[f] = { activo: true, via: espacio.catalogo().fuentes?.[f]?.via || 'mcp' };
    }
  }
  if (activo) {
    for (const f of modulo.fuentes || []) {
      if (!nueva.fuentes?.[f]) nueva.fuentes[f] = { activo: true, via: espacio.catalogo().fuentes?.[f]?.via || 'local' };
      else nueva.fuentes[f] = { ...nueva.fuentes[f], activo: true };
    }
  }
  return guardarConfig(nueva, `${activo ? 'Activar' : 'Apagar'} módulo: ${modulo.nombre}`);
}));

// ---------- Perfil de equipo ----------

const ENCABEZADO_EQUIPO = '# Perfil de equipo del orquestador de entregables.\n# Sin datos personales: cada persona lo importa en Perfil y ajusta lo suyo encima.\n';

// Arma el equipo.yaml con la config efectiva, sin persona, nombres propios, mails ni carpetas.
app.get('/api/equipo/exportar', ruta(async () => {
  const { config } = espacio.estadoEspacio();
  if (!config) throw new Error('Todavía no hay una configuración para exportar');
  const perfil = perfilDeEquipo(config);
  const v = espacio.validadores().equipo(perfil);
  if (!v.ok) throw new Error(`No se pudo armar el perfil de equipo: ${v.errores.map((e) => `${e.ruta}: ${e.mensaje}`).join('; ')}`);
  return { yaml: `${ENCABEZADO_EQUIPO}${YAML.stringify(perfil, { lineWidth: 0 })}`, nombre: 'equipo.yaml' };
}));

app.post('/api/equipo/importar', ruta(async (req) => {
  const texto = String(req.body.yaml || '');
  let datos;
  try {
    datos = YAML.parse(texto);
  } catch (e) {
    throw new Error(`El archivo no es YAML válido: ${e.message}`);
  }
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) throw new Error('El archivo está vacío o no es un perfil de equipo');
  const v = espacio.validadores().equipo(datos);
  if (!v.ok) throw new Error(`El perfil de equipo no es válido: ${v.errores.map((e) => `${e.ruta}: ${e.mensaje}`).join('; ')}`);
  const p = propuestas.crearPropuesta({ motivo: req.body.motivo || `Usar la configuración del equipo${datos.equipo ? ` (${datos.equipo})` : ''}`, origen: 'interfaz', cambios: [{ tipo: 'equipo', yaml: texto }] });
  if (p.estado !== 'pendiente') throw new Error(p.errores.map((e) => `${e.ruta}: ${e.mensaje}`).join('; '));
  await propuestas.aplicarPropuesta(p.id);
  await refrescarConectores(false);
  const r = resumenEspacio();
  emitir('espacio', r);
  return r;
}));

// ---------- Corridas ----------

app.get('/api/corridas', ruta(async () => corridas.listarCorridas(30)));
app.get('/api/corridas/:id', ruta(async (req) => corridas.leerCorrida(req.params.id)));
app.post('/api/corridas', ruta(async (req) => {
  const entregable = String(req.body.entregable || '');
  const r = await correrEntregable({ entregable, origen: 'interfaz', demo: DEMO });
  emitir('corrida', corridas.leerCorrida(r.id));
  return r;
}));
app.post('/api/corridas/:id/cancelar', ruta(async (req) => ({ ok: cancelarCorrida(req.params.id) })));
app.post('/api/corridas/:id/aprobar', ruta(async (req) => corridas.aprobarCorrida(req.params.id)));

// ---------- Propuestas e historial ----------

app.get('/api/propuestas', ruta(async (req) => propuestas.listarPropuestas({ estado: req.query.estado })));
app.get('/api/propuestas/:id/vista', ruta(async (req) => propuestas.vistaPrevia(req.params.id)));
app.post('/api/propuestas/:id/aplicar', ruta(async (req) => {
  const p = await propuestas.aplicarPropuesta(req.params.id);
  emitir('espacio', resumenEspacio());
  return p;
}));
app.post('/api/propuestas/:id/descartar', ruta(async (req) => propuestas.descartarPropuesta(req.params.id)));

app.get('/api/historial', ruta(async () => historial.log(rutaEspacio(), 40)));
app.post('/api/historial/:sha/deshacer', ruta(async (req) => {
  const sha = await historial.deshacer(rutaEspacio(), req.params.sha);
  const r = resumenEspacio();
  emitir('espacio', r);
  return { sha };
}));

// ---------- Asistente ----------

app.post('/api/asistente', ruta(async (req) => {
  const { config } = espacio.estadoEspacio();
  const generado = generarEntregable(req.body || {});
  const recetas = espacio.listarRecetas();
  if (recetas[generado.id] && !req.body.reemplazar) throw new Error(`Ya existe una receta "${generado.id}": cambiale el nombre`);
  const doc = YAML.parseDocument(espacio.leerConfig().texto);
  doc.setIn(['entregables', generado.id], doc.createNode(generado.entrada));
  const cat = espacio.catalogo();
  for (const fid of generado.entrada.fuentes) {
    if (config.fuentes?.[fid]) continue;
    const c = cat.fuentes?.[fid];
    const via = c?.via || 'mcp';
    doc.setIn(['fuentes', fid], doc.createNode({ activo: true, via, ...(via === 'mcp' && c?.proveedores?.[0] ? { servidor: c.proveedores[0].nombre } : {}) }));
  }
  const p = propuestas.crearPropuesta({
    motivo: `Entregable nuevo: ${generado.receta.nombre}`,
    origen: 'asistente',
    cambios: [
      { tipo: 'config', yaml: doc.toString({ lineWidth: 0 }) },
      { tipo: 'receta', id: generado.id, receta_yaml: YAML.stringify(generado.receta, { lineWidth: 0 }), instrucciones: generado.instrucciones },
    ],
  });
  return p;
}));

// ---------- Chat ----------

app.get('/api/chat', ruta(async () => chat.ultimaConversacion() || chat.nuevaConversacion()));
app.post('/api/chat/nueva', ruta(async () => chat.nuevaConversacion()));
app.post('/api/chat/:id/mensajes', ruta(async (req) => {
  const { id } = req.params;
  const texto = String(req.body.texto || '').trim();
  if (!texto) throw new Error('El mensaje está vacío');
  await chat.enviar({
    id,
    texto,
    pantalla: req.body.pantalla,
    demo: DEMO,
    onDelta: (d) => emitir('chat', { id, tipo: 'delta', texto: d }),
    onHerramienta: (nombre, input) => emitir('chat', { id, tipo: 'herramienta', nombre, motivo: input?.motivo }),
    onFin: (mensaje) => emitir('chat', { id, tipo: 'fin', mensaje }),
  });
  return { ok: true };
}));

// ---------- Rutinas ----------

app.get('/api/rutinas/plan', ruta(async () => {
  const { config, recetas, modulos } = espacio.estadoEspacio();
  return planRutinas(entregablesDe(config, recetas, modulos));
}));
app.post('/api/rutinas/aplicar', ruta(async (req) => {
  if (DEMO) throw new Error('En modo demo no se programan rutinas');
  if (req.body.confirmado !== true) throw new Error('Falta la confirmación');
  const { config, recetas, modulos } = espacio.estadoEspacio();
  return aplicarRutinas(planRutinas(entregablesDe(config, recetas, modulos)));
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'No existe' }));

// ---------- Interfaz (Vite) ----------

const servidorHttp = http.createServer(app);
const { createServer: crearVite } = await import('vite');
const vite = await crearVite({
  configFile: path.join(RAIZ, 'web', 'vite.config.mjs'),
  server: { middlewareMode: true, hmr: { server: servidorHttp }, allowedHosts: ['127.0.0.1', 'localhost'] },
  appType: 'spa',
  logLevel: 'warn',
});
app.use(vite.middlewares);

servidorHttp.listen(PUERTO, HOST, async () => {
  const url = `http://${HOST}:${PUERTO}`;
  console.log(`\nOrquestador de entregables${DEMO ? ' (modo demo)' : ''}`);
  console.log(`  Interfaz: ${url}`);
  console.log(`  Espacio:  ${rutaEspacio()}`);
  console.log('  Cortalo con Ctrl+C.\n');
  refrescarConectores(false).then(() => emitir('espacio', resumenEspacio())).catch((e) => console.error('conectores:', e.message));
  if (ABRIR) {
    const [cmd, cmdArgs] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    spawn(cmd, cmdArgs, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  }
});
