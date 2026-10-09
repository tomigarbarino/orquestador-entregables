import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { useApp, useAccion, pantallaActual } from '../estado.jsx';
import { api } from '../api.js';
import Diferencias, { ResumenCambios, useResumenPropuesta } from './Diferencias.jsx';
import Boton from './Boton.jsx';
import {
  Icono,
  ChevronDown,
  CircleCheck,
  Eye,
  Highlighter,
  LoaderCircle,
  MessageSquare,
  MessageSquarePlus,
  PanelRightClose,
  Play,
  Send,
  Stamp,
  TriangleAlert,
  ICONO_FUENTE,
  ICONO_TIPO,
} from './Iconos.jsx';
import { archivoHumano, entregableDePropuesta, entregableSugerido, nombreEntregable, nombreFuente, plural, rutaHumana } from '../textos.js';
import { primerosPasosVisibles, usePrimerosPasos } from './PrimerosPasos.jsx';

const NOMBRE_HERRAMIENTA = {
  ver_config: 'leyó tu configuración',
  ver_receta: 'leyó las instrucciones',
  listar_recetas: 'repasó tus entregables',
  estado: 'revisó las conexiones',
  proponer_cambio: 'propuso un cambio',
};

const SUGERENCIAS = ['Que el guion de la daily sea más corto', 'Sumá los tickets de Jira a la daily', 'Quiero armar un entregable nuevo'];

const angosto = () => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 900px)').matches;

// Nombre humano de un nodo del flujo a partir de su id ('fuente:github', 'paso:redactar', 'control').
function nombreNodo(s, entregable, nodo, tituloConocido) {
  if (!nodo) return null;
  const [tipo, id] = String(nodo).split(':');
  if (tipo === 'fuente' && id) return { texto: nombreFuente(s, id), icono: ICONO_FUENTE?.[id] || ICONO_TIPO?.fuente };
  if (tipo === 'paso' && id) {
    const receta = s.recetas?.[s.config?.entregables?.[entregable]?.receta || entregable]?.receta;
    const paso = receta?.pasos?.find((p) => p.id === id);
    return { texto: tituloConocido || paso?.nombre || paso?.titulo || 'Un paso', icono: ICONO_TIPO?.paso };
  }
  const fijos = { control: 'Control de evidencia', disparador: 'Cuándo corre', destino: 'Se entrega en', orquestador: 'Claude' };
  if (fijos[tipo]) return { texto: tituloConocido || fijos[tipo], icono: ICONO_TIPO?.[tipo] };
  if (tipo === 'entregable' && id) return { texto: nombreEntregable(s, id), icono: ICONO_TIPO?.entregable };
  return tituloConocido ? { texto: tituloConocido } : null;
}

function ChipContexto({ icono, children }) {
  return (
    <span className="chip-contexto">
      {icono && <Icono de={icono} tam={12} />}
      {children}
    </span>
  );
}

