// Chat de la interfaz: una conversación con Claude que mantiene el hilo con --resume.
// Claude solo tiene las herramientas del modo chat: leer config y recetas, y proponer cambios.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { enEspacio, rutaEspacio, dentroDe } from './rutas.mjs';
import { correrClaude } from './claude.mjs';
import { leerConfig } from './espacio.mjs';
import { mcpConfig } from './orquestacion.mjs';
import { sistemaChat, mensajeChat } from './prompts.mjs';
import { responderDemo } from './demo.mjs';

const dirChat = () => enEspacio('.chat');
const ID = /^c-[0-9a-f]{8}$/;

function ruta(id) {
  if (!ID.test(id || '')) throw new Error('Id de conversación inválido');
  return dentroDe(dirChat(), `${id}.json`);
}

export function nuevaConversacion() {
  const id = `c-${crypto.randomBytes(4).toString('hex')}`;
  const conv = { id, sesion: crypto.randomUUID(), iniciada: false, creada: new Date().toISOString(), mensajes: [] };
  fs.mkdirSync(dirChat(), { recursive: true });
  fs.writeFileSync(ruta(id), JSON.stringify(conv, null, 2));
  return conv;
}

export function leerConversacion(id) {
  return JSON.parse(fs.readFileSync(ruta(id), 'utf8'));
}

function guardar(conv) {
  fs.writeFileSync(ruta(conv.id), JSON.stringify(conv, null, 2));
}

export function ultimaConversacion() {
  if (!fs.existsSync(dirChat())) return null;
  const archivos = fs.readdirSync(dirChat()).filter((n) => n.endsWith('.json'));
  if (!archivos.length) return null;
  const ordenados = archivos.map((n) => ({ n, t: fs.statSync(path.join(dirChat(), n)).mtimeMs })).sort((a, b) => b.t - a.t);
  return leerConversacion(ordenados[0].n.replace('.json', ''));
}

const enCurso = new Set();

// Manda un mensaje y va avisando: onDelta(texto), onHerramienta(nombre, input), onFin(mensaje).
export async function enviar({ id, texto, pantalla, demo = false, onDelta, onHerramienta, onFin }) {
  const conv = leerConversacion(id);
  if (enCurso.has(id)) throw new Error('Claude todavía está respondiendo el mensaje anterior');
  enCurso.add(id);
  conv.mensajes.push({ rol: 'persona', texto, t: new Date().toISOString(), pantalla: pantalla ? { entregable: pantalla.entregable, nodo: pantalla.nodo } : undefined });
  guardar(conv);
  const respuesta = { rol: 'claude', texto: '', t: null, propuestas: [], herramientas: [] };

  const terminar = (r) => {
    enCurso.delete(id);
    respuesta.t = new Date().toISOString();
    if (!r.ok && !respuesta.texto) respuesta.texto = `No pude responder: ${r.error}`;
    respuesta.error = r.ok ? undefined : r.error;
    const actual = leerConversacion(id);
    actual.iniciada = actual.iniciada || r.ok || Boolean(r.sesion);
    actual.mensajes.push(respuesta);
    guardar(actual);
    onFin?.(respuesta);
  };

  if (demo) {
    responderDemo({ texto, pantalla, onDelta: (d) => { respuesta.texto += d; onDelta?.(d); }, onPropuesta: (pid) => respuesta.propuestas.push(pid) })
      .then(() => terminar({ ok: true }))
      .catch((e) => terminar({ ok: false, error: e.message }));
    return;
  }

  const config = leerConfig().datos || {};
  const { promesa } = correrClaude({
    cwd: rutaEspacio(),
    prompt: mensajeChat({ texto, pantalla }),
    args: [
      '--model', config.modelos?.chat || 'sonnet',
      '--tools', '',
      '--strict-mcp-config',
      '--mcp-config', mcpConfig('orq_chat', 'chat'),
      '--permission-mode', 'dontAsk',
      '--allowedTools', 'mcp__orq_chat',
      '--append-system-prompt', sistemaChat({ persona: config.persona?.nombre }),
      ...(conv.iniciada ? ['--resume', conv.sesion] : ['--session-id', conv.sesion]),
    ],
    eventos: {
      onTexto: (d) => {
        respuesta.texto += d;
        onDelta?.(d);
      },
      onHerramienta: (b) => {
        respuesta.herramientas.push(b.name.replace(/^mcp__orq_chat__/, ''));
        onHerramienta?.(b.name.replace(/^mcp__orq_chat__/, ''), b.input);
        if (respuesta.texto && !respuesta.texto.endsWith('\n')) {
          respuesta.texto += '\n\n';
          onDelta?.('\n\n');
        }
      },
      onResultadoHerramienta: (b) => {
        const texto = typeof b.content === 'string' ? b.content : JSON.stringify(b.content);
        const m = texto.match(/p-[0-9]{13}-[a-z0-9]{4}/);
        if (m && !respuesta.propuestas.includes(m[0])) respuesta.propuestas.push(m[0]);
      },
    },
  });
  promesa.then(terminar);
}
