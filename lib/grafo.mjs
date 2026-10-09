// Arma los grafos del visualizador a partir de la config y las recetas. Nunca se dibujan a mano.
// Sin dependencias de Node: lo usa la interfaz (React Flow) y se puede testear con node:test.
import { entregablesDe, recetaEfectiva, modulosActivos, nombreDestino } from './receta-efectiva.mjs';
import { textoHorario } from './horario.mjs';

const ANCHO_PASO = 270;
const ALTO_FILA = 140;
const ALTO_FILA_GENERAL = 92;

function nodo(id, x, y, data) {
  return { id, type: 'nodo', position: { x, y }, data };
}

// Cada nodo tiene entradas a la izquierda y arriba, y salidas a la derecha y abajo.
function arista(origen, destino, extra = {}) {
  return { id: `${origen}->${destino}`, source: origen, target: destino, sourceHandle: 'der', targetHandle: 'izq', ...extra };
}

function conexionDe(estadoFuentes, id, config) {
  const activa = config?.fuentes?.[id]?.activo;
  if (!config?.fuentes?.[id]) return { conexion: 'desconectada', detalleConexion: 'No está definida en la configuración' };
  if (activa === false) return { conexion: 'desconectada', detalleConexion: 'La fuente está apagada en la configuración' };
  const e = estadoFuentes?.[id];
  if (!e) return { conexion: 'desconocida', detalleConexion: 'Todavía no se revisó la conexión' };
  return { conexion: e.conectada ? 'conectada' : 'desconectada', detalleConexion: e.detalle || '' };
}

function centrar(n, alto = ALTO_FILA) {
  return ((n - 1) * alto) / 2;
}

// Vista por entregable: disparador → fuentes → pasos → control de evidencia → destino.
export function grafoEntregable({ entregableId, config, recetas, modulos, estadoFuentes, nombresFuentes = {} }) {
  const entregable = entregablesDe(config, recetas, modulos).find((e) => e.id === entregableId);
  if (!entregable) return { nodes: [], edges: [], error: `No existe el entregable "${entregableId}"` };
  const ef = recetaEfectiva(entregable, config, recetas, modulos);
  if (!ef) return { nodes: [], edges: [], error: `No existe la receta "${entregable.receta}"` };
  const { receta } = ef;
  const nodes = [];
  const edges = [];
  // Columnas: disparador | fuentes apiladas | pasos encadenados de arriba hacia abajo | control | destino.
  const ALTO_PASO = 150;
  const altoFuentes = Math.max(receta.fuentes.length - 1, 0) * ALTO_FILA;
  const altoPasos = Math.max(receta.pasos.length - 1, 0) * ALTO_PASO;
  const alto = Math.max(altoFuentes, altoPasos);
  const yCentro = alto / 2;
  const yFuentes = (alto - altoFuentes) / 2;
  const yPasos = (alto - altoPasos) / 2;

  const disparo = receta.disparador || {};
  nodes.push(nodo('disparador', 0, yCentro, {
    tipo: 'disparador',
    titulo: 'Disparador',
    subtitulo: textoHorario(ef.horario),
    detalle: [
      disparo.ventana ? `Ventana: ${disparo.ventana.replaceAll('_', ' ')}` : null,
      disparo.frases?.length ? `También a pedido: "${disparo.frases[0]}"` : null,
    ].filter(Boolean).join(' · '),
    entregable: entregable.id,
    activo: entregable.activo,
  }));

  receta.fuentes.forEach((f, i) => {
    const id = `fuente:${f.id}`;
    nodes.push(nodo(id, 300, yFuentes + i * ALTO_FILA, {
      tipo: 'fuente',
      fuente: f.id,
      titulo: nombresFuentes[f.id] || f.id,
      subtitulo: f.para,
      requerida: Boolean(f.requerida),
      modulo: f.modulo || null,
      entregable: entregable.id,
      ...conexionDe(estadoFuentes, f.id, config),
    }));
    edges.push(arista('disparador', id));
  });

  receta.pasos.forEach((p, i) => {
    const id = `paso:${p.id}`;
    nodes.push(nodo(id, 620, yPasos + i * ALTO_PASO, {
      tipo: 'paso',
      paso: p.id,
      numero: i + 1,
      titulo: p.nombre,
      subtitulo: p.detalle || '',
      usa: p.usa || [],
      modulo: p.modulo || null,
      entregable: entregable.id,
    }));
    if (i > 0) edges.push(arista(`paso:${receta.pasos[i - 1].id}`, id, { sourceHandle: 'abajo', targetHandle: 'arriba' }));
  });

  for (const f of receta.fuentes) {
    const consumidor = receta.pasos.find((p) => p.usa?.includes(f.id)) || receta.pasos.find((p) => p.usa?.length) || receta.pasos[0];
    if (consumidor) edges.push(arista(`fuente:${f.id}`, `paso:${consumidor.id}`));
  }

  const xControl = 620 + ANCHO_PASO + 40;
  const yUltimo = yPasos + altoPasos;
  nodes.push(nodo('control', xControl, yUltimo, {
    tipo: 'control',
    titulo: 'Control de evidencia',
    subtitulo: 'Si no hay evidencia, no se cuenta',
    reglas: receta.control,
    reglasAprendidas: receta.reglas || [],
    entregable: entregable.id,
  }));
  const ultimo = receta.pasos[receta.pasos.length - 1];
  if (ultimo) edges.push(arista(`paso:${ultimo.id}`, 'control'));

  nodes.push(nodo('destino', xControl + ANCHO_PASO + 10, yUltimo, {
    tipo: 'destino',
    titulo: 'Destino',
    subtitulo: nombreDestino(ef.destino),
    detalle: `Siempre como borrador: nada se manda sin OK. ${receta.destino?.formato || ''}`.trim(),
    destino: ef.destino,
    entregable: entregable.id,
  }));
  edges.push(arista('control', 'destino'));

  return { nodes, edges, entregable, receta, modulos: ef.modulos };
}

