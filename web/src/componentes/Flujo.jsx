// Mapa del flujo (React Flow). El grafo llega armado desde lib/grafo.mjs: acá solo se dibuja,
// se encuadra y se hace usable con teclado y lector de pantalla.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BaseEdge,
  MarkerType,
  getSmoothStepPath,
  Handle,
  Position,
  ViewportPortal,
  useReactFlow,
  useStore,
} from '@xyflow/react';
import { MEDIDAS, cajaDe } from '@lib/grafo.mjs';
import { TIPO_NODO, TEXTO_CONEXION, ESTADO_NODO, destinoHumano, plural, fecha } from '../textos.js';
import {
  Icono,
  ICONO_TIPO,
  ICONO_FUENTE,
  ICONO_ESTADO,
  ICONO_CONEXION,
  CircleMinus,
  ZoomIn,
  ZoomOut,
  Maximize,
} from './Iconos.jsx';
import Boton from './Boton.jsx';

const TEXTO_CAMBIO = { agregado: '+ Nuevo', quitado: '− Se quita', modificado: '~ Cambia' };
const CAMBIO_LEIDO = { agregado: 'se suma con este cambio', quitado: 'se quita con este cambio', modificado: 'cambia con este cambio' };

// Alto máximo del lienzo según la vista. En la vista previa de un cambio el lienzo puede crecer más
// (la fila de una fuente nueva suma alto) para que la escala no baje de ~0,8.
const ALTO_MAXIMO = { ancha: 720, angosta: 800, general: 680, mini: 420, diff: 800 };
const ALTO_MINIMO = 320;
const MARGEN = 1.08;
const ALTO_ROTULOS = 32;
// En la vista previa de un cambio el zoom no baja de acá (con títulos de 15 px quedan en 12 px):
// si no entra todo el flujo, se encuadra lo que cambia con sus vecinos, o solo lo que cambia.
const ZOOM_MINIMO_DIFF = 0.8;
// «Ver todo el flujo» sí puede alejar más, porque lo pide la persona.
const ZOOM_MINIMO_TODO = 0.3;

const ARIA = {
  'node.a11yDescription.default': 'Enter para ver el detalle',
  'node.a11yDescription.keyboardDisabled': 'Enter para ver el detalle',
  'node.a11yDescription.ariaLiveMessage': ({ x, y }) => `El paso quedó en la posición ${Math.round(x)}, ${Math.round(y)}`,
  'edge.a11yDescription.default': 'Conexión entre pasos',
  'minimap.ariaLabel': 'Vista en miniatura',
  'handle.ariaLabel': 'Punto de conexión',
};

function movimientoReducido() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function tipoVisible(d) {
  if (d.tipo === 'paso' && d.numero) return `${TIPO_NODO.paso} ${d.numero}`;
  return TIPO_NODO[d.tipo] || d.tipo;
}

function iconoDe(d) {
  if (d.agrupadas) return CircleMinus;
  if (d.tipo === 'fuente' && ICONO_FUENTE[d.fuente]) return ICONO_FUENTE[d.fuente];
  return ICONO_TIPO[d.tipo];
}

function tituloVisible(d) {
  if (d.tipo === 'destino') return destinoHumano(d.destino).titulo;
  return d.titulo;
}

function totalReglas(d) {
  return (d.reglas?.length || 0) + (d.reglasAprendidas?.length || 0);
}

function apagado(d) {
  return d.activo === false || d.conexion === 'apagada';
}

// Texto de la fila de estado: con ícono y palabra, nunca solo color.
function estadoDe(d) {
  const c = d.corrida;
  if (!c) return { clave: 'sin_probar', texto: ESTADO_NODO.sin_probar };
  const base = ESTADO_NODO[c.estado] || c.estado;
  if (d.tipo === 'destino' && c.estado === 'ok') return { clave: 'ok', texto: `${base} · Borrador sin enviar` };
  if (d.tipo === 'disparador' && c.resultado) {
    const limpio = c.resultado.replace(/^Probar ahora · /, '').replace(/\d{4}-\d{2}-\d{2}/g, (x) => fecha(x).replace(/ \d{4}$/, ''));
    return { clave: c.estado, texto: `${base} · ${limpio}` };
  }
  const texto = c.resultado && !['espera'].includes(c.estado) ? `${base} · ${c.resultado}` : base;
  return { clave: c.estado, texto };
}

