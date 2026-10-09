// Arma los grafos del visualizador a partir de la config y las recetas. Nunca se dibujan a mano.
// Sin dependencias de Node: lo usa la interfaz (React Flow) y se puede testear con node:test.
import { entregablesDe, recetaEfectiva, modulosActivos } from './receta-efectiva.mjs';
import { textoHorario } from './horario.mjs';

// Medidas de los nodos: una sola fuente para el layout (acá) y para el alto que fija Flujo.
// columna y fila son la distancia entre el origen de dos columnas o filas consecutivas.
// En la vista general, la disposición angosta usa nodos más chicos con título en dos líneas.
export const MEDIDAS = {
  entregable: { ancho: 184, alto: 124, columna: 228, fila: 148 },
  general: { ancho: 232, alto: 80, columna: 268, fila: 96 },
  generalAngosta: { ancho: 168, alto: 120, columna: 190, fila: 132 },
  compacto: { ancho: 200, alto: 44, columna: 236, fila: 60 },
};

const VENTANA = {
  dia_habil_anterior: 'Desde el día hábil anterior',
  hoy: 'Lo de hoy',
  ultimos_7_dias: 'Los últimos 7 días',
  desde_ultima_corrida: 'Desde la última vez que corrió',
  evento: 'La reunión que elijas',
};

// Más fuentes que esto se ubican en dos columnas.
const MAX_UNA_COLUMNA = 4;

const ID_AGRUPADAS = 'fuentes-apagadas';

function nodo(id, data) {
  return { id, type: 'nodo', position: { x: 0, y: 0 }, data };
}

// Las manijas (izquierda/arriba de entrada, derecha/abajo de salida) se eligen al disponer.
function arista(origen, destino, extra = {}) {
  return { id: `${origen}->${destino}`, source: origen, target: destino, type: 'smoothstep', ...extra };
}

function plural(n, uno, varios) {
  return `${n} ${n === 1 ? uno : varios}`;
}

function tituloDestino(destino) {
  if (!destino || destino.tipo === 'borrador') return 'Queda como borrador';
  if (destino.tipo === 'slack') return destino.canal ? `Slack · ${destino.canal}` : 'Slack';
  if (destino.tipo === 'doc') return destino.nombre ? `Documento · ${destino.nombre}` : 'Documento';
  if (destino.tipo === 'formulario') return destino.nombre ? `Formulario · ${destino.nombre}` : 'Formulario';
  return destino.nombre || destino.tipo;
}

function conexionDe(estadoFuentes, id, config) {
  const def = config?.fuentes?.[id];
  if (!def) return { conexion: 'desconectada', detalleConexion: 'No está en tu configuración' };
  if (def.activo === false) return { conexion: 'apagada', detalleConexion: 'Apagada en Conectores: no se usa' };
  const e = estadoFuentes?.[id];
  if (!e) return { conexion: 'desconocida', detalleConexion: 'Todavía no se revisó la conexión' };
  return { conexion: e.conectada ? 'conectada' : 'desconectada', detalleConexion: e.detalle || '' };
}

// ---------- Disposición ----------

function medidasDe(armado) {
  if (armado.vista === 'general') return armado.disposicion === 'angosta' ? MEDIDAS.generalAngosta : MEDIDAS.general;
  return armado.compacto ? MEDIDAS.compacto : MEDIDAS.entregable;
}

function ubicar(n, x, y) {
  return { ...n, position: { x, y } };
}

function disponerEntregable(nodes, armado) {
  const m = medidasDe(armado);
  const C = m.columna;
  const F = m.fila;
  const angosta = armado.disposicion === 'angosta';
  const pasos = nodes.filter((n) => n.data.tipo === 'paso');
  const fuentes = nodes.filter((n) => n.data.tipo === 'fuente');
  const nPasos = pasos.length;
  const dosColumnas = !angosta && fuentes.length > MAX_UNA_COLUMNA;
  const filaControl = angosta ? nPasos : Math.max(0, nPasos - 2);
  const xFinal = angosta ? C : 2 * C;
  return nodes.map((n) => {
    switch (n.data.tipo) {
      case 'disparador': return ubicar(n, 0, 0);
      case 'fuente': {
        const i = fuentes.indexOf(n);
        // Con más de 4 fuentes van en dos columnas: la izquierda queda a un paso de distancia y la
        // primera arranca al lado del disparador (que ocupa el primer lugar de la columna derecha).
        if (!dosColumnas) return ubicar(n, 0, (i + 1) * F);
        const k = i + 1;
        return ubicar(n, k % 2 === 1 ? -C : 0, Math.floor(k / 2) * F);
      }
      case 'paso': return ubicar(n, C, pasos.indexOf(n) * F);
      case 'control': return ubicar(n, xFinal, filaControl * F);
      case 'destino': return ubicar(n, xFinal, (filaControl + 1) * F);
      default: return n;
    }
  });
}

