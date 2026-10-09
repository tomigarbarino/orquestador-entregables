// Lectores propios de fuentes: GitHub (con gh), sesiones de Claude Code y Codex, registros
// de trabajo y el modelo local. Devuelven datos compactos para no gastar contexto.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { ejecutar } from './ejecutar.mjs';
import { expandirHome, rutaEspacio } from './rutas.mjs';
import { fechaLocal, sumarDias } from './horario.mjs';

const recortar = (t, n = 280) => {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

const enVentana = (fecha, desde, hasta) => Boolean(fecha) && fecha >= desde && fecha <= hasta;

// ---------- GitHub ----------

export async function leerGithub({ config, desde, hasta, repos }) {
  const zona = config.zona_horaria;
  const usuario = config.persona?.github_usuario || null;
  const proyectos = config.proyectos || [];
  const objetivo = [];
  for (const p of proyectos) {
    for (const repo of p.repos || []) {
      if (!repos?.length || repos.includes(repo)) objetivo.push({ repo, proyecto: p.nombre, rama: p.rama_produccion || 'main' });
    }
  }
  const resultados = await Promise.all(objetivo.map(async ({ repo, proyecto, rama }) => {
    // Con --search, gh no avisa si el repo no existe: se verifica el acceso aparte.
    const acceso = ejecutar('gh', ['repo', 'view', repo, '--json', 'nameWithOwner'], { timeout: 30_000 });
    const r = await ejecutar('gh', [
      'pr', 'list', '--repo', repo, '--state', 'all', '--limit', '60',
      '--search', `updated:>=${sumarDias(desde, -1)}`,
      '--json', 'number,title,state,isDraft,mergedAt,createdAt,updatedAt,closedAt,baseRefName,headRefName,url,author',
    ], { timeout: 45_000 });
    const a = await acceso;
    if (!a.ok) return { repo, proyecto, ok: false, error: recortar(a.stderr || a.error, 200), prs: [] };
    if (!r.ok) return { repo, proyecto, ok: false, error: recortar(r.stderr || r.error, 200), prs: [] };
    let lista = [];
    try {
      lista = JSON.parse(r.stdout);
    } catch {
      return { repo, proyecto, ok: false, error: 'gh devolvió algo que no es JSON', prs: [] };
    }
    const prs = lista
      .filter((pr) => !usuario || pr.author?.login?.toLowerCase() === usuario.toLowerCase())
      .map((pr) => {
        const merge = fechaLocal(pr.mergedAt, zona);
        const creado = fechaLocal(pr.createdAt, zona);
        const actualizado = fechaLocal(pr.updatedAt, zona);
        let estado;
        if (pr.mergedAt) estado = pr.baseRefName === rama ? `mergeado a ${rama} (producción)` : `mergeado a ${pr.baseRefName} (no es producción)`;
        else if (pr.state === 'OPEN') estado = pr.isDraft ? 'abierto, en borrador' : 'abierto';
        else estado = 'cerrado sin mergear';
        return {
          ref: `${repo}#${pr.number}`,
          numero: pr.number,
          titulo: recortar(pr.title, 160),
          estado,
          rama_destino: pr.baseRefName,
          mergeado_el: merge,
          creado_el: creado,
          actualizado_el: actualizado,
          autor: pr.author?.login,
          url: pr.url,
        };
      })
      .filter((pr) => enVentana(pr.mergeado_el, desde, hasta) || enVentana(pr.creado_el, desde, hasta) || enVentana(pr.actualizado_el, desde, hasta));
    return { repo, proyecto, ok: true, prs };
  }));
  const total = resultados.reduce((n, r) => n + r.prs.length, 0);
  const conError = resultados.filter((r) => !r.ok);
  return {
    desde, hasta, filtro_autor: usuario, repos: resultados, total,
    resumen: `${total} PR${total === 1 ? '' : 's'} en ${resultados.length - conError.length} repo${resultados.length - conError.length === 1 ? '' : 's'}${conError.length ? ` · sin acceso a ${conError.map((x) => x.repo).join(', ')}` : ''}`,
    refs: resultados.flatMap((r) => r.prs.map((p) => p.ref)),
  };
}

// ---------- Sesiones de Claude Code y Codex ----------

async function* lineasJson(archivo) {
  const rl = readline.createInterface({ input: fs.createReadStream(archivo, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const linea of rl) {
    if (!linea) continue;
    try {
      yield JSON.parse(linea);
    } catch {
      // línea cortada: se ignora
    }
  }
}

function textoDe(contenido) {
  if (typeof contenido === 'string') return contenido;
  if (Array.isArray(contenido)) return contenido.filter((b) => b.type === 'text' || b.type === 'input_text' || b.type === 'output_text').map((b) => b.text).join(' ');
  return '';
}

const esRuido = (t) => !t || /^\s*<(command|local-command|system-reminder|task-notification|ide_)/.test(t) || /^\s*\[Request interrupted/.test(t) || /^Caveat:/.test(t);

function archivosRecientes(dir, desdeMs, extension = '.jsonl', profundidad = 4) {
  const salida = [];
  const recorrer = (d, nivel) => {
    if (nivel > profundidad) return;
    let entradas;
    try {
      entradas = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entradas) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) recorrer(p, nivel + 1);
      else if (e.name.endsWith(extension)) {
        try {
          if (fs.statSync(p).mtimeMs >= desdeMs) salida.push(p);
        } catch {
          // archivo que desapareció
        }
      }
    }
  };
  recorrer(dir, 0);
  return salida;
}

async function resumirSesionClaude(archivo, { desde, hasta, zona, excluir }) {
  let titulo = null;
  let cwd = null;
  let id = path.basename(archivo, '.jsonl');
  let primero = null;
  let pedido = null;
  let cierre = null;
  let mensajes = 0;
  let inicio = null;
  let fin = null;
  for await (const j of lineasJson(archivo)) {
    if (j.type === 'custom-title' && j.customTitle) titulo = j.customTitle;
    if ((j.type !== 'user' && j.type !== 'assistant') || j.isSidechain) continue;
    const fecha = fechaLocal(j.timestamp, zona);
    if (!enVentana(fecha, desde, hasta)) continue;
    cwd = cwd || j.cwd;
    id = j.sessionId || id;
    inicio = inicio || j.timestamp;
    fin = j.timestamp;
    const texto = textoDe(j.message?.content);
    if (j.type === 'user' && !esRuido(texto) && typeof j.message?.content === 'string') {
      mensajes += 1;
      if (!primero) primero = texto;
      pedido = texto;
    }
    if (j.type === 'assistant' && texto.trim()) cierre = texto;
  }
  if (!inicio || !primero) return null;
  if (cwd && excluir.some((x) => path.resolve(cwd).toLowerCase().startsWith(x))) return null;
  return {
    herramienta: 'Claude Code',
    ref: `claude:${id.slice(0, 8)}`,
    titulo: titulo ? recortar(titulo, 100) : null,
    carpeta: cwd ? path.basename(cwd) : null,
    inicio: fechaLocal(inicio, zona),
    fin: fechaLocal(fin, zona),
    mensajes_de_la_persona: mensajes,
    primer_pedido: recortar(primero, 300),
    ultimo_pedido: pedido !== primero ? recortar(pedido, 200) : null,
    cierre: recortar(cierre, 350),
  };
}

async function resumirSesionCodex(archivo, { desde, hasta, zona, excluir }) {
  let cwd = null;
  let id = null;
  let automatica = false;
  let primero = null;
  let cierre = null;
  let mensajes = 0;
  let inicio = null;
  let fin = null;
  for await (const j of lineasJson(archivo)) {
    const p = j.payload || {};
    if (j.type === 'session_meta') {
      cwd = p.cwd;
      id = p.id;
      automatica = p.originator === 'codex_exec';
      continue;
    }
    const fecha = fechaLocal(j.timestamp, zona);
    if (!enVentana(fecha, desde, hasta)) continue;
    if (j.type === 'event_msg' && p.type === 'user_message' && !esRuido(p.message)) {
      mensajes += 1;
      primero = primero || p.message;
      inicio = inicio || j.timestamp;
      fin = j.timestamp;
    }
    if (j.type === 'event_msg' && p.type === 'agent_message' && p.message) {
      cierre = p.message;
      fin = j.timestamp;
    }
    if (j.type === 'event_msg' && p.type === 'task_complete' && p.last_agent_message) cierre = p.last_agent_message;
    if (j.type === 'response_item' && p.type === 'message' && p.role === 'assistant') {
      const t = textoDe(p.content);
      if (t) cierre = t;
    }
  }
  if (!inicio || !primero) return null;
  if (cwd && excluir.some((x) => path.resolve(cwd).toLowerCase().startsWith(x))) return null;
  return {
    herramienta: automatica ? 'Codex (automática)' : 'Codex',
    ref: `codex:${String(id || path.basename(archivo)).slice(0, 8)}`,
    titulo: null,
    carpeta: cwd ? path.basename(cwd) : null,
    inicio: fechaLocal(inicio, zona),
    fin: fechaLocal(fin, zona),
    mensajes_de_la_persona: mensajes,
    primer_pedido: recortar(primero, 300),
    cierre: recortar(cierre, 350),
  };
}

export async function leerSesiones({ config, desde, hasta, catalogo }) {
  const zona = config.zona_horaria;
  const f = config.fuentes?.sesiones_ia || {};
  const carpetas = catalogo?.fuentes?.sesiones_ia?.carpetas || {};
  const desdeMs = Date.parse(`${sumarDias(desde, -1)}T00:00:00Z`);
  // Las sesiones del propio orquestador no se cuentan: sería reportar el reporte.
  const excluir = [path.resolve(rutaEspacio()).toLowerCase()];
  const opciones = { desde, hasta, zona, excluir };
  const sesiones = [];
  if (f.claude !== false) {
    const dir = expandirHome(carpetas.claude || '~/.claude/projects');
    for (const a of archivosRecientes(dir, desdeMs, '.jsonl', 2)) {
      const s = await resumirSesionClaude(a, opciones);
      if (s) sesiones.push(s);
    }
  }
  if (f.codex) {
    const dir = expandirHome(carpetas.codex || '~/.codex/sessions');
    for (const a of archivosRecientes(dir, desdeMs, '.jsonl', 4)) {
      const s = await resumirSesionCodex(a, opciones);
      if (s) sesiones.push(s);
    }
  }
  sesiones.sort((a, b) => `${a.inicio}`.localeCompare(`${b.inicio}`));
  const lista = sesiones.slice(-60);
  return {
    desde, hasta, total: sesiones.length, sesiones: lista,
    resumen: `${sesiones.length} sesi${sesiones.length === 1 ? 'ón' : 'ones'}${sesiones.length > lista.length ? ` (se muestran las ${lista.length} más recientes)` : ''}`,
    refs: lista.map((s) => s.ref),
  };
}

// ---------- Registros de trabajo ----------

export async function leerRegistros({ config, desde, hasta }) {
  const carpeta = expandirHome(config.fuentes?.registros?.carpeta || '');
  if (!carpeta || !fs.existsSync(carpeta)) return { total: 0, registros: [], resumen: 'No hay carpeta de registros', refs: [] };
  const registros = [];
  for (const nombre of fs.readdirSync(carpeta)) {
    const ruta = path.join(carpeta, nombre);
    if (!fs.statSync(ruta).isFile()) continue;
    if (nombre.endsWith('.json')) {
      try {
        const j = JSON.parse(fs.readFileSync(ruta, 'utf8'));
        if (j.reporting_exclude || j.no_reportar) continue;
        const fecha = j.date || j.fecha;
        if (!enVentana(fecha, desde, hasta)) continue;
        registros.push({
          ref: `registro:${j.id || path.basename(nombre, '.json')}`,
          fecha,
          proyecto: j.project || j.proyecto || null,
          titulo: recortar(j.title || j.titulo, 160),
          estado: j.state || j.estado || null,
          resultado: recortar(j.outcome || j.resultado, 400),
          horas: j.hours ?? j.horas ?? null,
          proximos_pasos: (j.next_steps || j.proximos_pasos || []).slice(0, 3).map((x) => recortar(x, 160)),
        });
      } catch {
        // archivo inválido: se ignora
      }
    } else if (nombre.endsWith('.md')) {
      const texto = fs.readFileSync(ruta, 'utf8');
      const fecha = (texto.match(/^fecha:\s*(\d{4}-\d{2}-\d{2})/m) || nombre.match(/(\d{4}-\d{2}-\d{2})/) || [])[1];
      if (!enVentana(fecha, desde, hasta)) continue;
      registros.push({ ref: `registro:${path.basename(nombre, '.md')}`, fecha, titulo: recortar(texto.split('\n').find((l) => l.trim()), 160), resultado: recortar(texto, 400) });
    }
  }
  registros.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return { desde, hasta, total: registros.length, registros, resumen: `${registros.length} registro${registros.length === 1 ? '' : 's'}`, refs: registros.map((r) => r.ref) };
}

// ---------- Modelo local (Ollama) ----------

export async function resumirLocal({ config, texto, instruccion }) {
  const modelo = config.fuentes?.ollama?.modelo || 'qwen3.5:9b';
  const prompt = `${instruccion || 'Resumí el siguiente texto en español. Conservá fechas, números, nombres de PR o tickets y decisiones. No agregues nada que no esté en el texto.'}\n\n---\n${texto}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 180_000);
  try {
    const r = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: modelo, prompt, stream: false, think: false, options: { num_ctx: 8192, temperature: 0.2 } }),
      signal: ctrl.signal,
    });
    const j = await r.json();
    if (!r.ok || j.error) return { ok: false, error: j.error || `Ollama respondió ${r.status}` };
    return { ok: true, modelo, resumen: String(j.response || '').trim(), palabras_entrada: texto.split(/\s+/).length };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'El modelo local tardó más de 3 minutos' : `Ollama no responde: ${e.message}` };
  } finally {
    clearTimeout(t);
  }
}
