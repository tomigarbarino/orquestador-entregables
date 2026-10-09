import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useApp, useAccion } from '../estado.jsx';
import { api } from '../api.js';
import { grafoGeneral, grafoEntregable, aplicarCorrida, diffGrafos } from '@lib/grafo.mjs';
import { entregablesDe } from '@lib/receta-efectiva.mjs';
import { nombreEntregable, duracionEstimada, rutaHumana } from '../textos.js';
import Flujo from '../componentes/Flujo.jsx';
import Semana from '../componentes/Semana.jsx';
import PanelNodo from '../componentes/PanelNodo.jsx';
import Salida from '../componentes/Salida.jsx';
import Diferencias, { ResumenCambios, entregableAfectado } from '../componentes/Diferencias.jsx';
import Boton from '../componentes/Boton.jsx';
import Vacio from '../componentes/Vacio.jsx';
import PrimerosPasos, { primerosPasosVisibles } from '../componentes/PrimerosPasos.jsx';
import AvisosEntregable from '../componentes/AvisosEntregable.jsx';
import { Icono, Highlighter, LoaderCircle, Play, CircleCheck, TriangleAlert, Workflow, ChevronDown } from '../componentes/Iconos.jsx';

// Ancho del lienzo por debajo del cual el flujo pasa a dos columnas.
const ANCHO_ANGOSTO = 640;