function disponerGeneral(nodes, armado) {
  const m = medidasDe(armado);
  const fuentes = nodes.filter((n) => n.data.tipo === 'fuente');
  const entregables = nodes.filter((n) => n.data.tipo === 'entregable');
  const filas = Math.max(fuentes.length, entregables.length, 1);
  const desfase = (n) => ((filas - n) * m.fila) / 2;
  return nodes.map((n) => {
    if (n.data.tipo === 'fuente') return ubicar(n, 0, desfase(fuentes.length) + fuentes.indexOf(n) * m.fila);
    if (n.data.tipo === 'orquestador') return ubicar(n, m.columna, desfase(1));
    if (n.data.tipo === 'entregable') return ubicar(n, 2 * m.columna, desfase(entregables.length) + entregables.indexOf(n) * m.fila);
    return n;
  });
}

// Misma columna: sale por abajo y entra por arriba. Si no, de derecha a izquierda.
function manijas(nodes, edges) {
  const pos = new Map(nodes.map((n) => [n.id, n.position]));
  return edges.map((e) => {
    const a = pos.get(e.source);
    const b = pos.get(e.target);
    const vertical = a && b && a.x === b.x;
    return { ...e, sourceHandle: vertical ? 'abajo' : 'der', targetHandle: vertical ? 'arriba' : 'izq' };
  });
}

function disponer(grafo) {
  const { armado } = grafo;
  const nodes = armado.vista === 'general' ? disponerGeneral(grafo.nodes, armado) : disponerEntregable(grafo.nodes, armado);
  return { ...grafo, nodes, edges: manijas(nodes, grafo.edges) };
}

// Caja que ocupan los nodos: { x, y, ancho, alto }.
export function cajaDe(grafo) {
  const m = grafo.medidas || MEDIDAS.entregable;
  if (!grafo.nodes?.length) return { x: 0, y: 0, ancho: 0, alto: 0 };
  const xs = grafo.nodes.map((n) => n.position.x);
  const ys = grafo.nodes.map((n) => n.position.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, ancho: Math.max(...xs) + m.ancho - x, alto: Math.max(...ys) + m.alto - y };
}

// ---------- Vista por entregable ----------

// disparador → primer paso; cada fuente → el paso que la usa; pasos encadenados; último paso → control → destino.
export function grafoEntregable({ entregableId, config, recetas, modulos, estadoFuentes, nombresFuentes = {}, disposicion = 'ancha', compacto = false }) {
  const armado = { vista: 'entregable', disposicion: disposicion === 'angosta' ? 'angosta' : 'ancha', compacto: Boolean(compacto) };
  const medidas = medidasDe(armado);
  const entregable = entregablesDe(config, recetas, modulos).find((e) => e.id === entregableId);
  if (!entregable) return { nodes: [], edges: [], armado, medidas, error: `No existe el entregable "${entregableId}"` };
  const ef = recetaEfectiva(entregable, config, recetas, modulos);
  if (!ef) return { nodes: [], edges: [], armado, medidas, error: `No existe la receta "${entregable.receta}"` };
  const { receta } = ef;
  const nodes = [];
  const edges = [];

  const disparo = receta.disparador || {};
  nodes.push(nodo('disparador', {
    tipo: 'disparador',
    titulo: textoHorario(ef.horario),
    subtitulo: VENTANA[disparo.ventana] || (disparo.ventana ? disparo.ventana.replaceAll('_', ' ') : ''),
    detalle: disparo.frases?.length ? `También a pedido: "${disparo.frases[0]}"` : '',
    horario: ef.horario,
    entregable: entregable.id,
    activo: entregable.activo,
  }));

  receta.fuentes.forEach((f) => {
    const conexion = conexionDe(estadoFuentes, f.id, config);
    nodes.push(nodo(`fuente:${f.id}`, {
      tipo: 'fuente',
      fuente: f.id,
      titulo: nombresFuentes[f.id] || f.id,
      subtitulo: f.para,
      requerida: Boolean(f.requerida),
      modulo: f.modulo || null,
      entregable: entregable.id,
      ...(conexion.conexion === 'apagada' ? { activo: false } : {}),
      ...conexion,
    }));
  });

  receta.pasos.forEach((p, i) => {
    const id = `paso:${p.id}`;
    nodes.push(nodo(id, {
      tipo: 'paso',
      paso: p.id,
      numero: i + 1,
      titulo: p.nombre,
      subtitulo: p.detalle || '',
      usa: p.usa || [],
      modulo: p.modulo || null,
      entregable: entregable.id,
    }));
  });

  const primero = receta.pasos[0];
  if (primero) edges.push(arista('disparador', `paso:${primero.id}`));
  // Si ningún paso declara la fuente (por ejemplo, una recién sumada), va al paso que ya junta
  // las demás fuentes: el que más usa. Si ninguno usa fuentes, al primero.
  const juntaFuentes = receta.pasos.reduce((mejor, p) => ((p.usa?.length || 0) > (mejor?.usa?.length || 0) ? p : mejor), null);
  const respaldo = juntaFuentes?.usa?.length ? juntaFuentes : primero;
  for (const f of receta.fuentes) {
    const consumidor = receta.pasos.find((p) => p.usa?.includes(f.id)) || respaldo;
    if (consumidor) edges.push(arista(`fuente:${f.id}`, `paso:${consumidor.id}`));
  }
  receta.pasos.forEach((p, i) => {
    if (i > 0) edges.push(arista(`paso:${receta.pasos[i - 1].id}`, `paso:${p.id}`));
  });

  nodes.push(nodo('control', {
    tipo: 'control',
    titulo: 'Control de evidencia',
    subtitulo: 'Si no hay evidencia, no se cuenta',
    reglas: receta.control,
    reglasAprendidas: receta.reglas || [],
    entregable: entregable.id,
  }));
  const ultimo = receta.pasos[receta.pasos.length - 1];
  edges.push(arista(ultimo ? `paso:${ultimo.id}` : 'disparador', 'control'));

  nodes.push(nodo('destino', {
    tipo: 'destino',
    titulo: tituloDestino(ef.destino),
    subtitulo: 'Siempre como borrador: nada se manda sin tu OK',
    detalle: receta.destino?.formato || '',
    destino: ef.destino,
    entregable: entregable.id,
  }));
  edges.push(arista('control', 'destino'));

  return disponer({ nodes, edges, armado, medidas, entregable, receta, modulos: ef.modulos });
}

