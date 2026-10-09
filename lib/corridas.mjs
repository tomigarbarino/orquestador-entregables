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
  const previo = lecturas[fuente];
  // Sin duplicados, aunque la misma ref llegue escrita distinto o en lecturas parciales (por día, por página).
  const refs = [];
  const vistas = new Set();
  for (const r of [...(previo?.refs || []), ...(datos.refs || [])].map((x) => String(x).trim()).filter(Boolean)) {
    const clave = normalizarRef(r);
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    refs.push(r);
  }
  const resumenes = [...new Set([previo?.resumen, datos.resumen].filter(Boolean))];
  const consultas = [...(previo?.consultas || [])];
  if (datos.consulta) consultas.push({ consulta: String(datos.consulta), resultados: (datos.refs || []).length });
  lecturas[fuente] = { refs, resumen: resumenes.join(' · ') || undefined, ...(consultas.length ? { consultas } : {}), t: new Date().toISOString() };
  escribirJSON(ruta, lecturas);
  return lecturas[fuente];
}

export function leerLecturas(id) {
  return leerJSONSeguro(path.join(dirDe(id), 'lecturas.json'), {});
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

// Fuentes que el orquestador lee con herramientas propias. Las demás (calendario, mail,
// chat, jira...) se leen con conectores y se registran con registrar_lectura.
export const LECTORES_PROPIOS = { github: 'leer_github', sesiones_ia: 'leer_sesiones', registros: 'leer_registros' };
const FINALES = new Set(['ok', 'omitido', 'error']);

function normalizarRef(ref) {
  return String(ref || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\/(pull|issues)\/(\d+).*$/, '#$2')
    .replace(/\s+/g, ' ');
}

// r (lo que cita el borrador) coincide con x (lo leído) si es la misma referencia o una forma
// más corta que termina igual ("rutas-api#212", "#212", "3f9a21c0" por "claude:3f9a21c0").
// Se compara por el final y por separadores: "#21" no coincide con "#212".
function mismaRef(r, x) {
  if (!r || !x) return false;
  if (r === x) return true;
  if (x.endsWith(r)) {
    const antes = x[x.length - r.length - 1];
    if (r.startsWith('#') || [':', '/', ' '].includes(antes)) return true;
  }
  if (/^(claude|codex):[0-9a-f]{8}$/.test(x) && r.startsWith(x)) return true;
  const num = r.match(/^#?(\d+)$/)?.[1];
  return Boolean(num && x.endsWith(`#${num}`));
}

export function coincideRef(ref, leidas) {
  const r = normalizarRef(ref);
  return Boolean(r) && leidas.some((l) => mismaRef(r, normalizarRef(l)));
}

// descartados: [{ texto, motivo, refs: [...] }]. Acepta "ref" (texto) por compatibilidad.
export function normalizarDescartados(descartados = []) {
  return (Array.isArray(descartados) ? descartados : []).map((d) => {
    const refs = [...(Array.isArray(d?.refs) ? d.refs : []), ...(d?.ref ? [d.ref] : [])].map((r) => String(r).trim()).filter(Boolean);
    return { texto: d?.texto || '', motivo: d?.motivo || '', refs: [...new Set(refs)] };
  });
}

function problemaLectura(fuente) {
  return LECTORES_PROPIOS[fuente]
    ? `no se leyó ${fuente} en esta corrida (usá ${LECTORES_PROPIOS[fuente]})`
    : `no hay lectura registrada de ${fuente}: registrá la lectura con registrar_lectura`;
}

// "Si no hay evidencia, no se cuenta": cada ítem necesita evidencia y TODAS sus referencias
// tienen que ser de una fuente de la receta y aparecer en lo leído en esta corrida (las
// fuentes por conector, en lo registrado con registrar_lectura).
export function controlarEvidencia({ id, receta, items = [] }) {
  const lecturas = leerLecturas(id);
  const fuentesReceta = new Set((receta?.fuentes || []).map((f) => f.id));
  const aceptados = [];
  const rechazados = [];
  for (const item of items) {
    const evidencias = Array.isArray(item.evidencia) ? item.evidencia : [];
    const refs = evidencias.map((ev) => ev?.ref).filter(Boolean);
    if (!evidencias.length) {
      rechazados.push({ texto: item.texto, motivo: 'no tiene evidencia', refs });
      continue;
    }
    const problemas = [];
    for (const ev of evidencias) {
      if (!ev?.fuente || !ev?.ref) problemas.push('evidencia sin fuente o sin referencia');
      else if (fuentesReceta.size && !fuentesReceta.has(ev.fuente)) problemas.push(`la fuente "${ev.fuente}" no es de esta receta`);
      else if (!lecturas[ev.fuente]) problemas.push(problemaLectura(ev.fuente));
      else if (!coincideRef(ev.ref, lecturas[ev.fuente].refs || [])) problemas.push(`"${ev.ref}" no aparece en lo leído de ${ev.fuente}`);
    }
    if (problemas.length) rechazados.push({ texto: item.texto, motivo: [...new Set(problemas)].join('; '), refs });
    else aceptados.push(item);
  }
  return { aceptados, rechazados };
}

// Refs leídas que no terminaron ni en un ítem ni en descartados.
export function refsSinClasificar({ lecturas, items = [], descartados = [] }) {
  const citadas = [
    ...items.flatMap((i) => (Array.isArray(i.evidencia) ? i.evidencia.map((e) => e?.ref) : [])),
    ...normalizarDescartados(descartados).flatMap((d) => d.refs),
  ].filter(Boolean);
  const salida = [];
  for (const [fuente, l] of Object.entries(lecturas || {})) {
    for (const ref of l?.refs || []) {
      if (!citadas.some((c) => coincideRef(c, [ref]))) salida.push({ fuente, ref });
    }
  }
  return salida;
}

// Nodos fuente:* y paso:* de la receta que no llegaron a un estado final (ok, omitido o error).
export function nodosSinEstadoFinal(id, receta) {
  const nodos = estadoNodos(leerEventos(id));
  const esperados = [...(receta?.fuentes || []).map((f) => `fuente:${f.id}`), ...(receta?.pasos || []).map((p) => `paso:${p.id}`)];
  return esperados.filter((n) => !FINALES.has(nodos[n]?.estado)).map((n) => ({ nodo: n, estado: nodos[n]?.estado || 'sin reportar' }));
}

// Un descarte que dice que la cosa no se leyó no es un descarte: es una lectura que falló y va a
// faltantes (lo que no se leyó no se registra como leído).
const MOTIVO_SIN_LEER = /no se (pudo|pudieron) (leer|cargar|abrir)|no (pude|pudimos) (leer|cargar|abrir)|sin leer|no (fue|fueron) le[ií]d[ao]s?|no se ley[oó]|excedi[oó] el l[ií]mite|l[ií]mite de (salida|tokens|tama[nñ]o)|sin contenido visible/i;

// Descartados cuyas refs no están en lo leído (refs mal escritas, con otro prefijo o inventadas).
function descartadosConRefInvalida(desc, lecturas) {
  const leidas = Object.values(lecturas || {}).flatMap((l) => l?.refs || []);
  return desc
    .map((d) => ({ ...d, invalidas: d.refs.filter((r) => !coincideRef(r, leidas)) }))
    .filter((d) => d.invalidas.length);
}

// Control completo antes de guardar el borrador: (a) todas las refs de cada ítem son válidas,
// cada descartado tiene refs que están en lo leído y un motivo sobre el contenido, (b) todo lo
// leído quedó clasificado y (c) todos los nodos de la receta tienen estado final.
export function controlarCierre({ id, receta, items = [], descartados = [] }) {
  const { aceptados, rechazados } = controlarEvidencia({ id, receta, items });
  const lecturas = leerLecturas(id);
  const desc = normalizarDescartados(descartados);
  const descartadosSinRef = desc.filter((d) => !d.refs.length);
  const descartadosRefInvalida = descartadosConRefInvalida(desc.filter((d) => d.refs.length), lecturas);
  const descartadosSinLeer = desc.filter((d) => MOTIVO_SIN_LEER.test(`${d.motivo} ${d.texto}`));
  const sinClasificar = refsSinClasificar({ lecturas, items, descartados: desc });
  const nodosPendientes = nodosSinEstadoFinal(id, receta);
  const ok = !rechazados.length && !descartadosSinRef.length && !descartadosRefInvalida.length && !descartadosSinLeer.length
    && !sinClasificar.length && !nodosPendientes.length;
  return { ok, aceptados, rechazados, descartados: desc, descartadosSinRef, descartadosRefInvalida, descartadosSinLeer, sinClasificar, nodosPendientes };
}

// Nodos de la receta que terminaron en error u omitido sin una línea en faltantes: se suman solos
// (con el resultado que se reportó), para que lo que no se pudo hacer no quede solo en el borrador.
export function completarFaltantes(id, receta, faltantes = []) {
  const lista = Array.isArray(faltantes) ? [...faltantes] : [];
  const nodos = estadoNodos(leerEventos(id));
  const nombrados = new Set(lista.map((f) => String(f?.fuente || '').replace(/^(fuente|paso):/, '')));
  const esperados = [...(receta?.fuentes || []).map((f) => ['fuente', f.id]), ...(receta?.pasos || []).map((p) => ['paso', p.id])];
  for (const [tipo, nid] of esperados) {
    const n = nodos[`${tipo}:${nid}`];
    if (!n || !['error', 'omitido'].includes(n.estado) || nombrados.has(nid)) continue;
    lista.push({ fuente: nid, motivo: `${tipo === 'fuente' ? 'Fuente' : 'Paso'} ${n.estado === 'error' ? 'con error' : 'omitido'}${n.resultado ? `: ${n.resultado}` : ''}` });
  }
  return lista;
}

// Los problemas del control en líneas de texto, para devolverle al modelo o para dejarlos
// como observación en el borrador. Muestra hasta 20 refs sin clasificar y el total.
export function problemasDelControl(r, { maxRefs = 20 } = {}) {
  const lineas = [];
  if (r.rechazados.length) {
    lineas.push(`${r.rechazados.length} ítem(s) con evidencia inválida (todas sus refs tienen que ser válidas):`);
    for (const x of r.rechazados) lineas.push(`- "${x.texto}": ${x.motivo}`);
  }
  if (r.descartadosSinRef.length) {
    lineas.push(`${r.descartadosSinRef.length} descartado(s) sin refs (cada descartado necesita al menos una):`);
    for (const x of r.descartadosSinRef) lineas.push(`- "${x.texto}"`);
  }
  if (r.descartadosRefInvalida?.length) {
    lineas.push(`${r.descartadosRefInvalida.length} descartado(s) con refs que no están en lo leído (copiá la ref tal como vino, con su prefijo):`);
    for (const x of r.descartadosRefInvalida) lineas.push(`- "${x.texto}": ${x.invalidas.join(', ')}`);
  }
  if (r.descartadosSinLeer?.length) {
    lineas.push(`${r.descartadosSinLeer.length} descartado(s) cuyo motivo es que no se leyó: lo que no se leyó no se descarta. Leelo (por partes o por página) o, si no se puede, sacalo de descartados y nombralo en faltantes.`);
    for (const x of r.descartadosSinLeer) lineas.push(`- "${x.texto}"`);
  }
  if (r.sinClasificar.length) {
    const total = r.sinClasificar.length;
    lineas.push(`${total} ref(s) leídas sin clasificar${total > maxRefs ? ` (se muestran ${maxRefs} de ${total})` : ''}: cada una va a un ítem o a descartados con su motivo.`);
    for (const x of r.sinClasificar.slice(0, maxRefs)) lineas.push(`- ${x.fuente}: ${x.ref}`);
  }
  if (r.nodosPendientes.length) {
    lineas.push(`${r.nodosPendientes.length} nodo(s) sin estado final: reportalos con reportar_paso como ok, omitido o error.`);
    for (const x of r.nodosPendientes) lineas.push(`- ${x.nodo} (${x.estado})`);
  }
  return lineas;
}

export function guardarBorrador({ id, borrador, items, descartados, faltantes, control }) {
  const dir = dirDe(id);
  fs.writeFileSync(path.join(dir, 'borrador.md'), borrador);
  escribirJSON(path.join(dir, 'evidencia.json'), { items, descartados, faltantes, control });
}

// Control + guardado con reintentos: mientras haya problemas y no se llegó al último intento,
// rechaza (el modelo corrige y vuelve a llamar). En el último intento guarda igual, con los
// problemas como observaciones al principio del borrador.
export function cerrarCorrida({ id, receta, borrador, items = [], descartados = [], faltantes = [], maxIntentos = 3 }) {
  const meta = leerMeta(id);
  const r = controlarCierre({ id, receta, items, descartados });
  faltantes = completarFaltantes(id, receta, faltantes);
  const intentos = (meta?.intentos_control || 0) + 1;
  actualizarMeta(id, { intentos_control: intentos });
  const problemas = problemasDelControl(r);
  if (!r.ok && intentos < maxIntentos) {
    const partes = [
      r.rechazados.length && `${r.rechazados.length} ítem(s) sin evidencia válida`,
      r.descartadosSinRef.length && `${r.descartadosSinRef.length} descartado(s) sin refs`,
      r.descartadosRefInvalida.length && `${r.descartadosRefInvalida.length} descartado(s) con refs no leídas`,
      r.descartadosSinLeer.length && `${r.descartadosSinLeer.length} descartado(s) sin leer`,
      r.sinClasificar.length && `${r.sinClasificar.length} ref(s) sin clasificar`,
      r.nodosPendientes.length && `${r.nodosPendientes.length} nodo(s) sin estado final`,
    ].filter(Boolean);
    agregarEvento(id, { nodo: 'control', estado: 'en_curso', resultado: `${partes.join(' · ')}: corrigiendo (intento ${intentos} de ${maxIntentos})` });
    return {
      guardado: false,
      intentos,
      control: r,
      mensaje: `Control de evidencia (intento ${intentos} de ${maxIntentos}): no pasa.\n${problemas.join('\n')}\nCorregí y volvé a llamar a guardar_borrador: sacá del borrador lo que no tiene evidencia (o sumale evidencia real que esté en lo leído), clasificá cada ref leída como ítem o descartado (con sus refs tal como vinieron y un motivo sobre su contenido), nombrá en faltantes lo que no pudiste leer y reportá los nodos que faltan. No inventes referencias.`,
    };
  }
  let final = borrador;
  if (!r.ok) {
    final = `> **Observaciones del control de evidencia** (se guardó al intento ${intentos} con problemas; revisalos antes de usar este borrador):\n${problemas.map((l) => `> ${l}`).join('\n')}\n\n${borrador}`;
  }
  const descartadosFinal = [...r.descartados, ...r.rechazados.map((x) => ({ texto: x.texto, motivo: `Sin evidencia válida: ${x.motivo}`, refs: x.refs || [] }))];
  const control = {
    aceptados: r.aceptados.length,
    rechazados: r.rechazados.length,
    descartados_sin_ref: r.descartadosSinRef.length,
    descartados_ref_invalida: r.descartadosRefInvalida.length,
    descartados_sin_leer: r.descartadosSinLeer.length,
    sin_clasificar: r.sinClasificar.length,
    nodos_sin_estado: r.nodosPendientes.map((n) => n.nodo),
    intentos,
    ok: r.ok,
  };
  guardarBorrador({ id, borrador: final, items: r.aceptados, descartados: descartadosFinal, faltantes, control });
  agregarEvento(id, {
    nodo: 'control',
    estado: r.ok ? 'ok' : 'error',
    resultado: `${r.aceptados.length} con evidencia · ${descartadosFinal.length} descartados${faltantes.length ? ` · ${faltantes.length} faltante${faltantes.length === 1 ? '' : 's'}` : ''}${r.ok ? '' : ' · guardado con observaciones'}`,
  });
  return { guardado: true, intentos, control: r, resumen: control };
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

// Aprobar una corrida: solo queda marcada como aprobada y, si había seguimiento propuesto,
// se suma al seguimiento local. No guarda nada más ni manda nada a otros sistemas.
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
  return actualizarMeta(id, { aprobada: new Date().toISOString() });
}
