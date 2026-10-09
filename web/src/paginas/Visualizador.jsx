import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../estado.jsx';
import { api } from '../api.js';
import { grafoGeneral, grafoEntregable, aplicarCorrida, diffGrafos } from '@lib/grafo.mjs';
import { entregablesDe } from '@lib/receta-efectiva.mjs';
import Flujo from '../componentes/Flujo.jsx';
import Semana from '../componentes/Semana.jsx';
import PanelNodo from '../componentes/PanelNodo.jsx';
import Salida from '../componentes/Salida.jsx';
import Diferencias from '../componentes/Diferencias.jsx';

// Qué entregable toca una propuesta: el de la receta que cambia o el de la config que cambia.
function entregableAfectado(vista, configActual) {
  const p = vista.propuesta;
  const cfg = vista.config || {};
  const porReceta = (rid) => Object.entries(cfg.entregables || {}).find(([, e]) => e.receta === rid)?.[0];
  if (p.regla?.receta) return porReceta(p.regla.receta) || null;
  const receta = p.cambios.find((c) => c.tipo === 'receta');
  if (receta) return porReceta(receta.id) || null;
  for (const [id, e] of Object.entries(cfg.entregables || {})) {
    if (JSON.stringify(e) !== JSON.stringify(configActual?.entregables?.[id])) return id;
  }
  return null;
}