// ---------- Vista general ----------

// Cada lado del nodo Claude usa un único "bus": todas las aristas bajan por la misma vertical,
// a mitad del hueco entre columnas (así no quedan tramos paralelos a pocos píxeles).
function conBus(edges, m) {
  const izquierdo = (m.ancho + m.columna) / 2;
  const derecho = m.columna + (m.ancho + m.columna) / 2;
  return edges.map((e) => ({
    ...e,
    type: 'bus',
    data: { ...(e.data || {}), bus: e.target === 'orquestador' ? izquierdo : derecho },
  }));
}

// Tres columnas: fuentes en uso (más un nodo con las apagadas) → Claude → entregables.
export function grafoGeneral({ config, recetas, modulos, estadoFuentes, nombresFuentes = {}, disposicion = 'ancha' }) {
  const armado = { vista: 'general', disposicion: disposicion === 'angosta' ? 'angosta' : 'ancha', compacto: false };
  const medidas = medidasDe(armado);
  const entregables = entregablesDe(config, recetas, modulos);
  const todas = Object.keys(config?.fuentes || {});
  const activas = todas.filter((id) => config.fuentes[id]?.activo !== false);
  const apagadas = todas.filter((id) => config.fuentes[id]?.activo === false);
  const nodes = [];
  const edges = [];

  for (const id of activas) {
    const f = config.fuentes[id];
    const nid = `fuente:${id}`;
    nodes.push(nodo(nid, {
      tipo: 'fuente',
      fuente: id,
      titulo: nombresFuentes[id] || id,
      subtitulo: f.via === 'mcp' ? (f.servidor || 'Conector') : f.via === 'gh' ? 'GitHub CLI' : 'En esta compu',
      activo: true,
      ...conexionDe(estadoFuentes, id, config),
    }));
    edges.push(arista(nid, 'orquestador'));
  }
  if (apagadas.length) {
    nodes.push(nodo(ID_AGRUPADAS, {
      tipo: 'fuente',
      titulo: plural(apagadas.length, 'fuente sin usar', 'fuentes sin usar'),
      subtitulo: 'Apagadas en Conectores',
      agrupadas: apagadas.map((id) => ({ id, nombre: nombresFuentes[id] || id })),
      activo: false,
      conexion: 'apagada',
      detalleConexion: 'Apagadas en Conectores: no se usan',
    }));
  }

  const activos = modulosActivos(config, modulos);
  const nActivos = entregables.filter((e) => e.activo).length;
  nodes.push(nodo('orquestador', {
    tipo: 'orquestador',
    titulo: 'Claude',
    subtitulo: plural(nActivos, 'entregable activo', 'entregables activos'),
    detalle: activos.length ? `Módulos: ${activos.map((m) => m.nombre).join(', ')}` : 'Sin módulos opcionales',
  }));

  for (const e of entregables) {
    const nid = `entregable:${e.id}`;
    const horarioTexto = textoHorario(e.horario);
    nodes.push(nodo(nid, {
      tipo: 'entregable',
      entregable: e.id,
      titulo: e.nombre,
      subtitulo: `${horarioTexto} → ${tituloDestino(e.destino)}`,
      horarioTexto,
      destino: e.destino,
      activo: e.activo,
      modulo: e.modulo,
      fuentes: e.fuentes,
    }));
    edges.push(arista('orquestador', nid, { data: { activo: e.activo } }));
  }

  const rotulos = [
    { x: 0, texto: 'Lee de' },
    { x: medidas.columna, texto: 'Claude arma' },
    { x: 2 * medidas.columna, texto: 'Entregables' },
  ];
  return { ...disponer({ nodes, edges: conBus(edges, medidas), armado, medidas }), rotulos, entregables };
}

