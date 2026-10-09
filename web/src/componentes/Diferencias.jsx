// Muestra los parches de una propuesta con las líneas que se suman (+) y las que se quitan (−).
// También arma el resumen de lo que cambia en el flujo (Se suma / Cambia / Se quita), el mismo para
// el banner del mapa y para la tarjeta de la propuesta en el chat.
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../estado.jsx';
import { api } from '../api.js';
import { grafoGeneral, grafoEntregable, diffGrafos } from '@lib/grafo.mjs';
import { archivoHumano, entregableDePropuesta } from '../textos.js';
import { Icono, Plus, Minus, Pencil } from './Iconos.jsx';

// Qué entregable toca una propuesta: el de la receta que cambia o el de la config que cambia.
export function entregableAfectado(vista, s) {
  const p = vista?.propuesta;
  const directo = p ? entregableDePropuesta(p, s) : null;
  if (directo) return directo;
  const cfg = vista?.config || {};
  for (const [id, e] of Object.entries(cfg.entregables || {})) {
    if (JSON.stringify(e) !== JSON.stringify(s.config?.entregables?.[id])) return id;
  }
  return null;
}

function nombresDeFuentes(s) {
  return Object.fromEntries(Object.entries(s.catalogo?.fuentes || {}).map(([id, f]) => [id, f.nombre]));
}

// Resumen del cambio en el flujo, como lo muestra el mapa: el del entregable afectado o, si la
// propuesta no toca ninguno, el de la vista general.
export function resumenDeVista(vista, s) {
  if (!vista?.config) return null;
  const eid = entregableAfectado(vista, s);
  const base = { config: s.config, recetas: s.recetas, modulos: s.modulos, estadoFuentes: s.fuentes, nombresFuentes: nombresDeFuentes(s) };
  const armar = (p) => (eid ? grafoEntregable({ ...p, entregableId: eid }) : grafoGeneral(p));
  const actual = armar(base);
  if (actual.error) return null;
  return diffGrafos(actual, armar({ ...base, config: vista.config, recetas: vista.recetas })).resumen;
}

const vistas = new Map();

// Trae la vista previa de una propuesta pendiente (una sola vez por propuesta) y devuelve su resumen.
export function useResumenPropuesta(id, activo = true) {
  const { s } = useApp();
  const [vista, setVista] = useState(() => vistas.get(id) || null);
  useEffect(() => {
    if (!activo || !id) return undefined;
    if (vistas.has(id)) {
      setVista(vistas.get(id));
      return undefined;
    }
    let vigente = true;
    api(`/propuestas/${id}/vista`)
      .then((v) => {
        vistas.set(id, v);
        if (vigente) setVista(v);
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [id, activo]);
  return useMemo(() => (activo && vista ? resumenDeVista(vista, s) : null), [activo, vista, s.config, s.recetas, s.modulos, s.fuentes, s.catalogo]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function resumenVacio(resumen) {
  return !resumen || (!resumen.agregados.length && !resumen.quitados.length && !resumen.modificados.length);
}

// «Se suma: Jira · Cambia: Control de evidencia · Se quita: Calendario», con ícono y palabra.
export function ResumenCambios({ resumen }) {
  if (!resumen) return null;
  if (resumenVacio(resumen)) return <p className="meta">El flujo no cambia: cambian las instrucciones.</p>;
  return (
    <ul className="resumen-cambios" aria-label="Qué cambia en el flujo">
      {resumen.agregados.map((t) => (
        <li key={`a-${t}`} className="chip chip-cambio-agregado"><Icono de={Plus} tam={14} />Se suma: {t}</li>
      ))}
      {resumen.modificados.map((t) => (
        <li key={`m-${t}`} className="chip chip-cambio-modificado"><Icono de={Pencil} tam={14} />Cambia: {t}</li>
      ))}
      {resumen.quitados.map((t) => (
        <li key={`q-${t}`} className="chip chip-cambio-quitado"><Icono de={Minus} tam={14} />Se quita: {t}</li>
      ))}
    </ul>
  );
}

export default function Diferencias({ diffs }) {
  const { s } = useApp();
  if (!diffs?.length) return <p className="meta">Las instrucciones no cambian.</p>;
  return (
    <div className="diferencias">
      {diffs.map((d) => (
        <section key={d.archivo} className="diferencia" aria-label={`Cambios en ${archivoHumano(d.archivo, s)}`}>
          <h3 className="diferencia-archivo" title={d.archivo}>{archivoHumano(d.archivo, s)}</h3>
          <pre>
            {d.parche.split('\n').slice(4).map((l, i) => {
              const clase = l.startsWith('+') ? 'linea-mas' : l.startsWith('-') ? 'linea-menos' : l.startsWith('@@') ? 'linea-bloque' : '';
              if (clase === 'linea-bloque') return <div key={i} className={clase} aria-hidden="true">⋯</div>;
              const marca = clase === 'linea-mas' ? '+' : clase === 'linea-menos' ? '−' : ' ';
              const texto = clase ? l.slice(1) : l.replace(/^ /, '');
              return (
                <div key={i} className={clase}>
                  <span className="linea-marca" aria-hidden="true">{marca}</span>
                  {clase && <span className="visualmente-oculto">{clase === 'linea-mas' ? 'Se suma: ' : 'Se quita: '}</span>}
                  {texto || ' '}
                </div>
              );
            })}
          </pre>
        </section>
      ))}
    </div>
  );
}