// Lo que lee un lector de pantalla al llegar al nodo.
function etiquetaNodo(d) {
  const partes = [`${tipoVisible(d)}: ${tituloVisible(d)}`];
  if (d.conexion && d.tipo === 'fuente') partes.push(TEXTO_CONEXION[d.conexion] || d.conexion);
  if (d.corrida) partes.push(estadoDe(d).texto);
  if (d.cambio) partes.push(CAMBIO_LEIDO[d.cambio]);
  if (apagado(d) && d.tipo !== 'fuente') partes.push('apagado');
  return partes.join('. ');
}

function ChipCambio({ cambio }) {
  if (!cambio) return null;
  return <span className={`nodo-chip-cambio chip-cambio-${cambio}`}>{TEXTO_CAMBIO[cambio]}</span>;
}

function Conexion({ conexion, conTexto }) {
  if (!conexion) return null;
  return (
    <span className={`nodo-conexion conexion-${conexion}`} title={TEXTO_CONEXION[conexion]}>
      <Icono de={ICONO_CONEXION[conexion]} tam={14} />
      {conTexto && <span>{TEXTO_CONEXION[conexion]}</span>}
    </span>
  );
}

// Con el resultado de una prueba, la fila de estado puede usar dos líneas (y la bajada se esconde).
function conResultado(d) {
  return Boolean(d.corrida && d.corrida.resultado && d.corrida.estado !== 'espera');
}

function FilaEstado({ d }) {
  const e = estadoDe(d);
  const icono = ICONO_ESTADO[e.clave];
  return (
    <div className={`nodo-estado estado-${e.clave}${conResultado(d) ? ' dos-lineas' : ''}`} title={e.texto}>
      {icono && <Icono de={icono} tam={14} className={e.clave === 'en_curso' ? 'icono-gira' : undefined} />}
      <span>{e.texto}</span>
    </div>
  );
}

function clasesNodo(d, forma) {
  return [
    'nodo',
    `nodo-${forma}`,
    `nodo-${d.tipo}`,
    apagado(d) ? 'apagado' : '',
    d.corrida ? `corrida-${d.corrida.estado}` : '',
    d.cambio ? `cambio-${d.cambio}` : '',
  ].filter(Boolean).join(' ');
}

// Las manijas van fuera del .nodo: así no cuentan en su alto (sin desbordes).
function ConManijas({ children }) {
  return (
    <>
      <Handle type="target" id="izq" position={Position.Left} isConnectable={false} />
      <Handle type="target" id="arriba" position={Position.Top} isConnectable={false} />
      {children}
      <Handle type="source" id="der" position={Position.Right} isConnectable={false} />
      <Handle type="source" id="abajo" position={Position.Bottom} isConnectable={false} />
    </>
  );
}

function NodoFlujo({ data: d, selected }) {
  const forma = d.forma || 'entregable';
  const clases = `${clasesNodo(d, forma)}${selected ? ' seleccionado' : ''}`;
  const titulo = tituloVisible(d);
  const icono = iconoDe(d);

  if (forma === 'compacto') {
    return (
      <ConManijas>
        <div className={clases} title={titulo}>
          <ChipCambio cambio={d.cambio} />
          <div className="nodo-fila">
            <Icono de={icono} />
            <span className="nodo-titulo"><span className="nodo-titulo-texto">{titulo}</span></span>
          </div>
        </div>
      </ConManijas>
    );
  }

  if (forma === 'general') {
    let segunda;
    if (d.tipo === 'fuente' && !d.agrupadas) segunda = <Conexion conexion={d.conexion} conTexto />;
    else if (d.tipo === 'entregable') {
      const texto = `${d.activo === false ? 'Apagado · ' : ''}${d.horarioTexto} → ${destinoHumano(d.destino).titulo}`;
      segunda = <span title={texto}>{texto}</span>;
    } else segunda = <span title={d.detalle || d.subtitulo}>{d.subtitulo}</span>;
    return (
      <ConManijas>
        <div className={`${clases}${d.angosta ? ' nodo-general-angosta' : ''}`} title={d.agrupadas ? d.agrupadas.map((x) => x.nombre).join(', ') : titulo}>
          <ChipCambio cambio={d.cambio} />
          <div className="nodo-fila nodo-fila-titulo">
            <Icono de={icono} />
            <span className="nodo-titulo"><span className="nodo-titulo-texto">{titulo}</span></span>
          </div>
          <div className="nodo-fila nodo-sub">{segunda}</div>
        </div>
      </ConManijas>
    );
  }

  const noConectada = d.tipo === 'fuente' && d.conexion && d.conexion !== 'conectada';
  const reglas = d.tipo === 'control' ? totalReglas(d) : 0;
  const resultado = conResultado(d);
  return (
    <ConManijas>
      <div className={clases}>
        <ChipCambio cambio={d.cambio} />
        <div className="nodo-cabecera">
          <span className="nodo-tipo">
            <Icono de={icono} />
            {tipoVisible(d)}
          </span>
          {d.tipo === 'fuente' && <Conexion conexion={d.conexion} />}
          {d.tipo === 'paso' && d.modulo && <span className="nodo-chip">Módulo</span>}
        </div>
        <div className="nodo-titulo dos-lineas" title={titulo}><span className="nodo-titulo-texto">{titulo}</span></div>
        {resultado ? null : noConectada ? (
          <div className={`nodo-sub una-linea conexion-${d.conexion}`} title={d.detalleConexion || ''}>
            <Icono de={ICONO_CONEXION[d.conexion]} tam={14} />
            <span>{TEXTO_CONEXION[d.conexion]}</span>
          </div>
        ) : (
          d.subtitulo && <div className="nodo-sub una-linea" title={[d.subtitulo, d.detalle].filter(Boolean).join(' · ')}>{d.subtitulo}</div>
        )}
        <div className="nodo-pie">
          <FilaEstado d={d} />
          {reglas > 0 && !resultado && <span className="nodo-chip" title={`${reglas} ${plural(reglas, 'regla', 'reglas')} del control`}>{reglas} {plural(reglas, 'regla', 'reglas')}</span>}
        </div>
      </div>
    </ConManijas>
  );
}

