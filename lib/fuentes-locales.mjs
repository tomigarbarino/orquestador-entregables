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

// Recorta conservando el principio y el final: los cierres suelen dejar lo pendiente al final.
export const recortarExtremos = (t, n) => {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  const cabeza = Math.ceil(n * 0.6) - 2;
  const cola = n - cabeza - 3;
  return `${s.slice(0, cabeza).trimEnd()} … ${s.slice(-cola).trimStart()}`;
};

const enVentana = (fecha, desde, hasta) => Boolean(fecha) && fecha >= desde && fecha <= hasta;

// Ejecuta fn sobre los elementos con a lo sumo n en paralelo.
async function enParalelo(items, n, fn) {
  const salida = new Array(items.length);
  let i = 0;
  const trabajador = async () => {
    while (i < items.length) {
      const k = i++;
      salida[k] = await fn(items[k], k);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, trabajador));
  return salida;
}

// ---------- GitHub: parseo puro (se testea sin red) ----------

export function autoresGithub(config) {
  const p = config?.persona || {};
  const lista = [p.github_usuario, ...(Array.isArray(p.github_usuarios) ? p.github_usuarios : [])]
    .filter((x) => typeof x === 'string' && x.trim())
    .map((x) => x.trim().toLowerCase());
  return [...new Set(lista)];
}

// Sin \b: en JS (sin la marca u) una letra con tilde no cuenta como letra.
const FIN_PALABRA = '(?![A-Za-zÁÉÍÓÚÑáéíóúñ])';
const reTitulo = (alternativas) => new RegExp(`^(${alternativas})${FIN_PALABRA}`, 'i');
const SECCIONES_PR = [
  { etiqueta: 'Problema', re: reTitulo('problema|contexto|motivo|por ?qu[eé]|problem|context|motivation|why') },
  { etiqueta: 'Cambios', re: reTitulo('cambios|qu[eé] cambia|qu[eé] se hizo|qu[eé] hace|qu[eé] entra|soluci[oó]n|implementaci[oó]n|changes|what changed|solution') },
  { etiqueta: 'Riesgos', re: reTitulo('riesgos?|riesgos conocidos|risks?|known issues|limitaciones') },
  // Lo que el PR deja afuera o abierto: sin esto se cuenta como cerrado algo que sigue abierto.
  { etiqueta: 'Pendiente', re: reTitulo('pendientes?|no incluido|qu[eé] no (entra|incluye)|fuera de alcance|qu[eé] falta|out of scope|not included|follow[- ]?ups?') },
];
const RESUMEN_PR = reTitulo('resumen|summary|descripci[oó]n|description');

function seccionesMarkdown(texto) {
  const secciones = [];
  let actual = { titulo: '', lineas: [] };
  for (const linea of texto.split(/\r?\n/)) {
    const h = linea.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/)
      || linea.match(/^\s*(?:\*\*|__)([^*_]{2,60}?):?(?:\*\*|__):?\s*(.*)$/)
      || linea.match(/^\s*([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ ]{2,40}):\s*$/);
    if (h) {
      secciones.push(actual);
      actual = { titulo: h[1].replace(/[*_:]/g, '').trim(), lineas: h[2] ? [h[2]] : [] };
    } else {
      actual.lineas.push(linea);
    }
  }
  secciones.push(actual);
  return secciones.map((s) => ({ titulo: s.titulo, texto: s.lineas.join('\n').trim() })).filter((s) => s.texto);
}