// vigente: es la última propuesta pendiente de la charla (las anteriores pierden las acciones).
// «Aplicar el cambio» va siempre como secundario: la acción primaria es la de la página (o la del
// banner del mapa, cuando la propuesta está a la vista).
function TarjetaPropuesta({ id, vigente = true }) {
  const { s, acciones } = useApp();
  const [verTexto, setVerTexto] = useState(false);
  const idDiff = useId();
  const titulo = useRef(null);
  const p = s.propuestas.find((x) => x.id === id);
  const eid = p ? entregableDePropuesta(p, s) : null;
  const pendienteAhora = p?.estado === 'pendiente' && vigente;
  // Los botones de la tarjeta cambian al aplicar o descartar: el foco pasa al título de la tarjeta.
  const enfocarTarjeta = () => requestAnimationFrame(() => titulo.current?.focus({ preventScroll: true }));
  const [aplicar, aplicando] = useAccion(async () => {
    if (await acciones.aplicarPropuesta(id)) enfocarTarjeta();
  });
  const [descartar, descartando] = useAccion(async () => {
    if (await acciones.descartarPropuesta(id)) enfocarTarjeta();
  });
  // Mismo resumen que el banner del mapa: «Se suma: Jira», «Cambia: Control de evidencia».
  const resumen = useResumenPropuesta(id, pendienteAhora);
  const [probar, probando] = useAccion(() => (eid ? acciones.probar(eid) : null));
  if (!p) return null;
  const nombre = eid ? nombreEntregable(s, eid) : null;
  const archivos = [...new Set((p.diffs || []).map((d) => d.archivo))];
  const regla = p.regla?.texto;
  const reglaPara = nombre || (p.regla?.receta ? nombreEntregable(s, p.regla.receta) : '');
  const hayDiffs = (p.diffs || []).length > 0;
  const pendiente = p.estado === 'pendiente' && vigente;
  const reemplazada = p.estado === 'pendiente' && !vigente;

  return (
    <div className={`tarjeta-propuesta estado-${p.estado}`}>
      <p className="tarjeta-propuesta-titulo" ref={titulo} tabIndex={-1}>
        <Icono de={p.estado === 'aplicada' ? CircleCheck : Highlighter} />
        <span>Propuesta: {p.motivo}</span>
      </p>
      {resumen ? (
        <ResumenCambios resumen={resumen} />
      ) : archivos.length > 0 && (
        <ul className="propuesta-archivos">
          {archivos.map((a) => (
            <li key={a} title={a}>{fraseArchivo(archivoHumano(a, s))}</li>
          ))}
        </ul>
      )}
      {regla && (
        <p className="regla-nueva">
          Regla nueva{reglaPara ? ` para ${reglaPara}` : ''}: “{regla}”
        </p>
      )}
      {p.estado === 'invalida' && (
        <ul className="errores-propuesta">
          {(p.errores || []).map((e, i) => (
            <li key={i} title={e.ruta}>
              {rutaHumana(e.ruta, s)?.texto || 'Configuración'}: {e.mensaje}
            </li>
          ))}
        </ul>
      )}
      <div className="acciones">
        {pendiente && (
          <>
            <Boton chico enCurso={aplicando} textoEnCurso="Aplicando…" onClick={aplicar}>
              Aplicar el cambio
            </Boton>
            <Boton
              chico
              icono={Eye}
              onClick={() =>
                acciones.ir('visualizador', eid ? { vista: 'entregable', entregable: eid, propuestaEnFoco: p.id } : { vista: 'general', propuestaEnFoco: p.id }, { foco: false })
              }
            >
              Ver en el flujo
            </Boton>
          </>
        )}
        {hayDiffs && (
          <Boton chico variante="texto" aria-expanded={verTexto} aria-controls={idDiff} onClick={() => setVerTexto(!verTexto)}>
            {verTexto ? 'Ocultar el cambio' : 'Ver el cambio'}
          </Boton>
        )}
        {pendiente && (
          <Boton chico variante="peligro" className="empuje" enCurso={descartando} textoEnCurso="Descartando…" onClick={descartar}>
            Descartar
          </Boton>
        )}
        {p.estado === 'aplicada' && (
          <>
            <span className="propuesta-estado ok">
              <Icono de={CircleCheck} />
              Aplicada
            </span>
            {eid && (
              <Boton chico icono={Play} enCurso={probando || Boolean(s.ui.iniciando?.[eid])} textoEnCurso="Iniciando…" onClick={probar}>
                {`Probar de nuevo ${nombre}`}
              </Boton>
            )}
          </>
        )}
        {p.estado === 'descartada' && <span className="etiqueta">Descartada</span>}
        {reemplazada && <span className="etiqueta" title="Sigue en Historial por si la querés retomar">Reemplazada por una más nueva</span>}
        {p.estado === 'invalida' && (
          <span className="propuesta-estado">
            <Icono de={TriangleAlert} />
            No se pudo armar
          </span>
        )}
      </div>
      {verTexto && hayDiffs && (
        <div id={idDiff}>
          <Diferencias diffs={p.diffs} />
        </div>
      )}
    </div>
  );
}

