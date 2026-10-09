import { useState } from 'react';
import Markdown from 'react-markdown';
import { useApp } from '../estado.jsx';
import { api } from '../api.js';

function duracion(meta) {
  if (!meta?.inicio) return '';
  const fin = meta.fin ? Date.parse(meta.fin) : Date.now();
  const s = Math.round((fin - Date.parse(meta.inicio)) / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

const ESTADOS = { en_curso: 'Corriendo', lista: 'Borrador listo', error: 'Falló', cancelada: 'Cancelada' };

export default function Salida({ corrida }) {
  const { acciones } = useApp();
  const [verEvidencia, setVerEvidencia] = useState(false);
  const meta = corrida.meta || {};
  const ev = corrida.evidencia;

  const copiar = async () => {
    await navigator.clipboard.writeText(corrida.borrador || '');
    acciones.avisar('Borrador copiado.', 'ok');
  };
  const aprobar = async () => {
    try {
      await api(`/corridas/${meta.id}/aprobar`, { metodo: 'POST' });
      acciones.avisar('Borrador aprobado. Para entregarlo en su destino, pedíselo al orquestador en Claude Code.', 'ok');
    } catch (e) {
      acciones.avisar(e.message);
    }
  };

  return (
    <section className="salida">
      <div className="salida-cabecera">
        <div>
          <h2>Salida {meta.demo ? '(demo)' : ''}</h2>
          <div className="salida-meta">
            <span className={`etiqueta etiqueta-${meta.estado}`}>{ESTADOS[meta.estado] || meta.estado}</span>
            <span>{new Date(meta.inicio).toLocaleString('es-AR')}</span>
            <span>{duracion(meta)}</span>
            {meta.costo != null && <span>US$ {meta.costo.toFixed(3)}</span>}
            {meta.aprobada && <span className="etiqueta etiqueta-ok">Aprobado</span>}
          </div>
        </div>
        <div className="acciones">
          {meta.estado === 'en_curso' && <button className="boton" onClick={() => api(`/corridas/${meta.id}/cancelar`, { metodo: 'POST' })}>Cancelar</button>}
          {corrida.borrador && <button className="boton" onClick={copiar}>Copiar</button>}
          {corrida.borrador && <button className="boton" onClick={() => acciones.escribirEnChat('')}>Pedir un cambio</button>}
          {corrida.borrador && !meta.aprobada && <button className="boton primario" onClick={aprobar}>Aprobar borrador</button>}
        </div>
      </div>
      {meta.estado === 'en_curso' && !corrida.borrador && <p className="tenue">El borrador aparece acá cuando termine el control de evidencia.</p>}
      {meta.estado === 'error' && <div className="banner banner-error">{meta.error}</div>}
      {corrida.borrador && (
        <div className="borrador">
          <Markdown>{corrida.borrador}</Markdown>
        </div>
      )}
      {ev && (
        <div className="evidencia">
          <button className="boton chico" onClick={() => setVerEvidencia(!verEvidencia)}>
            {verEvidencia ? 'Ocultar' : 'Ver'} evidencia · {ev.items?.length || 0} con respaldo · {ev.descartados?.length || 0} descartados
          </button>
          {verEvidencia && (
            <div className="evidencia-detalle">
              <table>
                <thead><tr><th>Afirmación</th><th>Evidencia</th></tr></thead>
                <tbody>
                  {(ev.items || []).map((i, n) => (
                    <tr key={n}><td>{i.texto}</td><td>{i.evidencia.map((e) => <code key={e.ref}>{e.fuente}: {e.ref}</code>)}</td></tr>
                  ))}
                </tbody>
              </table>
              {ev.descartados?.length > 0 && (
                <>
                  <h3>Quedó afuera</h3>
                  <ul>{ev.descartados.map((x, n) => <li key={n}>{x.texto}: <span className="tenue">{x.motivo}</span></li>)}</ul>
                </>
              )}
              {ev.faltantes?.length > 0 && (
                <>
                  <h3>Fuentes que no se pudieron leer</h3>
                  <ul>{ev.faltantes.map((x, n) => <li key={n}>{x.fuente}: <span className="tenue">{x.motivo}</span></li>)}</ul>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
