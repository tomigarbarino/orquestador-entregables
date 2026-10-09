// Corridas: cada vez que se arma un entregable queda una carpeta con sus eventos (lo que
// muestra el visualizador), lo que se leyó de cada fuente, el borrador y su evidencia.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { enEspacio, dentroDe } from './rutas.mjs';
import { ahoraEn } from './horario.mjs';

const ID_CORRIDA = /^[0-9]{8}-[0-9]{6}-[a-z][a-z0-9-]*(-[0-9]+)?$/;

export function dirCorridas() {
  return enEspacio('corridas');
}

function dirDe(id) {
  if (!ID_CORRIDA.test(id || '')) throw new Error(`Id de corrida inválido: ${id}`);
  return dentroDe(dirCorridas(), id);
}

function escribirJSON(ruta, datos) {
  fs.writeFileSync(ruta, JSON.stringify(datos, null, 2));
}

function leerJSONSeguro(ruta, defecto) {
  try {
    return JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch {
    return defecto;
  }
}

export function nuevaCorrida({ entregable, origen = 'interfaz', modo = 'borrador', zona }) {
  const ahora = ahoraEn(zona);
  let id = `${ahora.fecha.replaceAll('-', '')}-${ahora.hora.replace(':', '')}${String(new Date().getSeconds()).padStart(2, '0')}-${entregable}`;
  let n = 1;
  while (fs.existsSync(path.join(dirCorridas(), id))) id = `${id.replace(/-[0-9]+$/, '')}-${++n}`;
  const dir = path.join(dirCorridas(), id);
  fs.mkdirSync(dir, { recursive: true });
  escribirJSON(path.join(dir, 'meta.json'), { id, entregable, origen, modo, inicio: new Date().toISOString(), estado: 'en_curso', intentos_control: 0 });
  agregarEvento(id, { nodo: 'disparador', estado: 'en_curso', resultado: origen === 'interfaz' ? 'Probar ahora' : origen === 'rutina' ? 'Rutina programada' : 'Pedido desde Claude Code' });
  return id;
}

export function leerMeta(id) {
  return leerJSONSeguro(path.join(dirDe(id), 'meta.json'), null);
}

export function actualizarMeta(id, cambios) {
  const ruta = path.join(dirDe(id), 'meta.json');
  const meta = { ...leerJSONSeguro(ruta, {}), ...cambios };
  escribirJSON(ruta, meta);
  return meta;
}

const ESTADOS = new Set(['en_curso', 'ok', 'error', 'omitido', 'aviso']);

export function normalizarNodo(nodo, receta) {
  if (!nodo) return null;
  if (/^(disparador|control|destino)$/.test(nodo) || /^(fuente|paso):/.test(nodo)) return nodo;
  if (receta?.fuentes?.some((f) => f.id === nodo)) return `fuente:${nodo}`;
  if (receta?.pasos?.some((p) => p.id === nodo)) return `paso:${nodo}`;
  return nodo;
}

export function agregarEvento(id, evento) {
  const estado = ESTADOS.has(evento.estado) ? evento.estado : 'aviso';
  const linea = JSON.stringify({ t: new Date().toISOString(), ...evento, estado, resultado: evento.resultado ? String(evento.resultado).slice(0, 300) : undefined });
  fs.appendFileSync(path.join(dirDe(id), 'eventos.jsonl'), `${linea}\n`);
}

export function leerEventos(id) {
  const ruta = path.join(dirDe(id), 'eventos.jsonl');
  if (!fs.existsSync(ruta)) return [];
  return fs.readFileSync(ruta, 'utf8').split('\n').filter(Boolean).map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

// Último estado de cada nodo, para pintar el visualizador.
export function estadoNodos(eventos) {
  const nodos = {};
  for (const e of eventos) {
    if (!e.nodo) continue;
    nodos[e.nodo] = { estado: e.estado, resultado: e.resultado || nodos[e.nodo]?.resultado || '', t: e.t };
  }
  return nodos;
}

export function registrarLectura(id, fuente, datos) {
  const ruta = path.join(dirDe(id), 'lecturas.json');
  const lecturas = leerJSONSeguro(ruta, {});
  lecturas[fuente] = { refs: [...new Set([...(lecturas[fuente]?.refs || []), ...(datos.refs || [])])], resumen: datos.resumen, t: new Date().toISOString() };
  escribirJSON(ruta, lecturas);
}

export function leerCorrida(id) {
  const dir = dirDe(id);
  if (!fs.existsSync(dir)) return null;
  const eventos = leerEventos(id);
  const borradorRuta = path.join(dir, 'borrador.md');
  return {
    meta: leerMeta(id),
    eventos,
    nodos: estadoNodos(eventos),
    lecturas: leerJSONSeguro(path.join(dir, 'lecturas.json'), {}),
    borrador: fs.existsSync(borradorRuta) ? fs.readFileSync(borradorRuta, 'utf8') : null,
    evidencia: leerJSONSeguro(path.join(dir, 'evidencia.json'), null),
    seguimiento: leerJSONSeguro(path.join(dir, 'seguimiento-propuesto.json'), null),
  };
}

export function listarCorridas(limite = 30) {
  const dir = dirCorridas();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((n) => ID_CORRIDA.test(n))
    .sort()
    .reverse()
    .slice(0, limite)
    .map((n) => leerMeta(n))
    .filter(Boolean);
}

export function ultimaCorridaDe(entregable, { aprobada = false } = {}) {
  return listarCorridas(200).find((m) => m.entregable === entregable && (!aprobada || m.aprobada));
}

// ---------- Control de evidencia ----------

function normalizarRef(ref) {
  return String(ref || '').trim().toLowerCase().replace(/^https?:\/\/github\.com\//, '').replace('/pull/', '#');
}

function coincideRef(ref, leidas) {
  const r = normalizarRef(ref);
  if (!r) return false;
  return leidas.some((l) => {
    const x = normalizarRef(l);
    if (x === r || r.includes(x) || x.includes(r)) return true;
    const num = r.match(/#(\d+)$/)?.[1] || r.match(/^#?(\d+)$/)?.[1];
    return num && x.endsWith(`#${num}`) && (!r.includes('/') || x.startsWith(r.split('#')[0]));
  });
}

// "Si no hay evidencia, no se cuenta": cada ítem necesita al menos una evidencia de una
// fuente de la receta, y si la fuente es una de las que lee el orquestador, la referencia
// tiene que aparecer en lo que efectivamente se leyó en esta corrida.
export function controlarEvidencia({ id, receta, items = [] }) {
  const lecturas = leerJSONSeguro(path.join(dirDe(id), 'lecturas.json'), {});
  const fuentesReceta = new Set((receta?.fuentes || []).map((f) => f.id));
  const verificables = { github: 'github', sesiones_ia: 'sesiones_ia', registros: 'registros' };
  const aceptados = [];
  const rechazados = [];
  for (const item of items) {
    const evidencias = Array.isArray(item.evidencia) ? item.evidencia : [];
    if (!evidencias.length) {
      rechazados.push({ texto: item.texto, motivo: 'no tiene evidencia' });
      continue;
    }
    const problemas = [];
    for (const ev of evidencias) {
      if (!ev?.fuente || !ev?.ref) problemas.push('evidencia sin fuente o sin referencia');
      else if (fuentesReceta.size && !fuentesReceta.has(ev.fuente)) problemas.push(`la fuente "${ev.fuente}" no es de esta receta`);
      else if (verificables[ev.fuente]) {
        const leidas = lecturas[ev.fuente]?.refs || [];
        if (!leidas.length) problemas.push(`no se leyó ${ev.fuente} en esta corrida`);
        else if (!coincideRef(ev.ref, leidas)) problemas.push(`"${ev.ref}" no aparece en lo leído de ${ev.fuente}`);
      }
    }
    const validas = evidencias.length - problemas.length;
    if (validas > 0) aceptados.push(item);
    else rechazados.push({ texto: item.texto, motivo: problemas.join('; ') });
  }
  return { aceptados, rechazados };
}

export function guardarBorrador({ id, borrador, items, descartados, faltantes, control }) {
  const dir = dirDe(id);
  fs.writeFileSync(path.join(dir, 'borrador.md'), borrador);
  escribirJSON(path.join(dir, 'evidencia.json'), { items, descartados, faltantes, control });
}

// ---------- Seguimiento comercial (módulo) ----------

export function guardarSeguimientoPropuesto(id, datos) {
  escribirJSON(path.join(dirDe(id), 'seguimiento-propuesto.json'), datos);
}

export function rutaSeguimiento() {
  return enEspacio('seguimiento.yaml');
}

export function leerSeguimiento() {
  try {
    return YAML.parse(fs.readFileSync(rutaSeguimiento(), 'utf8'))?.pasos || [];
  } catch {
    return [];
  }
}

export function escribirSeguimiento(pasos) {
  fs.writeFileSync(rutaSeguimiento(), YAML.stringify({ pasos }, { lineWidth: 0 }));
}

// Aprobar una corrida: queda marcada, se guarda el recibo y, si había seguimiento
// propuesto, se suma al seguimiento local. No manda nada a otros sistemas.
export function aprobarCorrida(id) {
  const c = leerCorrida(id);
  if (!c?.borrador) throw new Error('La corrida no tiene un borrador para aprobar');
  if (c.seguimiento?.pasos?.length) {
    const actuales = leerSeguimiento();
    for (const p of c.seguimiento.pasos) {
      const clave = `${c.seguimiento.cliente}|${p.paso}`.toLowerCase();
      if (!actuales.some((x) => `${x.cliente}|${x.paso}`.toLowerCase() === clave)) {
        actuales.push({ cliente: c.seguimiento.cliente, fecha_reunion: c.seguimiento.fecha_reunion, ...p, estado: 'pendiente', corrida: id });
      }
    }
    escribirSeguimiento(actuales);
  }
  const recibos = enEspacio('recibos');
  fs.mkdirSync(recibos, { recursive: true });
  escribirJSON(path.join(recibos, `${id}.json`), { corrida: id, entregable: c.meta.entregable, aprobada: new Date().toISOString(), items: c.evidencia?.items?.map((i) => i.texto) || [] });
  return actualizarMeta(id, { aprobada: new Date().toISOString() });
}
