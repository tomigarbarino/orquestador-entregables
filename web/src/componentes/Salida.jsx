// La hoja de borrador: lo que armó Claude, con su sello y la franja de respaldo siempre a la vista.
// Si no hay evidencia, no se cuenta: lo que quedó afuera se muestra abierto.
import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { useApp, useAccion } from '../estado.jsx';
import { api } from '../api.js';
import { ESTADO_PRUEBA, destinoHumano, fechaHora, dinero, plural, refHumana, nombreEntregable, nombreFuente } from '../textos.js';
import Boton from './Boton.jsx';
import Vacio from './Vacio.jsx';
import {
  Icono,
  ICONO_PRUEBA,
  Stamp,
  FileCheck,
  ShieldCheck,
  TriangleAlert,
  CircleCheck,
  CircleX,
  Copy,
  FileText,
  ChevronDown,
  FlaskConical,
  MessageSquare,
  Play,
} from './Iconos.jsx';

// Los títulos del borrador bajan de nivel: la página tiene un solo h1 y la hoja vive bajo un h2.
const TITULOS_HOJA = {
  h1: ({ node, ...p }) => <h3 {...p} />,
  h2: ({ node, ...p }) => <h4 {...p} />,
  h3: ({ node, ...p }) => <h5 {...p} />,
  h4: ({ node, ...p }) => <h6 {...p} />,
};