export default function Visualizador() {
  const { s, acciones } = useApp();
  const [vistaPropuesta, setVistaPropuesta] = useState(null);
  const [verTexto, setVerTexto] = useState(false);
  const [recienAplicada, setRecienAplicada] = useState(null);

  const entregables = useMemo(() => entregablesDe(s.config, s.recetas, s.modulos), [s.config, s.recetas, s.modulos]);
  const nombresFuentes = useMemo(() => Object.fromEntries(Object.entries(s.catalogo?.fuentes || {}).map(([id, f]) => [id, f.nombre])), [s.catalogo]);
  const vista = s.ui.vista;
  const eid = s.ui.entregable || entregables[0]?.id;
  const idCorrida = eid ? s.ui.corridaPorEntregable[eid] : null;
  const corrida = idCorrida ? s.corridas[idCorrida] : null;
  const corriendo = corrida?.meta?.estado === 'en_curso';

  useEffect(() => {
    if (idCorrida && !s.corridas[idCorrida]) acciones.cargarCorrida(idCorrida);
  }, [idCorrida]);

  const enFoco = s.ui.propuestaEnFoco;
  useEffect(() => {
    if (!enFoco) {
      setVistaPropuesta(null);
      return;
    }
    api(`/propuestas/${enFoco}/vista`).then((v) => {
      setVistaPropuesta(v);
      const afectado = entregableAfectado(v, s.config);
      if (afectado) acciones.ui({ vista: 'entregable', entregable: afectado, nodo: null });
    }).catch((e) => acciones.avisar(e.message));
  }, [enFoco]);

  const parametros = { config: s.config, recetas: s.recetas, modulos: s.modulos, estadoFuentes: s.fuentes, nombresFuentes };
  let grafo = vista === 'general' ? grafoGeneral(parametros) : grafoEntregable({ ...parametros, entregableId: eid });
  let resumen = null;
  if (vistaPropuesta?.config) {
    const propuestos = { ...parametros, config: vistaPropuesta.config, recetas: vistaPropuesta.recetas };
    const nuevo = vista === 'general' ? grafoGeneral(propuestos) : grafoEntregable({ ...propuestos, entregableId: eid });
    const diff = diffGrafos(grafo, nuevo);
    grafo = diff;
    resumen = diff.resumen;
  } else if (vista === 'entregable' && corrida) {
    grafo = aplicarCorrida(grafo, corrida.nodos);
  }

  const enCurso = corriendo ? Object.entries(corrida.nodos || {}).filter(([, v]) => v.estado === 'en_curso').map(([k]) => grafo.nodes.find((n) => n.id === k)?.data?.titulo).filter(Boolean) : [];
  const propuesta = vistaPropuesta?.propuesta;

  const aplicar = async () => {
    if (await acciones.aplicarPropuesta(propuesta.id)) setRecienAplicada(eid);
  };

  return (
    <div className="pagina">
      <header className="cabecera">
        <div>
          <h1>Visualizador</h1>
          <p className="bajada">Se genera desde tu config y tus recetas. Tocá un nodo para ver su configuración o cambiarlo charlando.</p>
        </div>
        <div className="acciones">
          <div className="segmentado">
            <button className={vista === 'general' ? 'activo' : ''} onClick={() => acciones.ui({ vista: 'general', nodo: null })}>General</button>
            <button className={vista === 'entregable' ? 'activo' : ''} onClick={() => acciones.ui({ vista: 'entregable', entregable: eid, nodo: null })}>Por entregable</button>
          </div>
          {vista === 'entregable' && (
            <select value={eid || ''} onChange={(e) => acciones.ui({ entregable: e.target.value, nodo: null })}>
              {entregables.map((e) => <option key={e.id} value={e.id}>{e.nombre}{e.activo ? '' : ' (apagado)'}</option>)}
            </select>
          )}
          {vista === 'entregable' && (
            <button className="boton primario" disabled={corriendo || !s.validacion?.ok || Boolean(propuesta)} onClick={() => { setRecienAplicada(null); acciones.probar(eid); }}>
              {corriendo ? 'Corriendo…' : 'Probar ahora'}
            </button>
          )}
        </div>
      </header>

      {propuesta && (
        <div className="banner banner-propuesta">
          <div>
            <b>Vista previa del cambio:</b> {propuesta.motivo}
            <div className="resumen-cambios">
              {resumen?.agregados.length > 0 && <span className="chip chip-cambio-agregado">+ {resumen.agregados.join(', ')}</span>}
              {resumen?.quitados.length > 0 && <span className="chip chip-cambio-quitado">− {resumen.quitados.join(', ')}</span>}
              {resumen?.modificados.length > 0 && <span className="chip chip-cambio-modificado">~ {resumen.modificados.join(', ')}</span>}
              {resumen && !resumen.agregados.length && !resumen.quitados.length && !resumen.modificados.length && <span className="tenue">El flujo no cambia: cambian las instrucciones.</span>}
            </div>
            {vistaPropuesta.errores?.length > 0 && <div className="error-texto">No se puede aplicar: {vistaPropuesta.errores.map((e) => `${e.ruta}: ${e.mensaje}`).join('; ')}</div>}
          </div>
          <div className="acciones">
            <button className="boton chico" onClick={() => setVerTexto(!verTexto)}>{verTexto ? 'Ocultar' : 'Ver'} texto</button>
            <button className="boton chico" onClick={() => acciones.descartarPropuesta(propuesta.id)}>Descartar</button>
            <button className="boton chico" onClick={() => acciones.ui({ propuestaEnFoco: null })}>Cerrar</button>
            {propuesta.estado === 'pendiente' && <button className="boton primario chico" onClick={aplicar}>Aplicar</button>}
          </div>
        </div>
      )}
      {propuesta && verTexto && <Diferencias diffs={propuesta.diffs} />}

      {recienAplicada && !propuesta && !corriendo && (
        <div className="banner banner-ok">
          Cambio aplicado.
          <button className="boton primario chico" onClick={() => { setRecienAplicada(null); acciones.probar(recienAplicada); }}>Probar de nuevo</button>
        </div>
      )}

      {corriendo && !propuesta && (
        <div className="estado-corrida">
          <span className="girando" /> Corriendo en modo borrador{enCurso.length ? `: ${enCurso.join(', ')}` : '…'}
        </div>
      )}

      <div className="visualizador-cuerpo">
        <Flujo
          clave={`${vista}-${eid}-${propuesta?.id || ''}`}
          grafo={grafo}
          alto={vista === 'general' ? 520 : 480}
          onNodo={(n) => {
            if (vista === 'general' && n.data.tipo === 'entregable') acciones.ui({ vista: 'entregable', entregable: n.data.entregable, nodo: null });
            else acciones.ui({ nodo: n });
          }}
        />
        {s.ui.nodo && <PanelNodo nodo={s.ui.nodo} entregable={vista === 'entregable' ? eid : null} />}
      </div>

      {vista === 'general' && (
        <Semana entregables={entregables} hoy={s.ahora?.dia} onEntregable={(id) => acciones.ui({ vista: 'entregable', entregable: id, nodo: null })} />
      )}
      {vista === 'entregable' && corrida && !propuesta && <Salida corrida={corrida} />}
      {vista === 'entregable' && !corrida && !propuesta && (
        <p className="tenue centro">Todavía no corriste este entregable. "Probar ahora" lo arma en modo borrador: nada se manda a ningún lado.</p>
      )}
    </div>
  );
}
