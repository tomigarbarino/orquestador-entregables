import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { useApp, pantallaActual } from '../estado.jsx';
import { api } from '../api.js';
import Diferencias from './Diferencias.jsx';

const NOMBRE_HERRAMIENTA = {
  ver_config: 'leyó tu config',
  ver_receta: 'leyó una receta',
  listar_recetas: 'listó las recetas',
  estado: 'revisó las conexiones',
  proponer_cambio: 'propuso un cambio',
};

function TarjetaPropuesta({ id }) {
  const { s, acciones } = useApp();
  const [verTexto, setVerTexto] = useState(false);
  const p = s.propuestas.find((x) => x.id === id);
  if (!p) return null;
  const entregable = s.ui.entregable;
  return (
    <div className={`tarjeta-propuesta estado-${p.estado}`}>
      <div className="tarjeta-titulo">Propuesta · {p.motivo}</div>
      <div className="tenue">{p.diffs.map((d) => d.archivo).join(' · ') || 'sin cambios de texto'}</div>
      {p.regla?.texto && <div className="regla-nueva">Regla nueva en {p.regla.receta}: “{p.regla.texto}”</div>}
      {p.estado === 'invalida' && <div className="error-texto">{p.errores.map((e) => `${e.ruta}: ${e.mensaje}`).join('; ')}</div>}
      <div className="acciones">
        <button className="boton chico" onClick={() => setVerTexto(!verTexto)}>{verTexto ? 'Ocultar' : 'Texto'}</button>
        {p.estado === 'pendiente' && (
          <>
            <button className="boton chico" onClick={() => acciones.ui({ pagina: 'visualizador', propuestaEnFoco: p.id })}>Ver en el flujo</button>
            <button className="boton chico" onClick={() => acciones.descartarPropuesta(p.id)}>Descartar</button>
            <button className="boton primario chico" onClick={() => acciones.aplicarPropuesta(p.id)}>Aplicar</button>
          </>
        )}
        {p.estado === 'aplicada' && (
          <>
            <span className="etiqueta etiqueta-ok">Aplicada</span>
            {entregable && <button className="boton primario chico" onClick={() => acciones.probar(entregable)}>Probar de nuevo</button>}
          </>
        )}
        {p.estado === 'descartada' && <span className="etiqueta">Descartada</span>}
      </div>
      {verTexto && <Diferencias diffs={p.diffs} />}
    </div>
  );
}

export default function Chat() {
  const { s, d, acciones } = useApp();
  const fin = useRef(null);
  const { conv, respondiendo, parcial, herramientas, entrada } = s.chat;

  useEffect(() => {
    fin.current?.scrollIntoView({ block: 'end' });
  }, [conv?.mensajes?.length, parcial, herramientas.length]);

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

  if (!s.ui.chatAbierto) {
    return <button className="chat-abrir" onClick={() => acciones.ui({ chatAbierto: true })}>Chat con Claude</button>;
  }

  const enviar = async () => {
    const texto = entrada.trim();
    if (!texto || respondiendo || !conv) return;
    const pantalla = pantallaActual(s);
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

  const contexto = pantallaActual(s);
  return (
    <aside className="chat">
      <div className="chat-cabecera">
        <div>
          <b>Chat con Claude</b>
          <div className="tenue chico">Ajusta tus recetas y tu config. Muestra cada cambio antes de aplicarlo.</div>
        </div>
        <div className="acciones">
          <button className="boton chico" onClick={acciones.nuevoChat} disabled={respondiendo}>Nuevo</button>
          <button className="boton chico" onClick={() => acciones.ui({ chatAbierto: false })}>Ocultar</button>
        </div>
      </div>
      <div className="chat-mensajes">
        {!conv?.mensajes?.length && !respondiendo && (
          <div className="chat-vacio">
            <p>Probá un entregable, leé el borrador y pedí cambios como:</p>
            {['Esto sobra, que el guion sea más corto', 'Sumá los tickets de Jira a la daily', 'Quiero sumar un entregable nuevo'].map((t) => (
              <button key={t} className="sugerencia" onClick={() => d({ tipo: 'chat', datos: { entrada: t } })}>{t}</button>
            ))}
          </div>
        )}
        {conv?.mensajes?.map((m, i) => (
          <div key={i} className={`mensaje mensaje-${m.rol}`}>
            {m.rol === 'persona' && m.pantalla?.entregable && <div className="mensaje-contexto">{m.pantalla.entregable}{m.pantalla.nodo ? ` · ${m.pantalla.nodo}` : ''}</div>}
            {m.rol === 'claude' ? <Markdown>{m.texto}</Markdown> : <p>{m.texto}</p>}
            {m.herramientas?.length > 0 && <div className="herramientas">{[...new Set(m.herramientas)].map((h) => <span key={h} className="chip">{NOMBRE_HERRAMIENTA[h] || h}</span>)}</div>}
            {m.propuestas?.map((pid) => <TarjetaPropuesta key={pid} id={pid} />)}
          </div>
        ))}
        {respondiendo && (
          <div className="mensaje mensaje-claude">
            {parcial ? <Markdown>{parcial}</Markdown> : <p className="tenue"><span className="girando" /> Pensando…</p>}
            {herramientas.length > 0 && <div className="herramientas">{[...new Set(herramientas)].map((h) => <span key={h} className="chip">{NOMBRE_HERRAMIENTA[h] || h}</span>)}</div>}
          </div>
        )}
        <div ref={fin} />
      </div>
      <div className="chat-entrada">
        <div className="chat-contexto tenue chico">
          Contexto: {contexto.entregable || 'vista general'}{contexto.nodoTitulo ? ` · ${contexto.nodoTitulo}` : ''}{contexto.borrador ? ' · último borrador' : ''}
        </div>
        <textarea
          id="entrada-chat"
          value={entrada}
          placeholder="Pedí un cambio…"
          rows={3}
          onChange={(e) => d({ tipo: 'chat', datos: { entrada: e.target.value } })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
        />
        <button className="boton primario" onClick={enviar} disabled={respondiendo || !entrada.trim()}>{respondiendo ? 'Respondiendo…' : 'Enviar'}</button>
      </div>
    </aside>
  );
}