// Cuerpo del PR en hasta `max` caracteres, priorizando las secciones Problema, Cambios, Riesgos y Pendiente.
export function resumirCuerpoPr(body, max = 800) {
  const limpio = String(body || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<img[^>]*>/gi, '')
    .trim();
  if (!limpio) return null;
  const secciones = seccionesMarkdown(limpio);
  const elegidas = [];
  for (const { etiqueta, re } of SECCIONES_PR) {
    const s = secciones.find((x) => re.test(x.titulo));
    if (s) elegidas.push({ etiqueta, texto: recortar(s.texto, 10_000) });
  }
  if (!elegidas.some((e) => e.etiqueta === 'Problema')) {
    const s = secciones.find((x) => RESUMEN_PR.test(x.titulo)) || (secciones[0] && !secciones[0].titulo ? secciones[0] : null);
    if (s && elegidas.length) elegidas.unshift({ etiqueta: 'Resumen', texto: recortar(s.texto, 10_000) });
  }
  if (!elegidas.length) return recortar(limpio.replace(/^\s*#{1,6}\s+/gm, ''), max) || null;
  // Reparto justo del espacio: las secciones cortas ceden lo que no usan.
  const sep = ' | ';
  let disponible = max - sep.length * (elegidas.length - 1) - elegidas.reduce((n, e) => n + e.etiqueta.length + 2, 0);
  const cupos = new Map();
  const porLargo = [...elegidas].sort((a, b) => a.texto.length - b.texto.length);
  porLargo.forEach((e, i) => {
    const cupo = Math.max(20, Math.min(e.texto.length, Math.floor(disponible / (porLargo.length - i))));
    cupos.set(e, cupo);
    disponible -= cupo;
  });
  return recortar(elegidas.map((e) => `${e.etiqueta}: ${recortar(e.texto, cupos.get(e))}`).join(sep), max);
}

// Números de PR que trae un PR (por ejemplo, un release), sacados de sus commits.
export function prsIncluidos(commits, propio) {
  const nums = new Set();
  for (const c of commits || []) {
    const titular = c.messageHeadline || String(c.message || c.commit?.message || '').split('\n')[0];
    for (const m of titular.matchAll(/Merge pull request #(\d+)/gi)) nums.add(Number(m[1]));
    for (const m of titular.matchAll(/\(#(\d+)\)/g)) nums.add(Number(m[1]));
  }
  nums.delete(Number(propio));
  return [...nums].sort((a, b) => a - b);
}

// Resultado de "gh api repos/<repo>/compare/<rama_produccion>...<sha>": true si el sha ya está en producción.
export function llegoAProduccion(compare) {
  let j = compare;
  if (typeof j === 'string') {
    try {
      j = JSON.parse(j);
    } catch {
      return null;
    }
  }
  const status = j?.status;
  if (status === 'behind' || status === 'identical') return true;
  if (status === 'ahead' || status === 'diverged') return false;
  return null;
}

// Último comentario del PR (sirve como motivo de cierre de un PR cerrado sin mergear).
export function motivoCierre(comentarios) {
  const lista = (comentarios || []).filter((c) => String(c?.body || '').trim());
  if (!lista.length) return null;
  return recortar(lista[lista.length - 1].body, 300);
}

export function estadoPr(pr, rama, { enProduccion = null, via = null } = {}) {
  if (pr.mergedAt) {
    if (pr.baseRefName === rama) return `mergeado a ${rama} (producción)`;
    if (enProduccion === true) return `mergeado a ${pr.baseRefName} y ya en producción${via ? ` (vía #${via})` : ''}`;
    if (enProduccion === false) return `mergeado a ${pr.baseRefName}; todavía no llegó a producción (${rama})`;
    return `mergeado a ${pr.baseRefName} (no es producción; no se pudo comprobar si ya llegó a ${rama})`;
  }
  if (pr.state === 'OPEN') {
    const base = pr.isDraft ? 'abierto, en borrador' : 'abierto';
    return pr.baseRefName && pr.baseRefName !== rama ? `${base}, contra ${pr.baseRefName} (no va directo a producción)` : base;
  }
  return 'cerrado sin mergear';
}

// ---------- GitHub ----------

const CUERPO_RELEASE = 2000;

export async function leerGithub({ config, desde, hasta, repos, ejecutor = ejecutar }) {
  const zona = config.zona_horaria;
  const autores = autoresGithub(config);
  const proyectos = config.proyectos || [];
  const objetivo = [];
  for (const p of proyectos) {
    for (const repo of p.repos || []) {
      if (!repos?.length || repos.includes(repo)) objetivo.push({ repo, proyecto: p.nombre, rama: p.rama_produccion || 'main' });
    }
  }
  const gh = async (args, timeout = 30_000) => {
    const r = await ejecutor('gh', args, { timeout });
    if (!r.ok) return null;
    try {
      return JSON.parse(r.stdout);
    } catch {
      return null;
    }
  };
  const resultados = await Promise.all(objetivo.map(async ({ repo, proyecto, rama }) => {
    // Con --search, gh no avisa si el repo no existe: se verifica el acceso aparte.
    const acceso = ejecutor('gh', ['repo', 'view', repo, '--json', 'nameWithOwner'], { timeout: 30_000 });
    const r = await ejecutor('gh', [
      'pr', 'list', '--repo', repo, '--state', 'all', '--limit', '60',
      '--search', `updated:>=${sumarDias(desde, -1)}`,
      '--json', 'number,title,body,state,isDraft,mergedAt,mergeCommit,createdAt,updatedAt,closedAt,baseRefName,headRefName,url,author',
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
    const delaVentana = lista
      .map((pr) => ({
        pr,
        merge: fechaLocal(pr.mergedAt, zona),
        creado: fechaLocal(pr.createdAt, zona),
        actualizado: fechaLocal(pr.updatedAt, zona),
      }))
      .filter((x) => enVentana(x.merge, desde, hasta) || enVentana(x.creado, desde, hasta) || enVentana(x.actualizado, desde, hasta));
    const deLaPersona = (pr) => !autores.length || autores.includes(String(pr.author?.login || '').toLowerCase());

    // Qué PRs trae cada PR a producción (de cualquier autor: un release ajeno puede llevar los de la persona).
    const aProduccion = delaVentana.filter((x) => x.pr.baseRefName === rama && (x.pr.mergedAt || x.pr.state === 'OPEN'));
    const incluyePorNumero = new Map();
    await enParalelo(aProduccion, 4, async ({ pr }) => {
      const j = await gh(['pr', 'view', String(pr.number), '--repo', repo, '--json', 'commits']);
      incluyePorNumero.set(pr.number, j ? prsIncluidos(j.commits, pr.number) : null);
    });
    const viaDe = (numero) => {
      const llevan = aProduccion.filter((x) => x.pr.mergedAt && (incluyePorNumero.get(x.pr.number) || []).includes(numero));
      return llevan.length ? llevan.sort((p, q) => `${p.pr.mergedAt}`.localeCompare(`${q.pr.mergedAt}`))[0].pr.number : null;
    };

    const propios = delaVentana.filter((x) => deLaPersona(x.pr));
    const prs = await enParalelo(propios, 4, async ({ pr, merge, creado, actualizado }) => {
      let enProduccion = null;
      let via = null;
      let motivo;
      if (pr.mergedAt && pr.baseRefName === rama) enProduccion = true;
      else if (pr.mergedAt) {
        const sha = pr.mergeCommit?.oid;
        if (sha) {
          const c = await gh(['api', `repos/${repo}/compare/${rama}...${sha}`, '--jq', '{status: .status, ahead_by: .ahead_by, behind_by: .behind_by}']);
          enProduccion = llegoAProduccion(c);
          if (enProduccion) via = viaDe(pr.number);
        }
      } else if (pr.state === 'OPEN') enProduccion = false;
      else {
        const j = await gh(['pr', 'view', String(pr.number), '--repo', repo, '--json', 'comments']);
        motivo = j ? motivoCierre(j.comments) : null;
      }
      const salida = {
        ref: `${repo}#${pr.number}`,
        numero: pr.number,
        titulo: recortar(pr.title, 160),
        estado: estadoPr(pr, rama, { enProduccion, via }),
        en_produccion: enProduccion,
        rama_destino: pr.baseRefName,
        rama_origen: pr.headRefName,
        mergeado_el: merge,
        creado_el: creado,
        actualizado_el: actualizado,
        autor: pr.author?.login,
        url: pr.url,
        // Un release o una convergencia a producción sin PRs incluidos a la vista se cuenta por su
        // cuerpo (lo que entra, sus riesgos y lo que queda afuera): necesita más lugar.
        cuerpo: resumirCuerpoPr(pr.body, pr.baseRefName === rama && !(incluyePorNumero.get(pr.number) || []).length ? CUERPO_RELEASE : 800),
      };
      if (pr.baseRefName === rama && incluyePorNumero.has(pr.number)) salida.incluye = incluyePorNumero.get(pr.number);
      if (motivo !== undefined) salida.motivo_cierre = motivo;
      return salida;
    });
    return { repo, proyecto, rama_produccion: rama, ok: true, prs };
  }));
  const total = resultados.reduce((n, r) => n + r.prs.length, 0);
  const conError = resultados.filter((r) => !r.ok);
  const conPrs = resultados.filter((r) => r.prs.length).length;
  const revisados = resultados.length - conError.length;
  return {
    desde, hasta, filtro_autor: autores.length ? autores : null, repos: resultados, total,
    resumen: `${total} PR${total === 1 ? '' : 's'} en ${conPrs} repo${conPrs === 1 ? '' : 's'} (de ${revisados} revisado${revisados === 1 ? '' : 's'})${conError.length ? ` · sin acceso a ${conError.map((x) => x.repo).join(', ')}` : ''}`,
    refs: resultados.flatMap((r) => r.prs.map((p) => p.ref)),
  };
}

// ---------- GitHub: issues asignados a la persona ----------

// Repos a mirar: los pedidos (repos), si no los del origen de tareas de GitHub y, si no, los de los proyectos.
export function reposDeIssues(config, repos) {
  const proyectoDe = new Map();
  for (const p of config?.proyectos || []) for (const r of p.repos || []) proyectoDe.set(r, p.nombre);
  const deOrigen = (config?.origen_tareas || []).filter((o) => o.fuente === 'github').flatMap((o) => o.repos || []);
  const lista = repos?.length ? repos : deOrigen.length ? deOrigen : [...proyectoDe.keys()];
  return [...new Set(lista)].map((repo) => ({ repo, proyecto: proyectoDe.get(repo) || null }));
}

export async function leerIssuesGithub({ config, desde, hasta, repos, ejecutor = ejecutar }) {
  const zona = config.zona_horaria;
  const objetivo = reposDeIssues(config, repos);
  const resultados = await Promise.all(objetivo.map(async ({ repo, proyecto }) => {
    const r = await ejecutor('gh', [
      'issue', 'list', '--repo', repo, '--assignee', '@me', '--state', 'all', '--limit', '60',
      '--search', `updated:>=${sumarDias(desde, -1)}`,
      '--json', 'number,title,body,state,stateReason,createdAt,updatedAt,closedAt,url,author,labels',
    ], { timeout: 45_000 });
    if (!r.ok) return { repo, proyecto, ok: false, error: recortar(r.stderr || r.error, 200), issues: [] };
    let lista = [];
    try {
      lista = JSON.parse(r.stdout);
    } catch {
      return { repo, proyecto, ok: false, error: 'gh devolvió algo que no es JSON', issues: [] };
    }
    const issues = lista
      .map((i) => ({ i, creado: fechaLocal(i.createdAt, zona), actualizado: fechaLocal(i.updatedAt, zona), cerrado: fechaLocal(i.closedAt, zona) }))
      .filter((x) => enVentana(x.creado, desde, hasta) || enVentana(x.actualizado, desde, hasta) || enVentana(x.cerrado, desde, hasta))
      .map(({ i, creado, actualizado, cerrado }) => ({
        ref: `${repo}#${i.number}`,
        numero: i.number,
        titulo: recortar(i.title, 160),
        estado: String(i.state || '').toUpperCase() === 'OPEN' ? 'abierto' : `cerrado${i.stateReason ? ` (${String(i.stateReason).toLowerCase().replaceAll('_', ' ')})` : ''}`,
        pedido_por: i.author?.login || null,
        creado_el: creado,
        actualizado_el: actualizado,
        cerrado_el: cerrado || null,
        etiquetas: (i.labels || []).map((l) => l.name).filter(Boolean),
        url: i.url,
        cuerpo: recortar(i.body, 600),
      }));
    return { repo, proyecto, ok: true, issues };
  }));
  const total = resultados.reduce((n, r) => n + r.issues.length, 0);
  const conError = resultados.filter((r) => !r.ok);
  return {
    desde, hasta, repos: resultados, total,
    resumen: `${total} issue${total === 1 ? '' : 's'} asignado${total === 1 ? '' : 's'} en ${resultados.length - conError.length} repo${resultados.length - conError.length === 1 ? '' : 's'}${conError.length ? ` · sin acceso a ${conError.map((x) => x.repo).join(', ')}` : ''}`,
    refs: resultados.flatMap((r) => r.issues.map((x) => x.ref)),
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
  if (Array.isArray(contenido)) return contenido.filter((b) => b.type === 'text' || b.type === 'input_text' || b.type === 'output_text').map((b) => b.text).join('\n');
  return '';
}

const esRuido = (t) => !t || !String(t).trim()
  || /^\s*<(command|local-command|system-reminder|task-notification|ide_|environment_context|user_instructions|turn_aborted)/.test(t)
  || /^\s*\[Request interrupted/.test(t) || /^Caveat:/.test(t);

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

const LIMITES = { primer_pedido: 400, cierre: 1500, hito_pedido: 300, hito_cierre: 600, hitos: 10, pendientes: 15, pendiente: 240, salida: 80_000 };

// "Quedaron hechos..." cuenta lo terminado, no lo pendiente.
const INICIO_PENDIENTE = /^(falta|pendiente|queda(?!ron)|lo que queda|lo [uú]nico que|riesgo|bloque|pr[oó]ximos pasos)/i;

// Líneas de un mensaje del asistente que hablan de lo que falta, lo pendiente o los riesgos.
export function extraerPendientes(texto) {
  const lineas = String(texto || '').split(/\r?\n/);
  const salida = [];
  const limpiar = (l) => l
    .replace(/^\s*(?:[-*+•>]\s+|\d+[.)]\s+|#{1,6}\s+)?/, '')
    .replace(/\*\*|__|`/g, '')
    .trim();
  for (let i = 0; i < lineas.length; i++) {
    const l = limpiar(lineas[i]);
    if (!INICIO_PENDIENTE.test(l)) continue;
    let texto = l;
    // Un título ("Pendientes:") se completa con las líneas que lo siguen.
    if (l.length <= 40 && (/:$/.test(l) || /^(pendientes?|riesgos?( conocidos)?|bloqueos?|pr[oó]ximos pasos|lo que queda|faltantes?|falta)$/i.test(l))) {
      const siguientes = [];
      let ultima = i;
      for (let k = i + 1; k < lineas.length; k++) {
        const s = lineas[k];
        if (!s.trim()) {
          if (siguientes.length) break;
          continue;
        }
        if (/^\s*#{1,6}\s/.test(s)) break;
        // Debajo del título van solo los ítems de lista; uno que empieza con otra palabra clave va aparte.
        if (!/^\s*(?:[-*+•]\s+|\d+[.)]\s+)/.test(s)) break;
        const item = limpiar(s);
        if (INICIO_PENDIENTE.test(item)) break;
        // Lo que no entra queda para la próxima línea (si empieza con una palabra clave, va aparte).
        if (siguientes.length && `${l} ${siguientes.join('; ')}; ${item}`.length > LIMITES.pendiente) break;
        siguientes.push(item);
        ultima = k;
      }
      if (siguientes.length) {
        texto = `${l.replace(/:$/, '')}: ${siguientes.join('; ')}`;
        i = ultima;
      }
    }
    salida.push(recortar(texto, LIMITES.pendiente));
  }
  return salida;
}

// Acumula pedidos, cierres, hitos y pendientes de una sesión, mensaje a mensaje.
function nuevoAcumulador(zona) {
  const acc = {
    primero: null, pedido: null, mensajes: 0, cierre: null, hitos: [], pendientes: [],
    actual: null, ultimoIdAsistente: null,
  };
  const cerrarHito = () => {
    if (acc.actual?.cierre) {
      acc.hitos.push({
        fecha: fechaLocal(acc.actual.instante, zona),
        pedido: recortar(acc.actual.pedido, LIMITES.hito_pedido),
        cierre: recortarExtremos(acc.actual.cierre, LIMITES.hito_cierre),
      });
    }
  };
  return {
    acc,
    pedido(texto) {
      cerrarHito();
      acc.mensajes += 1;
      if (!acc.primero) acc.primero = texto;
      acc.pedido = texto;
      acc.actual = { pedido: texto, cierre: null, instante: null };
      acc.ultimoIdAsistente = null;
    },
    asistente(texto, instante, idMensaje = null) {
      if (!texto || !texto.trim()) return;
      // Claude Code parte un mismo mensaje en varias líneas con el mismo id.
      const mismo = idMensaje && idMensaje === acc.ultimoIdAsistente;
      acc.cierre = mismo ? `${acc.cierre}\n${texto}` : texto;
      acc.ultimoIdAsistente = idMensaje;
      if (acc.actual) {
        acc.actual.cierre = mismo && acc.actual.cierre ? `${acc.actual.cierre}\n${texto}` : texto;
        acc.actual.instante = instante;
      }
      for (const p of extraerPendientes(texto)) {
        const clave = p.toLowerCase();
        const i = acc.pendientes.findIndex((x) => x.toLowerCase() === clave);
        if (i >= 0) acc.pendientes.splice(i, 1);
        acc.pendientes.push(p);
      }
    },
    terminar() {
      cerrarHito();
      acc.actual = null;
      return acc;
    },
  };
}

// Hasta `max` hitos: primero el último de cada día (los días más nuevos primero), después los más recientes.
export function elegirHitos(hitos, max = LIMITES.hitos) {
  if (hitos.length <= max) return hitos;
  const elegidos = new Set();
  const ultimoPorDia = new Map();
  hitos.forEach((h, i) => ultimoPorDia.set(h.fecha, i));
  for (const i of [...ultimoPorDia.values()].sort((a, b) => b - a)) {
    if (elegidos.size >= max) break;
    elegidos.add(i);
  }
  for (let i = hitos.length - 1; i >= 0 && elegidos.size < max; i--) elegidos.add(i);
  return [...elegidos].sort((a, b) => a - b).map((i) => hitos[i]);
}

function armarSesion(base, acc) {
  return {
    ...base,
    mensajes_de_la_persona: acc.mensajes,
    primer_pedido: recortar(acc.primero, LIMITES.primer_pedido),
    ultimo_pedido: acc.pedido !== acc.primero ? recortar(acc.pedido, 200) : null,
    cierre: recortarExtremos(acc.cierre, LIMITES.cierre),
    hitos: elegirHitos(acc.hitos),
    ...(acc.hitos.length > LIMITES.hitos ? { hitos_total: acc.hitos.length } : {}),
    pendientes: acc.pendientes.slice(-LIMITES.pendientes),
  };
}

function pedidoClaude(j) {
  if (j.isMeta || j.isCompactSummary || j.toolUseResult) return null;
  const c = j.message?.content;
  if (typeof c === 'string') return esRuido(c) ? null : c;
  if (Array.isArray(c) && c.length && !c.some((b) => b.type === 'tool_result')) {
    const t = textoDe(c);
    return esRuido(t) ? null : t;
  }
  return null;
}

export async function resumirSesionClaude(archivo, { desde, hasta, zona, excluir = [] }) {
  let titulo = null;
  let cwd = null;
  let id = path.basename(archivo, '.jsonl');
  let inicio = null;
  let fin = null;
  const s = nuevoAcumulador(zona);
  for await (const j of lineasJson(archivo)) {
    if (j.type === 'custom-title' && j.customTitle) titulo = j.customTitle;
    if ((j.type !== 'user' && j.type !== 'assistant') || j.isSidechain) continue;
    const fecha = fechaLocal(j.timestamp, zona);
    if (!enVentana(fecha, desde, hasta)) continue;
    cwd = cwd || j.cwd;
    id = j.sessionId || id;
    inicio = inicio || j.timestamp;
    fin = j.timestamp;
    if (j.type === 'user') {
      const pedido = pedidoClaude(j);
      if (pedido) s.pedido(pedido);
    } else {
      s.asistente(textoDe(j.message?.content), j.timestamp, j.message?.id || null);
    }
  }
  const acc = s.terminar();
  if (!inicio || !acc.primero) return null;
  if (cwd && excluir.some((x) => path.resolve(cwd).toLowerCase().startsWith(x))) return null;
  return armarSesion({
    herramienta: 'Claude Code',
    ref: `claude:${id.slice(0, 8)}`,
    titulo: titulo ? recortar(titulo, 100) : null,
    carpeta: cwd ? path.basename(cwd) : null,
    inicio: fechaLocal(inicio, zona),
    fin: fechaLocal(fin, zona),
  }, acc);
}

export async function resumirSesionCodex(archivo, { desde, hasta, zona, excluir = [] }) {
  let cwd = null;
  let id = null;
  let automatica = false;
  let inicio = null;
  let fin = null;
  const s = nuevoAcumulador(zona);
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
      s.pedido(p.message);
      inicio = inicio || j.timestamp;
      fin = j.timestamp;
    }
    if (j.type === 'event_msg' && p.type === 'agent_message' && p.message) {
      s.asistente(p.message, j.timestamp);
      fin = j.timestamp;
    }
    if (j.type === 'event_msg' && p.type === 'task_complete' && p.last_agent_message) s.asistente(p.last_agent_message, j.timestamp);
    if (j.type === 'response_item' && p.type === 'message' && p.role === 'assistant') {
      const t = textoDe(p.content);
      if (t) s.asistente(t, j.timestamp);
    }
  }
  const acc = s.terminar();
  if (!inicio || !acc.primero) return null;
  if (cwd && excluir.some((x) => path.resolve(cwd).toLowerCase().startsWith(x))) return null;
  return armarSesion({
    herramienta: automatica ? 'Codex (automática)' : 'Codex',
    ref: `codex:${String(id || path.basename(archivo)).slice(0, 8)}`,
    titulo: null,
    carpeta: cwd ? path.basename(cwd) : null,
    inicio: fechaLocal(inicio, zona),
    fin: fechaLocal(fin, zona),
  }, acc);
}

// Si la salida pasa del máximo, saca hitos de las sesiones más viejas (y de sus hitos más viejos).
export function limitarTamano(sesiones, max = LIMITES.salida) {
  const medir = () => JSON.stringify(sesiones).length;
  let tam = medir();
  if (tam <= max) return sesiones;
  const porAntiguedad = [...sesiones].sort((a, b) => `${a.inicio}`.localeCompare(`${b.inicio}`));
  for (const s of porAntiguedad) {
    while (tam > max && s.hitos?.length) {
      const h = s.hitos.shift();
      tam -= JSON.stringify(h).length + 1;
      if (!s.recortado) {
        s.recortado = true;
        tam += 17;
      }
    }
    if (tam <= max) break;
  }
  tam = medir();
  // Último recurso: achicar cierres y pendientes de las más viejas.
  for (const s of porAntiguedad) {
    if (tam <= max) break;
    s.cierre = recortarExtremos(s.cierre, 400);
    s.pendientes = (s.pendientes || []).slice(-3);
    s.recortado = true;
    tam = medir();
  }
  return sesiones;
}

export async function leerSesiones({ config, desde, hasta, catalogo, max = LIMITES.salida }) {
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
  const lista = limitarTamano(sesiones.slice(-60), max);
  const recortadas = lista.filter((s) => s.recortado).length;
  return {
    desde, hasta, total: sesiones.length, sesiones: lista,
    resumen: `${sesiones.length} sesi${sesiones.length === 1 ? 'ón' : 'ones'}${sesiones.length > lista.length ? ` (se muestran las ${lista.length} más recientes)` : ''}${recortadas ? ` · ${recortadas} recortada${recortadas === 1 ? '' : 's'} por tamaño` : ''}`,
    refs: lista.map((s) => s.ref),
  };
}

// Parte una lista en páginas de hasta `max` caracteres en JSON (cada elemento entero en una
// sola página), para que la salida de una herramienta no pase el límite del cliente MCP.
export function paginarPorTamano(lista, max = 40_000) {
  const paginas = [];
  let actual = [];
  let tam = 2;
  for (const x of lista || []) {
    const t = JSON.stringify(x).length + 1;
    if (actual.length && tam + t > max) {
      paginas.push(actual);
      actual = [];
      tam = 2;
    }
    actual.push(x);
    tam += t;
  }
  if (actual.length || !paginas.length) paginas.push(actual);
  return paginas;
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