// 'Configuración' → 'Cambia la configuración'; 'Instrucciones de Daily' → 'Cambia las instrucciones de Daily'.
function fraseArchivo(t) {
  if (!t) return 'Cambia un archivo';
  if (/^configuraci/i.test(t)) return 'Cambia la configuración';
  if (/^instrucciones/i.test(t)) return `Cambia las ${t.charAt(0).toLowerCase()}${t.slice(1)}`;
  return `Cambia ${t.charAt(0).toLowerCase()}${t.slice(1)}`;
}

function ChatVacio() {
  const { s, acciones } = useApp();
  usePrimerosPasos();
  const sugerido = entregableSugerido(s);
  const [probar, probando] = useAccion(() => (sugerido ? acciones.probar(sugerido) : null));
  // Mientras se ven los Primeros pasos, su botón ya invita a probar: acá no se repite.
  const conPrimerosPasos = primerosPasosVisibles(s);
  const yaProbo = (s.listaCorridas?.length || 0) > 0;
  return (
    <div className="chat-vacio">
      <p>{yaProbo ? 'Pedile cambios con tus palabras, por ejemplo:' : 'Primero probá un entregable; después pedile cambios como:'}</p>
      {sugerido && !yaProbo && !conPrimerosPasos && (
        <Boton
          icono={Play}
          enCurso={probando || Boolean(s.ui.iniciando?.[sugerido])}
          textoEnCurso="Iniciando…"
          onClick={probar}
        >
          {`Probar ${nombreEntregable(s, sugerido)} ahora`}
        </Boton>
      )}
      <div className="sugerencias">
        {SUGERENCIAS.map((t) => (
          <button key={t} type="button" className="sugerencia" onClick={() => acciones.escribirEnChat(t, { reemplazar: true })}>
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Chat() {
  const { s, d, acciones } = useApp();
  const caja = useRef(null);
  const lista = useRef(null);
  const cercaDelFinal = useRef(true);
  const abiertoAntes = useRef(s.ui.chatAbierto);
  const [hayNuevos, setHayNuevos] = useState(false);
  const [faltaTexto, setFaltaTexto] = useState(false);
  const idAyuda = useId();
  const idFalta = useId();
  const { conv, respondiendo, parcial, herramientas, entrada } = s.chat;
  const abierto = s.ui.chatAbierto;

  // Foco al abrir u ocultar el chat: nunca queda en <body>.
  useEffect(() => {
    if (abiertoAntes.current === abierto) return;
    abiertoAntes.current = abierto;
    const t = setTimeout(() => {
      if (abierto) document.getElementById('entrada-chat')?.focus();
      else document.querySelector('.chat-abrir')?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [abierto]);

  // Auto-scroll solo si la persona estaba cerca del final (se mide antes de actualizar).
  const medir = useCallback(() => {
    const el = lista.current;
    if (!el) return;
    cercaDelFinal.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (cercaDelFinal.current) setHayNuevos(false);
  }, []);

  const irAlFinal = useCallback(() => {
    const el = lista.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    cercaDelFinal.current = true;
    setHayNuevos(false);
  }, []);

  useLayoutEffect(() => {
    if (!lista.current) return;
    if (cercaDelFinal.current) irAlFinal();
    else setHayNuevos(true);
  }, [conv?.mensajes?.length, parcial, herramientas.length, respondiendo, abierto, irAlFinal]);

  useEffect(() => {
    if (!respondiendo || !conv?.id) return undefined;
    // Respaldo por si se pierde un evento: después de un rato se relee la conversación.
    const t = setInterval(async () => {
      try {
        const actual = await api('/chat');
        if (actual.id === conv.id && actual.mensajes.length > conv.mensajes.length && actual.mensajes.at(-1).rol === 'claude') {
          d({ tipo: 'chat', datos: { conv: actual, respondiendo: false, parcial: '', herramientas: [] } });
        }
      } catch {
        // se reintenta en el próximo ciclo
      }
    }, 8000);
    return () => clearInterval(t);
  }, [respondiendo, conv?.id, conv?.mensajes?.length]);

  const idsPendientes = (conv?.mensajes || [])
    .flatMap((m) => m.propuestas || [])
    .filter((pid) => s.propuestas.some((p) => p.id === pid && p.estado === 'pendiente'));
  const pendientes = idsPendientes.length;
  const ultimaPendiente = idsPendientes.at(-1);

  const [nuevaCharla, empezando] = useAccion(async () => {
    if (pendientes > 0) {
      const texto = `Tenés ${pendientes} ${plural(pendientes, 'propuesta', 'propuestas')} sin aplicar: ${plural(pendientes, 'queda', 'quedan')} en Historial. ¿Empezar una charla nueva?`;
      if (!window.confirm(texto)) return;
    }
    await acciones.nuevoChat();
    cercaDelFinal.current = true;
    document.getElementById('entrada-chat')?.focus();
  });

  if (!abierto) {
    return (
      <button type="button" className="chat-abrir" onClick={() => acciones.ui({ chatAbierto: true })}>
        <Icono de={MessageSquare} />
        Chat con Claude
      </button>
    );
  }

  const enviar = async () => {
    const texto = entrada.trim();
    if (respondiendo || !conv) return;
    if (!texto) {
      setFaltaTexto(true);
      caja.current?.focus();
      return;
    }
    setFaltaTexto(false);
    const pantalla = pantallaActual(s);
    cercaDelFinal.current = true;
    d({
      tipo: 'chat',
      datos: {
        entrada: '',
        respondiendo: true,
        parcial: '',
        herramientas: [],
        conv: { ...conv, mensajes: [...conv.mensajes, { rol: 'persona', texto, t: new Date().toISOString(), pantalla: { entregable: pantalla.entregable, nodo: pantalla.nodo } }] },
      },
    });
    try {
      await api(`/chat/${conv.id}/mensajes`, { metodo: 'POST', cuerpo: { texto, pantalla } });
    } catch (e) {
      d({ tipo: 'chat', datos: { respondiendo: false } });
      acciones.avisar(e.message);
    }
  };

  const ocultar = () => acciones.ui({ chatAbierto: false });

  const contexto = pantallaActual(s);
  const nodoActual = nombreNodo(s, contexto.entregable, contexto.nodo, contexto.nodoTitulo);
  const describedBy = [idAyuda, faltaTexto ? idFalta : null].filter(Boolean).join(' ');

  return (
    <aside
      className="chat"
      aria-label="Chat con Claude"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && angosto()) {
          e.stopPropagation();
          ocultar();
        }
      }}
    >
      <div className="chat-cabecera">
        <div>
          <h2>Chat con Claude</h2>
          <p className="chat-bajada">Pedile cambios con tus palabras. Antes de aplicar nada, te muestra qué cambia.</p>
        </div>
        <div className="chat-cabecera-acciones">
          <Boton
            soloIcono
            icono={MessageSquarePlus}
            enCurso={empezando}
            textoEnCurso="Empezando…"
            aria-disabled={respondiendo ? 'true' : undefined}
            title={respondiendo ? 'Esperá a que Claude termine de responder' : 'Nueva charla'}
            onClick={respondiendo ? undefined : nuevaCharla}
          >
            Nueva charla
          </Boton>
          <Boton soloIcono icono={PanelRightClose} onClick={ocultar}>
            Ocultar chat
          </Boton>
        </div>
      </div>
      <div className="chat-cuerpo">
        <div className="chat-mensajes" ref={lista} onScroll={medir} role="log" aria-label="Conversación" aria-busy={respondiendo ? 'true' : 'false'}>
          {!conv?.mensajes?.length && !respondiendo && <ChatVacio />}
          {conv?.mensajes?.map((m, i) => {
            const nodo = m.rol === 'persona' ? nombreNodo(s, m.pantalla?.entregable, m.pantalla?.nodo) : null;
            return (
              <div key={i} className={`mensaje mensaje-${m.rol}`}>
                {m.rol === 'persona' && m.pantalla?.entregable && (
                  <div className="mensaje-contexto">
                    <span className="visualmente-oculto">Sobre:</span>
                    <ChipContexto icono={ICONO_TIPO?.entregable}>{nombreEntregable(s, m.pantalla.entregable)}</ChipContexto>
                    {nodo && <ChipContexto icono={nodo.icono}>{nodo.texto}</ChipContexto>}
                  </div>
                )}
                {m.rol === 'claude' ? <Markdown>{m.texto}</Markdown> : <p>{m.texto}</p>}
                {m.herramientas?.length > 0 && (
                  <div className="herramientas">
                    {[...new Set(m.herramientas)].map((h) => (
                      <span key={h} className="chip">{NOMBRE_HERRAMIENTA[h] || 'usó una herramienta'}</span>
                    ))}
                  </div>
                )}
                {m.propuestas?.map((pid) => (
                  <TarjetaPropuesta
                    key={pid}
                    id={pid}
                    vigente={pid === ultimaPendiente}
                  />
                ))}
              </div>
            );
          })}
          {respondiendo && (
            <div className="mensaje mensaje-claude">
              {parcial ? (
                <Markdown>{parcial}</Markdown>
              ) : (
                <p className="chat-pensando">
                  <Icono de={LoaderCircle} className="icono-gira" />
                  Pensando…
                </p>
              )}
              {herramientas.length > 0 && (
                <div className="herramientas">
                  {[...new Set(herramientas)].map((h) => (
                    <span key={h} className="chip">{NOMBRE_HERRAMIENTA[h] || 'usó una herramienta'}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {hayNuevos && (
          <button type="button" className="chat-ir-final" onClick={irAlFinal}>
            <Icono de={ChevronDown} />
            Ir al último mensaje
          </button>
        )}
      </div>
      <div className="chat-entrada">
        <div className="chat-contexto">
          <span>Sobre:</span>
          {contexto.modo ? (
            <ChipContexto>Entregable nuevo</ChipContexto>
          ) : contexto.entregable ? (
            <>
              <ChipContexto icono={ICONO_TIPO?.entregable}>{nombreEntregable(s, contexto.entregable)}</ChipContexto>
              {nodoActual && <ChipContexto icono={nodoActual.icono}>{nodoActual.texto}</ChipContexto>}
              {contexto.borrador && <ChipContexto icono={Stamp}>último borrador</ChipContexto>}
              {s.ui.pagina !== 'visualizador' && <span className="chat-contexto-nota">(lo último que miraste)</span>}
            </>
          ) : (
            <ChipContexto>Inicio</ChipContexto>
          )}
        </div>
        <div className="chat-caja">
          <textarea
            id="entrada-chat"
            ref={caja}
            value={entrada}
            placeholder="Pedí un cambio…"
            rows={3}
            aria-label="Mensaje para Claude"
            aria-describedby={describedBy}
            aria-invalid={faltaTexto ? 'true' : undefined}
            onChange={(e) => {
              if (faltaTexto && e.target.value.trim()) setFaltaTexto(false);
              d({ tipo: 'chat', datos: { entrada: e.target.value } });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                enviar();
              }
            }}
          />
          <Boton variante={entrada.trim() ? 'primario' : 'secundario'} chico icono={Send} className="chat-enviar" enCurso={respondiendo} textoEnCurso="Respondiendo…" onClick={enviar}>
            Enviar
          </Boton>
        </div>
        <div className="chat-ayuda">
          <span id={idAyuda}>Enter envía · Shift+Enter agrega una línea</span>
          {faltaTexto && (
            <span id={idFalta} className="error-texto">
              Escribí qué querés cambiar
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
