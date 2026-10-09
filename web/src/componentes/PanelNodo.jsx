// Detalle de un nodo del flujo, superpuesto al lienzo. En lenguaje de oficina: nada de ids ni rutas.
import { useEffect, useRef } from 'react';
import { useApp } from '../estado.jsx';
import { TIPO_NODO, TEXTO_CONEXION, destinoHumano, fecha, nombreFuente, nombreEntregable } from '../textos.js';
import Boton from './Boton.jsx';
import { Icono, ICONO_TIPO, ICONO_FUENTE, ICONO_CONEXION, CircleMinus, X, Plug } from './Iconos.jsx';

function tipoVisible(d) {
  if (d.tipo === 'paso' && d.numero) return `${TIPO_NODO.paso} ${d.numero}`;
  return TIPO_NODO[d.tipo] || d.tipo;
}

function iconoDe(d) {
  if (d.agrupadas) return CircleMinus;
  if (d.tipo === 'fuente' && ICONO_FUENTE[d.fuente]) return ICONO_FUENTE[d.fuente];
  return ICONO_TIPO[d.tipo];
}

function ChipFuente({ s, id }) {
  const conexion = s.config?.fuentes?.[id]?.activo === false ? 'apagada' : s.fuentes?.[id] ? (s.fuentes[id].conectada ? 'conectada' : 'desconectada') : 'desconocida';
  return (
    <li className={`chip-fuente conexion-${conexion}`} title={TEXTO_CONEXION[conexion]}>
      <Icono de={ICONO_CONEXION[conexion]} tam={14} />
      <span>{nombreFuente(s, id)}</span>
      <span className="visualmente-oculto">: {TEXTO_CONEXION[conexion]}</span>
    </li>
  );
}

function Seccion({ titulo, children }) {
  return (
    <section className="panel-seccion">
      <h4 className="panel-etiqueta">{titulo}</h4>
      {children}
    </section>
  );
}