function duracion(meta) {
  if (!meta?.inicio) return '';
  const fin = meta.fin ? Date.parse(meta.fin) : Date.now();
  const s = Math.max(0, Math.round((fin - Date.parse(meta.inicio)) / 1000));
  if (!Number.isFinite(s)) return '';
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

function Respaldo({ ev, s }) {
  const [verOrigen, setVerOrigen] = useState(false);
  const n = ev.items?.length || 0;
  const m = ev.descartados?.length || 0;
  const faltantes = ev.faltantes || [];
  return (
    <div className="respaldo" aria-label="Respaldo del borrador" role="group">
      <p className="respaldo-resumen">
        <span className="respaldo-ok">
          <Icono de={ShieldCheck} />
          {n} {plural(n, 'afirmación', 'afirmaciones')} con respaldo
        </span>
        <span className={m ? 'respaldo-afuera' : 'respaldo-cero'}>
          <Icono de={TriangleAlert} />
          {m} {plural(m, 'quedó afuera', 'quedaron afuera')} por falta de evidencia
        </span>
      </p>

      {m > 0 && (
        <section className="respaldo-bloque">
          <h3>Quedó afuera por falta de evidencia</h3>
          <ul className="respaldo-lista">
            {ev.descartados.map((x, i) => (
              <li key={i}>
                <span>{x.texto}</span>
                {x.motivo && <span className="meta"> · {x.motivo}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {faltantes.length > 0 && (
        <section className="respaldo-bloque">
          <h3>Fuentes que no se pudieron leer</h3>
          <ul className="respaldo-lista">
            {faltantes.map((x, i) => (
              <li key={i}>
                <span>{nombreFuente(s, x.fuente)}</span>
                {x.motivo && <span className="meta"> · {x.motivo}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {n > 0 && (
        <div className="respaldo-bloque">
          <button type="button" className="boton texto chico" aria-expanded={verOrigen} aria-controls="respaldo-origen" onClick={() => setVerOrigen(!verOrigen)}>
            <Icono de={ChevronDown} className={verOrigen ? 'rotado' : undefined} />
            Ver de dónde sale cada afirmación
          </button>
          {verOrigen && (
            <div className="tabla-scroll" id="respaldo-origen">
              <table className="tabla tabla-respaldo">
                <thead><tr><th scope="col">Afirmación</th><th scope="col">De dónde sale</th></tr></thead>
                <tbody>
                  {ev.items.map((i, k) => (
                    <tr key={k}>
                      <td>{i.texto}</td>
                      <td>
                        <ul className="refs">
                          {(i.evidencia || []).map((e, j) => {
                            const r = refHumana(e.fuente, e.ref);
                            return (
                              <li key={j}>
                                <span className="meta">{nombreFuente(s, e.fuente)}:</span> <code title={r.title}>{r.texto}</code>
                              </li>
                            );
                          })}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// <Salida corrida destino onProbar? />. Sin corrida muestra el estado vacío.
export default function Salida({ corrida, destino, onProbar, probando = false, entregable }) {
  const { s, acciones } = useApp();
  const [recienAprobada, setRecienAprobada] = useState(false);
  const bloqueAprobado = useRef(null);
  // El botón de aprobar desaparece: el foco pasa al bloque que cuenta qué pasó (nunca a <body>).
  useEffect(() => {
    if (recienAprobada) bloqueAprobado.current?.focus({ preventScroll: false });
  }, [recienAprobada]);
  const [aprobar, aprobando] = useAccion(async () => {
    try {
      await api(`/corridas/${corrida.meta.id}/aprobar`, { metodo: 'POST' });
      setRecienAprobada(true);
      acciones.anunciar?.('Borrador aprobado. Todavía no se mandó.');
      acciones.cargarCorrida?.(corrida.meta.id);
    } catch (e) {
      acciones.avisar(e.message);
    }
  });

  if (!corrida) {
    return (
      <section className="salida salida-vacia" aria-labelledby="salida-titulo">
        <h2 id="salida-titulo" className="visualmente-oculto">Borrador</h2>
        <Vacio
          icono={FileText}
          titulo="Todavía no hay un borrador"
          accion={onProbar && <Boton icono={Play} enCurso={probando} textoEnCurso="Iniciando…" onClick={onProbar}>Probar este entregable</Boton>}
        >
          Probá el entregable: arma un borrador y no manda nada.
        </Vacio>
      </section>
    );
  }

  const meta = corrida.meta || {};
  const ev = corrida.evidencia;
  const nombre = nombreEntregable(s, meta.entregable || entregable);
  const dh = destinoHumano(destino);
  const esBorrador = !destino || destino.tipo === 'borrador';
  const aprobada = Boolean(meta.aprobada) || recienAprobada;
  const estadoClave = meta.estado;
  const iconoEstado = ICONO_PRUEBA[estadoClave];
  const enCurso = estadoClave === 'en_curso';

  const copiar = async () => {
    if (await copiarTexto(corrida.borrador || '')) acciones.avisar('Copiaste el texto del borrador.', 'ok');
    else acciones.avisar('No se pudo copiar. Seleccioná el texto de la hoja y copialo a mano.');
  };
  const copiarPedido = async () => {
    const texto = `Entregá el borrador aprobado de ${nombre} (${meta.id})`;
    if (await copiarTexto(texto)) acciones.avisar('Copiaste el pedido. Pegalo en Claude Code.', 'ok');
    else acciones.avisar(`No se pudo copiar. El pedido es: ${texto}`);
  };

  return (
    <section className="salida" aria-labelledby="salida-titulo" aria-busy={enCurso ? 'true' : undefined}>
      <div className="salida-cabecera">
        <div className="salida-titulos">
          <h2 id="salida-titulo">Borrador de {nombre}</h2>
          <div className="salida-meta">
            {ESTADO_PRUEBA[estadoClave] && (
              <span className={`etiqueta etiqueta-${estadoClave}`}>
                {iconoEstado && <Icono de={iconoEstado} tam={14} className={enCurso ? 'icono-gira' : undefined} />}
                {ESTADO_PRUEBA[estadoClave]}
              </span>
            )}
            {meta.demo && (
              <span className="etiqueta etiqueta-demo">
                <Icono de={FlaskConical} tam={14} />
                Demo
              </span>
            )}
            <span className="meta num">
              {[fechaHora(meta.inicio), duracion(meta), dinero(meta.costo)].filter(Boolean).join(' · ')}
            </span>
          </div>
          <p className="salida-destino">
            {esBorrador ? 'Todavía no se mandó a ningún lado · No tiene destino: lo copiás vos' : `Todavía no se mandó a ningún lado · Destino: ${dh.titulo}`}
          </p>
        </div>
        <div className="acciones">
          {enCurso && <button type="button" className="boton peligro" onClick={() => acciones.cancelarCorrida(meta.id)}>Cancelar</button>}
          {corrida.borrador && (
            <button type="button" className="boton" onClick={copiar}>
              <Icono de={Copy} />
              Copiar el texto
            </button>
          )}
          {corrida.borrador && (
            <button type="button" className="boton" onClick={() => acciones.escribirEnChat('Sobre este borrador: ')}>
              <Icono de={MessageSquare} />
              Pedir un cambio
            </button>
          )}
          {corrida.borrador && !aprobada && (
            <span className="aprobar">
              <Boton variante="primario" icono={FileCheck} enCurso={aprobando} textoEnCurso="Aprobando…" onClick={aprobar} aria-describedby="ayuda-aprobar">
                Aprobar borrador
              </Boton>
              <span id="ayuda-aprobar" className="meta">Aprobar no lo manda: lo marca como revisado.</span>
            </span>
          )}
        </div>
      </div>

      {enCurso && !corrida.borrador && <p className="meta">El borrador aparece acá cuando termine el control de evidencia.</p>}
      {estadoClave === 'error' && (
        <div className="banner banner-error" role="alert">
          <Icono de={CircleX} />
          <span>{meta.error || 'La prueba falló.'}</span>
        </div>
      )}

      {corrida.borrador && (
        <article className="borrador" tabIndex={-1} aria-label={`Hoja del borrador de ${nombre}`}>
          <div className={`sello${aprobada ? ' sello-aprobado' : ''}`}>
            <Icono de={aprobada ? FileCheck : Stamp} />
            {aprobada ? 'Aprobado' : 'Borrador sin enviar'}
          </div>
          <div className="borrador-texto">
            <Markdown components={TITULOS_HOJA}>{corrida.borrador}</Markdown>
          </div>
          {recienAprobada && (
            <div className="aprobado-bloque" role="status" tabIndex={-1} ref={bloqueAprobado}>
              <p className="aprobado-titulo">
                <Icono de={CircleCheck} />
                Aprobado. Todavía no se mandó.
              </p>
              <p className="meta">Destino: {dh.titulo}</p>
              {esBorrador ? (
                <>
                  <p>Este entregable termina acá: copiá el texto y usalo donde quieras.</p>
                  <div className="acciones">
                    <button type="button" className="boton" onClick={copiar}><Icono de={Copy} />Copiar el texto</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="acciones">
                    <button type="button" className="boton" onClick={copiar}><Icono de={Copy} />Copiar el texto</button>
                    <button type="button" className="boton" onClick={copiarPedido}><Icono de={Copy} />Copiar el pedido para Claude Code</button>
                  </div>
                  <p className="meta">Pegalo en Claude Code, en la carpeta del orquestador.</p>
                </>
              )}
            </div>
          )}
        </article>
      )}

      {ev && <Respaldo ev={ev} s={s} />}
    </section>
  );
}