export default function Visualizador() {
  const { s, acciones } = useApp();
  const [vistaPropuesta, setVistaPropuesta] = useState(null);
  const [verTexto, setVerTexto] = useState(false);
  const [recienAplicada, setRecienAplicada] = useState(null);
  const [anchoLienzo, setAnchoLienzo] = useState(0);
  const cuerpo = useRef(null);
  const bannerPropuesta = useRef(null);

  const entregables = useMemo(() => entregablesDe(s.config, s.recetas, s.modulos), [s.config, s.recetas, s.modulos]);
  const nombresFuentes = useMemo(() => Object.fromEntries(Object.entries(s.catalogo?.fuentes || {}).map(([id, f]) => [id, f.nombre])), [s.catalogo]);
  const vista = s.ui.vista;
  const eid = s.ui.entregable || entregables[0]?.id;
  const nombre = nombreEntregable(s, eid);
  const idCorrida = eid ? s.ui.corridaPorEntregable[eid] : null;
  const corrida = idCorrida ? s.corridas[idCorrida] : null;
  const corriendo = corrida?.meta?.estado === 'en_curso';
  const iniciando = Boolean(eid && s.ui.iniciando?.[eid]);
  const disposicion = anchoLienzo && anchoLienzo < ANCHO_ANGOSTO ? 'angosta' : 'ancha';

  useLayoutEffect(() => {
    const el = cuerpo.current;
    if (!el) return undefined;
    setAnchoLienzo(el.clientWidth);
    const obs = new ResizeObserver(([e]) => setAnchoLienzo(Math.round(e.contentRect.width)));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (idCorrida && !s.corridas[idCorrida]) acciones.cargarCorrida(idCorrida);
  }, [idCorrida]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cuando la prueba que se estaba mirando termina con el borrador listo, el mapa queda a la vista
  // con sus resultados y un aviso arriba lleva a la hoja (sin mover la página ni el foco solo). Si se
  // ven los Primeros pasos, el aviso no hace falta: ellos ya ofrecen «Ver el borrador».
  const [recienLista, setRecienLista] = useState(null);
  const estadoCorrida = corrida?.meta?.estado;
  const previoCorrida = useRef({ id: idCorrida, estado: estadoCorrida });
  useEffect(() => {
    const previo = previoCorrida.current;
    previoCorrida.current = { id: idCorrida, estado: estadoCorrida };
    if (previo.id === idCorrida && previo.estado === 'en_curso' && estadoCorrida === 'lista') setRecienLista(idCorrida);
    else if (recienLista && recienLista !== idCorrida) setRecienLista(null);
  }, [idCorrida, estadoCorrida]); // eslint-disable-line react-hooks/exhaustive-deps
  const verBorrador = () => {
    const hoja = document.querySelector('.visualizador .borrador');
    if (!hoja) return;
    const reducido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    hoja.scrollIntoView({ block: 'start', behavior: reducido ? 'auto' : 'smooth' });
    hoja.focus({ preventScroll: true });
  };

  const enFoco = s.ui.propuestaEnFoco;
  useEffect(() => {
    setVerTexto(false);
    if (!enFoco) {
      setVistaPropuesta(null);
      return;
    }
    let vigente = true;
    api(`/propuestas/${enFoco}/vista`).then((v) => {
      if (!vigente) return;
      setVistaPropuesta(v);
      const afectado = entregableAfectado(v, s);
      // El panel de un nodo se cierra: la diferencia tiene que quedar a la vista.
      if (afectado && (s.ui.vista !== 'entregable' || s.ui.entregable !== afectado)) acciones.ui({ vista: 'entregable', entregable: afectado, nodo: null });
      else if (s.ui.nodo) acciones.ui({ nodo: null });
    }).catch((e) => acciones.avisar(e.message));
    return () => {
      vigente = false;
    };
  }, [enFoco]); // eslint-disable-line react-hooks/exhaustive-deps

  const propuesta = vistaPropuesta?.propuesta;
  const conPropuesta = Boolean(vistaPropuesta?.config && propuesta);

  const grafo = useMemo(() => {
    const parametros = { config: s.config, recetas: s.recetas, modulos: s.modulos, estadoFuentes: s.fuentes, nombresFuentes };
    const armar = (p) => (vista === 'general' ? grafoGeneral({ ...p, disposicion }) : grafoEntregable({ ...p, entregableId: eid, disposicion }));
    const actual = armar(parametros);
    if (conPropuesta) {
      return diffGrafos(actual, armar({ ...parametros, config: vistaPropuesta.config, recetas: vistaPropuesta.recetas }));
    }
    if (vista === 'entregable' && corrida) return aplicarCorrida(actual, corrida.nodos, { enCurso: corriendo });
    return actual;
  }, [s.config, s.recetas, s.modulos, s.fuentes, nombresFuentes, vista, eid, disposicion, conPropuesta, vistaPropuesta, corrida, corriendo]);

  const resumen = conPropuesta ? grafo.resumen : null;

  // Cuando llega una propuesta, el banner y el mapa con la diferencia quedan a la vista. Va antes de
  // pintar (y sin animación) para que el mapa encuadre el cambio en la parte que se ve.
  const idPropuesta = conPropuesta ? propuesta.id : null;
  useLayoutEffect(() => {
    const banner = bannerPropuesta.current;
    const principal = banner?.closest('.principal');
    if (!idPropuesta || !banner || !principal) return;
    // Solo se desplaza .principal (scrollIntoView movería también la ventana).
    principal.scrollTop += banner.getBoundingClientRect().top - principal.getBoundingClientRect().top - 16;
  }, [idPropuesta]);
  const enCursoNodos = corriendo
    ? Object.entries(corrida.nodos || {}).filter(([, v]) => v.estado === 'en_curso').map(([k]) => grafo.nodes.find((n) => n.id === k)?.data?.titulo).filter(Boolean)
    : [];
  const destino = grafo.nodes?.find((n) => n.id === 'destino')?.data?.destino || entregables.find((e) => e.id === eid)?.destino;

  // Las acciones del banner lo hacen desaparecer: el foco va a «Probar ahora» (el paso siguiente)
  // o, si no está, al título de la página. Nunca queda en <body>.
  const enfocarDespues = (preferirProbar) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const probarBoton = preferirProbar && document.querySelector('.visualizador .cabecera .boton.primario:not([aria-disabled="true"])');
      if (probarBoton) probarBoton.focus();
      else acciones.enfocarTitulo();
    }));
  };
  const [aplicar, aplicando] = useAccion(async () => {
    if (await acciones.aplicarPropuesta(propuesta.id)) {
      setRecienAplicada(eid);
      enfocarDespues(true);
    }
  });
  const dejarParaDespues = () => {
    acciones.ui({ propuestaEnFoco: null });
    enfocarDespues(false);
  };
  const descartar = async () => {
    if (await acciones.descartarPropuesta(propuesta.id)) enfocarDespues(false);
  };

  const probar = () => {
    setRecienAplicada(null);
    acciones.probar(eid);
  };

  let motivoProbar;
  if (propuesta && propuesta.estado === 'pendiente') motivoProbar = 'Aplicá o descartá el cambio antes de probar';
  else if (s.validacion && !s.validacion.ok) motivoProbar = 'Hay errores en la configuración';

  const nodoAbierto = s.ui.nodo ? grafo.nodes?.find((n) => n.id === s.ui.nodo.id) || s.ui.nodo : null;

  const alNodo = (n) => {
    if (!n) {
      acciones.ui({ nodo: null });
      return;
    }
    if (vista === 'general' && n.data.tipo === 'entregable') acciones.verEntregable(n.data.entregable);
    else acciones.ui({ nodo: n });
  };

  const errores = vistaPropuesta?.errores || [];
  const puedeAplicar = propuesta?.estado === 'pendiente' && !errores.length;

  return (
    <div className="pagina visualizador">
      <header className="cabecera">
        <div className="cabecera-textos">
          {vista === 'entregable' && nombre && <p className="miga">Inicio <span aria-hidden="true">›</span></p>}
          <h1 tabIndex={-1}>{vista === 'entregable' && nombre ? nombre : 'Inicio'}</h1>
          <p className="bajada">
            {vista === 'general'
              ? 'Este es el mapa de lo que Claude arma por vos: de dónde lee, qué entrega y cuándo. Se arma solo con lo que configuraste. Tocá un entregable para ver su flujo y probarlo.'
              : `Así se arma ${nombre}, paso por paso. Tocá un nodo (o llegá con Tab y apretá Enter) para ver el detalle o pedir un cambio.`}
          </p>
        </div>
        <div className="acciones">
          <div className="segmentado" role="group" aria-label="Vista">
            <button type="button" aria-pressed={vista === 'general'} className={vista === 'general' ? 'activo' : ''} onClick={() => acciones.ui({ vista: 'general', nodo: null })}>General</button>
            <button type="button" aria-pressed={vista === 'entregable'} className={vista === 'entregable' ? 'activo' : ''} onClick={() => acciones.ui({ vista: 'entregable', entregable: eid, nodo: null })}>Por entregable</button>
          </div>
          {vista === 'entregable' && (
            <select aria-label="Entregable" value={eid || ''} onChange={(e) => acciones.ui({ entregable: e.target.value, nodo: null })}>
              {entregables.map((e) => <option key={e.id} value={e.id}>{e.nombre}{e.activo ? '' : ' (apagado)'}</option>)}
            </select>
          )}
          {vista === 'entregable' && (
            <Boton
              variante="primario"
              icono={Play}
              motivo={motivoProbar}
              enCurso={iniciando || corriendo}
              textoEnCurso={iniciando ? 'Iniciando…' : 'Probando…'}
              onClick={probar}
            >
              Probar ahora
            </Boton>
          )}
        </div>
      </header>

      <PrimerosPasos compacto={vista === 'entregable'} />
      {vista === 'entregable' && eid && <AvisosEntregable id={eid} />}

      {propuesta && (
        <div className="banner banner-propuesta" ref={bannerPropuesta}>
          <div className="propuesta-texto">
            <p className="propuesta-titulo">
              <Icono de={Highlighter} />
              <span>
                <b>Cambio propuesto por Claude{vista === 'entregable' && nombre ? ` para ${nombre}` : ''}:</b> {propuesta.motivo}
              </span>
            </p>
            <ResumenCambios resumen={resumen} />
            {errores.length > 0 && (
              <p className="error-texto">
                <Icono de={TriangleAlert} />
                No se puede aplicar: {errores.map((e) => `${rutaHumana(e.ruta, s).texto}: ${e.mensaje}`).join('; ')}
              </p>
            )}
            {propuesta.estado !== 'pendiente' && <p className="meta">Esta propuesta ya no está pendiente.</p>}
          </div>
          <div className="propuesta-acciones">
            {puedeAplicar && (
              <Boton variante="primario" enCurso={aplicando} textoEnCurso="Aplicando…" onClick={aplicar}>Aplicar el cambio</Boton>
            )}
            <button type="button" className="boton" aria-expanded={verTexto} aria-controls="diferencias-propuesta" onClick={() => setVerTexto(!verTexto)}>
              <Icono de={ChevronDown} className={verTexto ? 'rotado' : undefined} />
              Ver qué cambia en las instrucciones
            </button>
            <button type="button" className="boton texto" onClick={dejarParaDespues}>Dejar para después</button>
            {propuesta.estado === 'pendiente' && (
              <button type="button" className="boton peligro propuesta-descartar" onClick={descartar}>Descartar propuesta</button>
            )}
          </div>
        </div>
      )}
      {propuesta && verTexto && <div id="diferencias-propuesta"><Diferencias diffs={propuesta.diffs} /></div>}

      {recienAplicada && !propuesta && !corriendo && (
        <div className="banner banner-ok">
          <Icono de={CircleCheck} />
          <span>Cambio aplicado. Probá de nuevo para ver cómo queda el borrador.</span>
        </div>
      )}

      {recienLista === idCorrida && estadoCorrida === 'lista' && !propuesta && !recienAplicada && !primerosPasosVisibles(s) && (
        <div className="banner banner-ok banner-borrador-listo">
          <Icono de={CircleCheck} />
          <span>Borrador listo: está debajo del flujo. No se mandó nada.</span>
          <button type="button" className="boton chico" onClick={verBorrador}>Ver el borrador</button>
        </div>
      )}

      {corriendo && !propuesta && (
        <div className="estado-corrida">
          <Icono de={LoaderCircle} className="icono-gira" />
          <span>
            Probando en modo borrador{enCursoNodos.length ? `: ${enCursoNodos.join(', ')}` : ''}… <span className="meta">{duracionEstimada(s)}</span>
          </span>
        </div>
      )}

      <div className="visualizador-cuerpo" ref={cuerpo}>
        {grafo.error ? (
          <div className="lienzo lienzo-vacio">
            <Vacio
              icono={Workflow}
              titulo="No se pudo armar este flujo"
              accion={<button type="button" className="boton" onClick={() => acciones.ir('entregables')}>Ir a Entregables</button>}
            >
              Revisá este entregable en Entregables: puede que le falten las instrucciones.
            </Vacio>
          </div>
        ) : (
          <Flujo
            clave={`${vista}-${vista === 'entregable' ? eid : ''}`}
            grafo={grafo}
            seleccionado={nodoAbierto?.id}
            etiqueta={vista === 'general' ? 'Mapa general' : `Flujo de ${nombre}`}
            onNodo={alNodo}
          >
            {nodoAbierto && <PanelNodo nodo={nodoAbierto} entregable={vista === 'entregable' ? eid : null} />}
          </Flujo>
        )}
      </div>

      {vista === 'general' && (
        <Semana entregables={entregables} hoy={s.ahora?.dia} onEntregable={(id) => acciones.verEntregable(id)} />
      )}
      {vista === 'entregable' && !propuesta && (
        <Salida corrida={corrida} destino={destino} entregable={eid} onProbar={motivoProbar ? undefined : probar} probando={iniciando} />
      )}
      {vista === 'entregable' && propuesta && corrida && (
        <details className="borrador-anterior">
          <summary>Borrador anterior (antes del cambio)</summary>
          <Salida corrida={corrida} destino={destino} entregable={eid} />
        </details>
      )}
    </div>
  );
}