const TIPOS = { nodo: NodoFlujo };

// Arista de la vista general: baja por la vertical común de su lado (data.bus), así todas coinciden.
function AristaBus({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data }) {
  const [ruta] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
    centerX: typeof data?.bus === 'number' ? data.bus : undefined,
    // El hueco entre columnas es chico: con el desvío de 20 px de siempre, las puntas se cruzan
    // con el bus y aparecen escalones.
    offset: 8,
    borderRadius: 6,
  });
  return <BaseEdge id={id} path={ruta} markerEnd={markerEnd} style={style} />;
}

const TIPOS_ARISTA = { bus: AristaBus };

function medidasDe(grafo) {
  return grafo.medidas || MEDIDAS.entregable;
}

// Caja del contenido, contando la franja de los rótulos de columna.
function cajaContenido(grafo) {
  const caja = cajaDe({ nodes: grafo.nodes, medidas: medidasDe(grafo) });
  if (grafo.rotulos?.length) return { ...caja, y: caja.y - ALTO_ROTULOS, alto: caja.alto + ALTO_ROTULOS };
  return caja;
}

function claveAlto(grafo, variante) {
  if (variante === 'mini') return 'mini';
  if (grafo.resumen) return 'diff';
  if (grafo.armado?.vista === 'general') return 'general';
  return grafo.armado?.disposicion === 'angosta' ? 'angosta' : 'ancha';
}

function Leyenda() {
  return (
    <p className="leyenda-diff">
      <span className="leyenda-agregado">Borde verde: se suma</span>
      <span aria-hidden="true"> · </span>
      <span className="leyenda-modificado">Resaltado: cambia</span>
      <span aria-hidden="true"> · </span>
      <span className="leyenda-quitado">Tachado: se quita</span>
    </p>
  );
}

// Controles del mapa en su propia barra, fuera del área de los nodos: nunca tapan nada.
function Controles({ onEncuadrar }) {
  const rf = useReactFlow();
  const dur = () => (movimientoReducido() ? 0 : 150);
  return (
    <div className="lienzo-controles" role="group" aria-label="Controles del mapa">
      <Boton chico soloIcono icono={ZoomOut} onClick={() => rf.zoomOut({ duration: dur() })}>Alejar</Boton>
      <Boton chico soloIcono icono={ZoomIn} onClick={() => rf.zoomIn({ duration: dur() })}>Acercar</Boton>
      <Boton chico soloIcono icono={Maximize} onClick={() => onEncuadrar(200, { todo: true })}>Ver todo el flujo</Boton>
    </div>
  );
}