// ---------- Prueba en curso ----------

// Pinta sobre el grafo el estado de una prueba: { [nodoId]: { estado, resultado } }.
// Con { enCurso: true }, los nodos que todavía no tienen estado quedan "en espera".
export function aplicarCorrida(grafo, estados, { enCurso = false } = {}) {
  if (!estados && !enCurso) return grafo;
  return {
    ...grafo,
    nodes: grafo.nodes.map((n) => {
      const e = estados?.[n.id];
      if (e) return { ...n, data: { ...n.data, corrida: e } };
      if (enCurso && n.id !== ID_AGRUPADAS) return { ...n, data: { ...n.data, corrida: { estado: 'espera' } } };
      return n;
    }),
  };
}

// ---------- Diferencias ----------

function firma(data) {
  const { corrida, conexion, detalleConexion, ...resto } = data;
  return JSON.stringify(resto);
}

// Orden de la unión: lo propuesto, con cada nodo quitado justo después del que lo precedía antes.
function unir(actual, propuesto) {
  const resultado = [...propuesto];
  const ids = () => resultado.map((n) => n.id);
  actual.forEach((n, i) => {
    if (resultado.some((x) => x.id === n.id)) return;
    let indice = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = ids().indexOf(actual[j].id);
      if (k >= 0) { indice = k + 1; break; }
    }
    resultado.splice(indice, 0, n);
  });
  return resultado;
}

// Compara el grafo actual con el propuesto: marca nodos agregados, quitados y modificados.
// El layout se hace de una sola pasada sobre la unión, así lo quitado conserva su lugar.
export function diffGrafos(actual, propuesto) {
  const antes = new Map(actual.nodes.map((n) => [n.id, n]));
  const despues = new Map(propuesto.nodes.map((n) => [n.id, n]));
  const resumen = { agregados: [], quitados: [], modificados: [] };

  const marcados = propuesto.nodes.map((n) => {
    if (n.id === ID_AGRUPADAS) return n;
    const previo = antes.get(n.id);
    let cambio = null;
    if (!previo) cambio = 'agregado';
    else if (firma(previo.data) !== firma(n.data)) cambio = 'modificado';
    if (cambio === 'agregado') resumen.agregados.push(n.data.titulo);
    if (cambio === 'modificado') resumen.modificados.push(n.data.titulo);
    return cambio ? { ...n, data: { ...n.data, cambio } } : n;
  });
  const quitados = actual.nodes
    .filter((n) => !despues.has(n.id) && n.id !== ID_AGRUPADAS)
    .map((n) => {
      resumen.quitados.push(n.data.titulo);
      return { ...n, data: { ...n.data, cambio: 'quitado' } };
    });
  const quitadosPorId = new Map(quitados.map((n) => [n.id, n]));
  const nodes = unir(actual.nodes.map((n) => quitadosPorId.get(n.id) || n), marcados)
    .filter((n) => despues.has(n.id) || quitadosPorId.has(n.id));
  const enUnion = new Set(nodes.map((n) => n.id));

  const aristasAntes = new Set(actual.edges.map((e) => e.id));
  const aristasDespues = new Set(propuesto.edges.map((e) => e.id));
  const edges = [
    ...propuesto.edges.map((e) => (aristasAntes.has(e.id) ? e : { ...e, data: { ...(e.data || {}), cambio: 'agregado' } })),
    ...actual.edges
      .filter((e) => !aristasDespues.has(e.id) && enUnion.has(e.source) && enUnion.has(e.target))
      .map((e) => ({ ...e, data: { ...(e.data || {}), cambio: 'quitado' } })),
  ];
  const hayCambios = resumen.agregados.length + resumen.quitados.length + resumen.modificados.length > 0;
  const armado = propuesto.armado || actual.armado;
  const base = { ...propuesto, nodes, edges, resumen, hayCambios };
  return armado ? disponer({ ...base, armado }) : base;
}