export default function PanelNodo({ nodo, entregable, alCerrar }) {
  const { s, acciones } = useApp();
  const d = nodo.data;
  const titulo = useRef(null);
  const nombre = nombreEntregable(s, entregable || d.entregable);
  const fuente = d.fuente ? s.fuentes?.[d.fuente] : null;
  const cat = d.fuente ? s.catalogo?.fuentes?.[d.fuente] : null;
  const pedir = (texto) => acciones.escribirEnChat(texto);
  const tituloVisible = d.tipo === 'destino' ? destinoHumano(d.destino).titulo : d.titulo;

  useEffect(() => {
    titulo.current?.focus({ preventScroll: true });
    // En el lienzo angosto el panel va debajo del mapa (no al costado): que quede a la vista.
    const panel = titulo.current?.closest('.panel-nodo');
    if (panel && getComputedStyle(panel).position === 'static') panel.scrollIntoView?.({ block: 'nearest' });
  }, [nodo.id]);

  const cerrar = () => {
    const id = nodo.id;
    if (alCerrar) alCerrar();
    else acciones.ui({ nodo: null });
    requestAnimationFrame(() => {
      const el = document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`);
      el?.focus({ preventScroll: true });
    });
  };

  const alTeclear = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      cerrar();
    }
  };

  const conexion = d.conexion;

  return (
    <aside id="panel-nodo" className="panel-nodo" aria-labelledby={`panel-titulo-${nodo.id}`} onKeyDown={alTeclear}>
      <div className="panel-cabecera">
        <div className="panel-encabezado">
          <div className="panel-tipo">
            <Icono de={iconoDe(d)} />
            {tipoVisible(d)}
          </div>
          <h3 id={`panel-titulo-${nodo.id}`} ref={titulo} tabIndex={-1}>{tituloVisible}</h3>
        </div>
        <Boton soloIcono chico icono={X} onClick={cerrar}>Cerrar</Boton>
      </div>

      {d.tipo === 'fuente' && !d.agrupadas && (
        <>
          <p className={`panel-conexion conexion-${conexion}`}>
            <Icono de={ICONO_CONEXION[conexion] || Plug} />
            <span><b>{TEXTO_CONEXION[conexion] || 'Sin revisar'}</b>{fuente?.detalle || d.detalleConexion ? ` · ${fuente?.detalle || d.detalleConexion}` : ''}</span>
          </p>
          {d.subtitulo && (
            <Seccion titulo="Para qué la usa">
              <p>{d.subtitulo}</p>
            </Seccion>
          )}
          {conexion !== 'conectada' && (fuente?.como_conectar || cat?.como_conectar) && (
            <Seccion titulo="Cómo conectarla">
              <p>{fuente?.como_conectar || cat?.como_conectar}</p>
            </Seccion>
          )}
          <div className="acciones">
            <button type="button" className="boton" onClick={() => acciones.ir('conectores')}>Ir a Conectores</button>
            {d.entregable && (
              <button type="button" className="boton texto" onClick={() => pedir(`En ${nombre}, cambiá cómo se usa ${nombreFuente(s, d.fuente)}: `)}>Pedir un cambio al chat</button>
            )}
          </div>
        </>
      )}

      {d.agrupadas && (
        <>
          <p>Estas fuentes están apagadas: ningún entregable las lee hasta que las prendas en Conectores.</p>
          <Seccion titulo="No se usan">
            <ul className="lista-chips">{d.agrupadas.map((f) => <ChipFuente key={f.id} s={s} id={f.id} />)}</ul>
          </Seccion>
          <div className="acciones">
            <button type="button" className="boton" onClick={() => acciones.ir('conectores')}>Ir a Conectores</button>
          </div>
        </>
      )}

      {d.tipo === 'paso' && (
        <>
          {d.subtitulo && <p>{d.subtitulo}</p>}
          {d.usa?.length > 0 && (
            <Seccion titulo="Lee de">
              <ul className="lista-chips">{d.usa.map((id) => <ChipFuente key={id} s={s} id={id} />)}</ul>
            </Seccion>
          )}
          {d.modulo && <p className="meta">Lo suma un módulo opcional.</p>}
          <div className="acciones">
            <button type="button" className="boton" onClick={() => pedir(`En ${nombre}, cambiá el paso «${d.titulo}»: `)}>Pedir un cambio al chat</button>
          </div>
        </>
      )}

      {d.tipo === 'control' && (
        <>
          <p>{d.subtitulo}</p>
          <Seccion titulo="Reglas del control">
            <ul>{(d.reglas || []).map((r, i) => <li key={i}>{r}</li>)}</ul>
          </Seccion>
          <Seccion titulo="Reglas aprendidas">
            {d.reglasAprendidas?.length ? (
              <ul>
                {d.reglasAprendidas.map((r, i) => (
                  <li key={i}>
                    {r.fecha && <span className="fecha num">{/^\d{4}-\d{2}-\d{2}$/.test(r.fecha) ? fecha(r.fecha) : r.fecha}</span>} {r.texto}
                  </li>
                ))}
              </ul>
            ) : <p className="meta">Todavía ninguna. Cada corrección que le pidas al chat queda acá, con su fecha.</p>}
          </Seccion>
          <div className="acciones">
            <button type="button" className="boton" onClick={() => pedir(`Sumá una regla al control de ${nombre}: `)}>Sumar una regla</button>
          </div>
        </>
      )}

      {d.tipo === 'disparador' && (
        <>
          {d.subtitulo && <p>Lee lo que pasó: {d.subtitulo.toLowerCase()}.</p>}
          {d.detalle && <p className="meta">{d.detalle}</p>}
          <div className="acciones">
            <button type="button" className="boton" onClick={() => acciones.ir('entregables', { entregableEnFoco: d.entregable })}>Cambiar el horario</button>
            <button type="button" className="boton texto" onClick={() => pedir(`Cambiá cuándo corre ${nombre}: `)}>Pedir un cambio al chat</button>
          </div>
        </>
      )}

      {d.tipo === 'destino' && (
        <>
          <p>{destinoHumano(d.destino).frase}</p>
          <p className="meta">Siempre llega primero como borrador: nada se manda sin tu OK.</p>
          {d.detalle && (
            <Seccion titulo="Cómo se arma">
              <p>{d.detalle}</p>
            </Seccion>
          )}
          <div className="acciones">
            <button type="button" className="boton" onClick={() => acciones.ir('entregables', { entregableEnFoco: d.entregable })}>Cambiar el destino</button>
            <button type="button" className="boton texto" onClick={() => pedir(`Cambiá a dónde se entrega ${nombre}: `)}>Pedir un cambio al chat</button>
          </div>
        </>
      )}

      {d.tipo === 'orquestador' && (
        <>
          <p>Claude lee las fuentes, arma cada entregable y lo deja como borrador. Nada se manda sin tu OK.</p>
          {d.subtitulo && <p className="meta">{d.subtitulo}. {d.detalle}</p>}
        </>
      )}

      {d.tipo === 'entregable' && (
        <>
          <p className="meta">{d.horarioTexto} → {destinoHumano(d.destino).titulo}</p>
          <div className="acciones">
            <button type="button" className="boton" onClick={() => acciones.ir('entregables', { entregableEnFoco: d.entregable })}>Editar en Entregables</button>
          </div>
        </>
      )}
    </aside>
  );
}