function FlujoInterno({ grafo, onNodo, variante = 'normal', seleccionado, etiqueta, children }) {
  const mini = variante === 'mini';
  const contenedor = useRef(null);
  const mapa = useRef(null);
  // ancho: el del mapa (se achica cuando el panel del nodo va al costado); anchoLienzo: el del
  // lienzo entero, del que sale el alto (así abrir el panel no cambia el alto del mapa).
  const [ancho, setAncho] = useState(0);
  const [anchoLienzo, setAnchoLienzo] = useState(0);
  const rf = useReactFlow();
  // Los nodos llegan con ancho y alto fijos, así que para encuadrar alcanza con que el mapa tenga
  // tamaño: no se espera a que React Flow vuelva a medir cada nodo (eso se repite en cada paso de
  // una prueba y podía dejar sin encuadrar la vista previa de un cambio).
  const inicializado = useStore((st) => Boolean(st.panZoom) && st.width > 0 && st.height > 0);
  const medidas = medidasDe(grafo);
  const forma = grafo.armado?.vista === 'general' ? 'general' : grafo.armado?.compacto ? 'compacto' : 'entregable';
  const angosta = grafo.armado?.disposicion === 'angosta';
  const diff = Boolean(grafo.resumen);

  useLayoutEffect(() => {
    const el = mapa.current;
    const lienzo = contenedor.current;
    if (!el || !lienzo) return undefined;
    setAncho(el.clientWidth);
    setAnchoLienzo(lienzo.clientWidth);
    const obs = new ResizeObserver((entradas) => {
      for (const e of entradas) {
        if (e.target === el) setAncho(Math.round(e.contentRect.width));
        else setAnchoLienzo(Math.round(e.contentRect.width));
      }
    });
    obs.observe(el);
    obs.observe(lienzo);
    return () => obs.disconnect();
  }, []);

  const caja = useMemo(() => cajaContenido(grafo), [grafo]);
  const alto = useMemo(() => {
    const maximo = ALTO_MAXIMO[claveAlto(grafo, variante)];
    const base = anchoLienzo;
    if (!base || !caja.ancho) return Math.min(maximo, Math.max(ALTO_MINIMO, caja.alto * MARGEN));
    const z = Math.min(1, base / (caja.ancho * MARGEN));
    return Math.round(Math.min(maximo, Math.max(mini ? 160 : ALTO_MINIMO, caja.alto * MARGEN * z)));
  }, [anchoLienzo, caja, grafo, variante, mini]);

  const porId = useMemo(() => new Map(grafo.nodes.map((n) => [n.id, n])), [grafo]);

  const nodos = useMemo(() => grafo.nodes.map((n) => ({
    ...n,
    width: medidas.ancho,
    height: medidas.alto,
    selected: !mini && n.id === seleccionado,
    selectable: !mini,
    focusable: !mini,
    ariaLabel: etiquetaNodo(n.data),
    ariaRole: onNodo && !mini ? 'button' : 'group',
    domAttributes: onNodo && !mini
      ? {
        'aria-roledescription': 'paso del flujo',
        'aria-expanded': n.id === seleccionado ? 'true' : 'false',
        ...(n.id === seleccionado ? { 'aria-controls': 'panel-nodo' } : {}),
      }
      : { 'aria-roledescription': 'paso del flujo' },
    className: diff ? (n.data.cambio ? 'con-cambio' : 'sin-cambio') : undefined,
    data: { ...n.data, forma, angosta },
  })), [grafo, medidas, seleccionado, mini, onNodo, forma, angosta, diff]);

  const aristas = useMemo(() => grafo.edges.map((e) => {
    const destino = porId.get(e.target);
    const origen = porId.get(e.source);
    const activa = destino?.data?.corrida?.estado === 'en_curso';
    const recorrida = origen?.data?.corrida?.estado === 'ok' && ['ok', 'en_curso'].includes(destino?.data?.corrida?.estado);
    const apagada = apagado(origen?.data || {}) || apagado(destino?.data || {}) || e.data?.activo === false;
    const color = activa ? 'var(--acento)' : recorrida ? 'var(--exito)' : 'var(--arista, #6F7A76)';
    return {
      ...e,
      type: e.type === 'bus' ? 'bus' : e.type || 'smoothstep',
      animated: false,
      focusable: false,
      selectable: false,
      ariaLabel: null,
      domAttributes: { 'aria-hidden': 'true' },
      className: [
        e.data?.cambio ? `arista-${e.data.cambio}` : '',
        activa ? 'arista-activa' : '',
        recorrida ? 'arista-recorrida' : '',
        apagada ? 'arista-apagada' : '',
        e.data?.cambio || !diff ? '' : 'arista-sin-cambio',
      ].filter(Boolean).join(' '),
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color },
    };
  }), [grafo, porId, diff]);

  // Encuadre: entra todo con zoom entre 0,75 y 1; si no entra, se ancla arriba a la izquierda.
  // En la vista previa de un cambio se usa la parte del lienzo que se ve en pantalla: entra todo el
  // flujo si se puede (zoom >= 0,45); si no, lo que cambia con sus vecinos; y si no, solo lo que cambia.
  const seleccionActual = useRef(seleccionado);
  seleccionActual.current = seleccionado;
  const encuadrar = useCallback((duracion = 0, { todo = false } = {}) => {
    const el = mapa.current;
    if (!el || !caja.ancho) return;
    const W = el.clientWidth;
    const H = el.clientHeight;
    const dur = movimientoReducido() ? 0 : duracion;
    // Si hay un nodo abierto y el encuadre lo deja afuera, se centra en él con el mismo zoom.
    const aplicar = (v) => {
      const n = seleccionActual.current && porId.get(seleccionActual.current);
      if (n && !todo) {
        const x0 = n.position.x * v.zoom + v.x;
        const y0 = n.position.y * v.zoom + v.y;
        const fuera = x0 < 0 || y0 < 0 || x0 + medidas.ancho * v.zoom > W || y0 + medidas.alto * v.zoom > H;
        if (fuera) {
          rf.setCenter(n.position.x + medidas.ancho / 2, n.position.y + medidas.alto / 2, { zoom: v.zoom, duration: dur });
          return;
        }
      }
      rf.setViewport(v, { duration: dur });
    };
    const ajusteDe = (obj, altoUtil) => Math.min(W / (obj.ancho * MARGEN), altoUtil / (obj.alto * MARGEN));
    const ajustar = (obj, altoUtil, arriba, minimo) => {
      const z = Math.max(minimo, Math.min(1, ajusteDe(obj, altoUtil)));
      const entraAncho = obj.ancho * z <= W;
      const entraAlto = obj.alto * z <= altoUtil;
      const x = entraAncho ? (W - obj.ancho * z) / 2 - obj.x * z : 12 - obj.x * z;
      const y = entraAlto ? arriba + (altoUtil - obj.alto * z) / 2 - obj.y * z : arriba + 12 - obj.y * z;
      return { x, y, zoom: z };
    };
    const cambiados = diff ? grafo.nodes.filter((n) => n.data.cambio) : [];
    if (!cambiados.length) {
      aplicar(ajustar(caja, H, 0, mini || todo ? ZOOM_MINIMO_TODO : 0.75));
      return;
    }
    const r = el.getBoundingClientRect();
    const arribaPantalla = Math.max(r.top, 0);
    const abajoPantalla = Math.min(r.bottom, window.innerHeight);
    const visible = abajoPantalla - arribaPantalla >= 200
      ? { arriba: arribaPantalla - r.top, alto: abajoPantalla - arribaPantalla }
      : { arriba: 0, alto: H };
    const ids = new Set(cambiados.map((n) => n.id));
    for (const e of grafo.edges) {
      if (ids.has(e.source) || ids.has(e.target)) {
        ids.add(e.source);
        ids.add(e.target);
      }
    }
    const conChip = (c) => ({ ...c, y: c.y - 12, alto: c.alto + 12 });
    const vecinos = conChip(cajaDe({ nodes: grafo.nodes.filter((n) => ids.has(n.id)), medidas }));
    const soloCambios = conChip(cajaDe({ nodes: cambiados, medidas }));
    if (todo) {
      aplicar(ajustar(caja, H, 0, ZOOM_MINIMO_TODO));
      return;
    }
    let objetivo = soloCambios;
    if (ajusteDe(caja, visible.alto) >= ZOOM_MINIMO_DIFF) objetivo = caja;
    else if (ajusteDe(vecinos, visible.alto) >= ZOOM_MINIMO_DIFF) objetivo = vecinos;
    aplicar(ajustar(objetivo, visible.alto, visible.arriba, ZOOM_MINIMO_DIFF));
  }, [rf, caja, grafo, mini, medidas, diff, porId]);

  // La firma del layout: si cambian los nodos o sus posiciones, se reencuadra.
  const firmaLayout = useMemo(
    () => grafo.nodes.map((n) => `${n.id}@${n.position.x},${n.position.y}${n.data.cambio ? `~${n.data.cambio}` : ''}`).join('|'),
    [grafo],
  );
  // Se encuadra la primera vez que el mapa está listo, cada vez que cambia el layout y cada vez
  // que cambia el tamaño del lienzo (por ejemplo, al abrir u ocultar el chat). No se reencuadra
  // cuando React Flow vuelve a medir un nodo (por ejemplo, al seleccionarlo). El encuadre va en el
  // cuadro siguiente, cuando el alto nuevo del lienzo ya está aplicado.
  const ultimo = useRef(null);
  const encuadrarActual = useRef(encuadrar);
  encuadrarActual.current = encuadrar;
  useEffect(() => {
    if (!inicializado || !ancho) return;
    const previo = ultimo.current;
    if (previo && previo.firma === firmaLayout && Math.abs(previo.ancho - ancho) <= 2 && previo.alto === alto) return;
    ultimo.current = { firma: firmaLayout, ancho, alto };
    const duracion = !previo ? 0 : previo.firma !== firmaLayout ? 300 : 200;
    requestAnimationFrame(() => encuadrarActual.current(duracion));
  }, [inicializado, firmaLayout, ancho, alto]);

  // Al abrir o cerrar el panel, el mapa cambia de ancho y se reencuadra solo (efecto de arriba).
  // Si el ancho no cambia (panel abajo, en el lienzo angosto), igual se asegura que el nodo se vea.
  const seleccionPrevia = useRef(seleccionado);
  useEffect(() => {
    if (mini || !inicializado) return;
    const antes = seleccionPrevia.current;
    seleccionPrevia.current = seleccionado;
    if (antes === seleccionado) return;
    requestAnimationFrame(() => encuadrarActual.current(200));
  }, [seleccionado, inicializado]); // eslint-disable-line react-hooks/exhaustive-deps

  const alTeclear = (e) => {
    if (!onNodo || mini) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const nodoEl = e.target.closest?.('.react-flow__node');
    if (!nodoEl || nodoEl !== e.target) return;
    const n = porId.get(nodoEl.dataset.id);
    if (!n) return;
    e.preventDefault();
    e.stopPropagation();
    onNodo(n);
  };

  const yRotulo = caja.y + 4;
  const etiquetaRegion = etiqueta || (grafo.armado?.vista === 'general' ? 'Mapa general' : `Flujo de ${grafo.entregable?.nombre || 'este entregable'}`);

  return (
    <div
      ref={contenedor}
      className={`lienzo${mini ? ' lienzo-mini' : ''}${diff ? ' modo-diff' : ''}`}
      role="region"
      aria-label={etiquetaRegion}
      onKeyDown={alTeclear}
    >
      {diff && !mini && (
        <div className="lienzo-barra lienzo-barra-arriba">
          <Leyenda />
        </div>
      )}
      <div className={`lienzo-area${children ? ' con-panel' : ''}`}>
      <div ref={mapa} className="lienzo-mapa" style={{ height: alto }}>
        <ReactFlow
          nodes={nodos}
          edges={aristas}
          nodeTypes={TIPOS}
          edgeTypes={TIPOS_ARISTA}
          onNodeClick={mini ? undefined : (_, n) => onNodo?.(porId.get(n.id) || n)}
          onPaneClick={() => seleccionado && onNodo?.(null)}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={!mini}
          edgesFocusable={false}
          elementsSelectable={!mini}
          zoomOnScroll={false}
          panOnScroll={false}
          preventScrolling={false}
          zoomOnDoubleClick={false}
          panOnDrag={!mini}
          zoomOnPinch={!mini}
          minZoom={0.3}
          maxZoom={1.5}
          ariaLabelConfig={ARIA}
          aria-label={etiquetaRegion}
        >
          <Background gap={24} size={1} color="var(--borde)" />
          {grafo.rotulos?.length > 0 && (
            <ViewportPortal>
              {grafo.rotulos.map((r) => (
                <div key={r.texto} className="rotulo-columna" style={{ transform: `translate(${r.x}px, ${yRotulo}px)` }}>{r.texto}</div>
              ))}
            </ViewportPortal>
          )}
        </ReactFlow>
      </div>
      {children && <div className="lienzo-lado">{children}</div>}
      </div>
      {!mini && (
        <div className="lienzo-barra">
          <Controles onEncuadrar={encuadrar} />
        </div>
      )}
    </div>
  );
}

// <Flujo grafo onNodo? clave variante='normal'|'mini' seleccionado? etiqueta children? />
// La prop "alto" ya no se usa: el alto sale del contenido y del ancho disponible.
export default function Flujo({ clave, alto: _alto, ...props }) {
  return (
    <ReactFlowProvider key={clave}>
      <FlujoInterno {...props} />
    </ReactFlowProvider>
  );
}
