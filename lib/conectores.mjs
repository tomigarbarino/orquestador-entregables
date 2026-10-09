// Estado de cada fuente: se lee de `claude mcp list`, `gh auth status`, las carpetas locales
// y Ollama. Nada de esto guarda credenciales: solo pregunta si la conexión existe.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { claudeCli } from './claude.mjs';
import { ejecutar } from './ejecutar.mjs';
import { expandirHome, enEspacio, rutas, rutaVisible } from './rutas.mjs';
import { catalogo as leerCatalogo } from './espacio.mjs';

export function claveMcp(nombre) {
  return nombre.replace(/[^A-Za-z0-9_-]/g, '_');
}

export function parsearMcpList(texto) {
  const servidores = [];
  for (const cruda of texto.split(/\r?\n/)) {
    const linea = cruda.trim();
    const m = linea.match(/^(.+?):\s+(.+?)\s+-\s+(.+)$/);
    if (!m) continue;
    const [, nombre, destino, estadoTexto] = m;
    let estado = 'desconocido';
    if (/needs auth|requiere|authenticat/i.test(estadoTexto)) estado = 'requiere_auth';
    else if (/fail|error|✗|✘/i.test(estadoTexto)) estado = 'fallo';
    else if (/connected|conectad|✓|✔/i.test(estadoTexto)) estado = 'conectado';
    servidores.push({ nombre: nombre.trim(), clave: claveMcp(nombre.trim()), destino: destino.trim(), estado, detalle: estadoTexto.trim() });
  }
  return servidores;
}

export async function listarMcp(cwd) {
  const r = await claudeCli(['mcp', 'list'], { cwd, timeout: 90_000 });
  if (!r.ok && !r.stdout) return { ok: false, servidores: [], error: r.error || r.stderr.trim() };
  return { ok: true, servidores: parsearMcpList(r.stdout), crudo: r.stdout };
}

export function parsearGhStatus(texto) {
  const cuentas = [];
  let actual = null;
  for (const linea of texto.split(/\r?\n/)) {
    const m = linea.match(/Logged in to (\S+) account (\S+)/i);
    if (m) {
      actual = { host: m[1], cuenta: m[2], activa: false };
      cuentas.push(actual);
    }
    if (actual && /Active account:\s*true/i.test(linea)) actual.activa = true;
  }
  if (cuentas.length === 1) cuentas[0].activa = true;
  return cuentas;
}

export async function estadoGh() {
  const r = await ejecutar('gh', ['auth', 'status'], { timeout: 20_000 });
  if (r.error && /No se encontró/.test(r.error)) return { instalado: false, ok: false, detalle: 'El GitHub CLI (gh) no está instalado' };
  const cuentas = parsearGhStatus(`${r.stdout}\n${r.stderr}`);
  const activa = cuentas.find((c) => c.activa);
  return {
    instalado: true,
    ok: Boolean(activa),
    cuenta: activa?.cuenta || null,
    cuentas: cuentas.map((c) => c.cuenta),
    detalle: activa ? `Sesión de gh: ${activa.cuenta}` : 'gh no tiene una sesión iniciada',
  };
}