// Vista general: fuentes → orquestador → entregables → destinos.
export function grafoGeneral({ config, recetas, modulos, estadoFuentes, nombresFuentes = {} }) {
  const entregables = entregablesDe(config, recetas, modulos);
  const fuentes = Object.keys(config?.fuentes || {});
  const nodes = [];
  const edges = [];
  const filas = Math.max(entregables.length, fuentes.length, 1);
  const A = ALTO_FILA_GENERAL;
  const yCentro = centrar(filas, A);
  const desfaseFuentes = centrar(filas, A) - centrar(fuentes.length, A);
  const desfaseEntregables = centrar(filas, A) - centrar(entregables.length, A);

  fuentes.forEach((id, i) => {
    const f = config.fuentes[id];
    const nid = `fuente:${id}`;
    nodes.push(nodo(nid, 0, desfaseFuentes + i * A, {
      tipo: 'fuente',
      fuente: id,
      titulo: nombresFuentes[id] || id,
      subtitulo: f.via === 'mcp' ? (f.servidor || 'conector') : f.via === 'gh' ? 'GitHub CLI' : 'local',
      activo: f.activo,
      ...conexionDe(estadoFuentes, id, config),
    }));
    if (f.activo) edges.push(arista(nid, 'orquestador'));
  });

  const activos = modulosActivos(config, modulos);
  nodes.push(nodo('orquestador', 320, yCentro, {
    tipo: 'orquestador',
    titulo: 'Orquestador',
    subtitulo: `${entregables.filter((e) => e.activo).length} entregables activos`,
    detalle: activos.length ? `Módulos: ${activos.map((m) => m.nombre).join(', ')}` : 'Sin módulos opcionales',
  }));

  entregables.forEach((e, i) => {
    const nid = `entregable:${e.id}`;
    const y = desfaseEntregables + i * A;
    nodes.push(nodo(nid, 640, y, {
      tipo: 'entregable',
      entregable: e.id,
      titulo: e.nombre,
      subtitulo: textoHorario(e.horario),
      activo: e.activo,
      modulo: e.modulo,
      fuentes: e.fuentes,
    }));
    edges.push(arista('orquestador', nid, { data: { activo: e.activo } }));
    const did = `destino:${e.id}`;
    nodes.push(nodo(did, 960, y, {
      tipo: 'destino',
      entregable: e.id,
      titulo: 'Destino',
      subtitulo: nombreDestino(e.destino),
      activo: e.activo,
    }));
    edges.push(arista(nid, did));
  });

  return { nodes, edges, entregables };
}

// Pinta sobre el grafo el estado de una corrida: { [nodoId]: { estado, resultado } }.
export function aplicarCorrida(grafo, estados) {
  if (!estados) return grafo;
  return {
    ...grafo,
    nodes: grafo.nodes.map((n) => (estados[n.id] ? { ...n, data: { ...n.data, corrida: estados[n.id] } } : n)),
  };
}

function firma(data) {
  const { corrida, conexion, detalleConexion, ...resto } = data;
  return JSON.stringify(resto);
}

// Compara el grafo actual con el propuesto: marca nodos agregados, quitados y modificados.
export function diffGrafos(actual, propuesto) {
  const antes = new Map(actual.nodes.map((n) => [n.id, n]));
  const despues = new Map(propuesto.nodes.map((n) => [n.id, n]));
  const resumen = { agregados: [], quitados: [], modificados: [] };
  const nodes = propuesto.nodes.map((n) => {
    const previo = antes.get(n.id);
    let cambio = null;
    if (!previo) cambio = 'agregado';
    else if (firma(previo.data) !== firma(n.data)) cambio = 'modificado';
    if (cambio === 'agregado') resumen.agregados.push(n.data.titulo);
    if (cambio === 'modificado') resumen.modificados.push(n.data.titulo);
    return cambio ? { ...n, data: { ...n.data, cambio } } : n;
  });
  const maxY = Math.max(0, ...propuesto.nodes.map((n) => n.position.y));
  let extra = 0;
  for (const n of actual.nodes) {
    if (despues.has(n.id)) continue;
    resumen.quitados.push(n.data.titulo);
    extra += 1;
    nodes.push({ ...n, position: { x: n.position.x, y: Math.max(n.position.y, maxY + extra * ALTO_FILA) }, data: { ...n.data, cambio: 'quitado' } });
  }
  const aristasAntes = new Set(actual.edges.map((e) => e.id));
  const aristasDespues = new Set(propuesto.edges.map((e) => e.id));
  const edges = [
    ...propuesto.edges.map((e) => (aristasAntes.has(e.id) ? e : { ...e, data: { ...(e.data || {}), cambio: 'agregado' } })),
    ...actual.edges
      .filter((e) => !aristasDespues.has(e.id))
      .map((e) => ({ ...e, data: { ...(e.data || {}), cambio: 'quitado' } })),
  ];
  const hayCambios = resumen.agregados.length + resumen.quitados.length + resumen.modificados.length > 0;
  return { nodes, edges, resumen, hayCambios };
}