export async function estadoOllama(url = 'http://127.0.0.1:11434') {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const r = await fetch(`${url}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    const j = await r.json();
    const modelos = (j.models || []).map((m) => m.name);
    return { ok: true, modelos, detalle: modelos.length ? `Ollama con ${modelos.join(', ')}` : 'Ollama está corriendo pero no tiene modelos' };
  } catch {
    return { ok: false, modelos: [], detalle: 'Ollama no responde en tu máquina' };
  }
}

function coincide(nombre, palabras) {
  const n = nombre.toLowerCase();
  return palabras.some((p) => n.includes(p.toLowerCase()));
}

// Une la config con lo detectado y devuelve, por fuente, si está conectada y qué
// herramientas de solo lectura puede usar una corrida.
export function estadoFuentes(config, detectado, catalogo = leerCatalogo()) {
  const salida = {};
  for (const [id, f] of Object.entries(config?.fuentes || {})) {
    const cat = catalogo.fuentes?.[id] || {};
    const base = { nombre: cat.nombre || id, via: f.via, activa: f.activo, como_conectar: cat.como_conectar || '' };
    if (f.via === 'gh') {
      const gh = detectado.gh || {};
      salida[id] = { ...base, conectada: Boolean(gh.ok), detalle: gh.detalle || 'Sin revisar', herramientas: ['leer_github', 'leer_issues_github'] };
    } else if (f.via === 'mcp') {
      const proveedores = cat.proveedores || [];
      const candidatos = (detectado.mcp?.servidores || []).filter((s) => {
        if (f.servidor) return s.nombre.toLowerCase().includes(f.servidor.toLowerCase());
        return proveedores.some((p) => coincide(s.nombre, p.coincide || []));
      });
      // Fuentes con varios proveedores en orden de preferencia (reuniones: Fathom y, si no, Outlook).
      const indiceProveedor = (s) => {
        const i = proveedores.findIndex((p) => coincide(s.nombre, p.coincide || []));
        return i < 0 ? proveedores.length : i;
      };
      const conectados = candidatos.filter((s) => s.estado === 'conectado');
      if (cat.elige_por_orden && !f.servidor) conectados.sort((a, b) => indiceProveedor(a) - indiceProveedor(b));
      const servidor = conectados[0] || candidatos[0];
      if (!servidor) {
        salida[id] = {
          ...base,
          conectada: false,
          detalle: detectado.mcp?.ok === false
            ? `No se pudo leer \`claude mcp list\`: ${detectado.mcp.error}`
            : `No aparece ningún conector${f.servidor ? ` "${f.servidor}"` : ''} en \`claude mcp list\``,
          herramientas: [],
        };
        continue;
      }
      const proveedor = proveedores.find((p) => coincide(servidor.nombre, p.coincide || []) || (f.servidor && coincide(f.servidor, p.coincide || [])));
      const nombres = [...(proveedor?.herramientas || []), ...(f.herramientas_extra || [])];
      const conectada = servidor.estado === 'conectado';
      salida[id] = {
        ...base,
        conectada,
        servidor: servidor.nombre,
        detalle: conectada
          ? `${proveedor?.aviso ? `${proveedor.aviso} · ` : ''}${servidor.nombre}: conectado${nombres.length ? '' : ' (sin herramientas de lectura conocidas: sumalas en herramientas_extra)'}`
          : `${servidor.nombre}: ${servidor.estado === 'requiere_auth' ? 'falta autorizarlo' : servidor.detalle}`,
        herramientas: nombres.map((h) => `mcp__${servidor.clave}__${h}`),
        registrar_con: 'registrar_lectura',
        como_referenciar: proveedor?.como_referenciar || cat.como_referenciar,
      };
    } else if (id === 'sesiones_ia') {
      const dirs = [];
      if (f.claude !== false) dirs.push(['Claude Code', expandirHome(cat.carpetas?.claude || '~/.claude/projects')]);
      if (f.codex) dirs.push(['Codex', expandirHome(cat.carpetas?.codex || '~/.codex/sessions')]);
      const existentes = dirs.filter(([, d]) => fs.existsSync(d));
      salida[id] = {
        ...base,
        conectada: existentes.length > 0,
        detalle: existentes.length ? `Se leen las sesiones de ${existentes.map(([n]) => n).join(' y ')}` : 'No se encontraron carpetas de sesiones',
        herramientas: ['leer_sesiones'],
      };
    } else if (id === 'ollama') {
      const o = detectado.ollama || {};
      const modelo = f.modelo;
      const tieneModelo = !modelo || (o.modelos || []).some((m) => m === modelo || m.startsWith(modelo) || m === `${modelo}:latest`);
      salida[id] = {
        ...base,
        conectada: Boolean(o.ok && tieneModelo),
        detalle: o.ok ? (tieneModelo ? o.detalle : `Ollama corre, pero falta el modelo ${modelo} (ollama pull ${modelo})`) : o.detalle || 'Sin revisar',
        herramientas: ['resumir_local'],
      };
    } else {
      const carpeta = f.carpeta ? expandirHome(f.carpeta) : null;
      const existe = carpeta && fs.existsSync(carpeta);
      salida[id] = {
        ...base,
        conectada: Boolean(existe),
        detalle: carpeta ? (existe ? `Carpeta ${rutaVisible(carpeta)}` : `No existe la carpeta ${rutaVisible(carpeta)}`) : 'Falta configurar la carpeta',
        herramientas: ['leer_registros'],
      };
    }
  }
  return salida;
}

export function leerDemo() {
  const ruta = path.join(rutas.demo, 'conectores.json');
  return JSON.parse(fs.readFileSync(ruta, 'utf8'));
}

const CACHE = () => enEspacio('.cache', 'conectores.json');

export function detectadoEnCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE(), 'utf8'));
  } catch {
    return null;
  }
}

export async function detectar({ forzar = false, maxEdadMs = 10 * 60_000, demo = false } = {}) {
  if (demo) return { ...leerDemo(), actualizado: new Date().toISOString(), demo: true };
  const previo = detectadoEnCache();
  if (!forzar && previo && Date.now() - Date.parse(previo.actualizado) < maxEdadMs) return previo;
  const [mcp, gh, ollama] = await Promise.all([listarMcp(enEspacio()), estadoGh(), estadoOllama()]);
  const detectado = { actualizado: new Date().toISOString(), mcp, gh, ollama, plataforma: `${os.platform()} ${os.release()}` };
  fs.mkdirSync(path.dirname(CACHE()), { recursive: true });
  fs.writeFileSync(CACHE(), JSON.stringify(detectado, null, 2));
  return detectado;
}

// Acción fija: sumar un MCP local con `claude mcp add`. Nada de shell: argumentos validados.
export async function agregarMcpLocal({ nombre, transporte = 'stdio', comando, args = [], url, alcance = 'user' }) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(nombre || '')) throw new Error('El nombre solo puede tener letras, números, guiones y guiones bajos');
  if (!['user', 'local', 'project'].includes(alcance)) throw new Error('Alcance inválido');
  let argumentos;
  if (transporte === 'stdio') {
    if (!comando || /[\r\n]/.test(comando)) throw new Error('Falta el comando del servidor');
    if (!Array.isArray(args) || args.some((a) => typeof a !== 'string' || /[\r\n]/.test(a))) throw new Error('Argumentos inválidos');
    argumentos = ['mcp', 'add', '--scope', alcance, nombre, '--', comando, ...args];
  } else if (transporte === 'http' || transporte === 'sse') {
    if (!/^https?:\/\/[^\s]+$/.test(url || '')) throw new Error('La URL tiene que empezar con http:// o https://');
    argumentos = ['mcp', 'add', '--scope', alcance, '--transport', transporte, nombre, url];
  } else {
    throw new Error('Transporte inválido');
  }
  const r = await claudeCli(argumentos, { cwd: enEspacio(), timeout: 60_000 });
  if (!r.ok) throw new Error((r.stderr || r.stdout || r.error || '').trim() || 'claude mcp add falló');
  return { ok: true, salida: (r.stdout || '').trim(), comando: `claude ${argumentos.join(' ')}` };
}
