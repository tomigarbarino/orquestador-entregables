import { useEffect, useState } from 'react';
import { useApp } from '../estado.jsx';
import { api } from '../api.js';

export default function Historial() {
  const { s, acciones } = useApp();
  const [commits, setCommits] = useState([]);
  const cargar = () => api('/historial').then(setCommits).catch((e) => acciones.avisar(e.message));
  useEffect(() => {
    cargar();
  }, [s.configTexto, s.propuestas.length]);

  const deshacer = async (c) => {
    if (!window.confirm(`¿Deshacer "${c.mensaje}"? Se crea un cambio nuevo que lo revierte.`)) return;
    try {
      await api(`/historial/${c.sha}/deshacer`, { metodo: 'POST' });
      acciones.avisar('Cambio deshecho.', 'ok');
      cargar();
    } catch (e) {
      acciones.avisar(e.message);
    }
  };

  const pendientes = s.propuestas.filter((p) => p.estado === 'pendiente');
  return (
    <div className="pagina">
      <header className="cabecera">
        <div>
          <h1>Historial</h1>
          <p className="bajada">Cada cambio de tu config y tus recetas queda versionado con git en tu espacio. Podés deshacer cualquiera.</p>
        </div>
      </header>
      {pendientes.length > 0 && (
        <section className="tarjeta">
          <h3>Propuestas pendientes</h3>
          {pendientes.map((p) => (
            <div key={p.id} className="fila-historial">
              <div>
                <b>{p.motivo}</b>
                <div className="tenue chico">{new Date(p.fecha).toLocaleString('es-AR')} · {p.origen} · {p.diffs.map((d) => d.archivo).join(', ')}</div>
              </div>
              <div className="acciones">
                <button className="boton chico" onClick={() => acciones.ui({ pagina: 'visualizador', propuestaEnFoco: p.id })}>Ver en el flujo</button>
                <button className="boton chico" onClick={() => acciones.descartarPropuesta(p.id)}>Descartar</button>
                <button className="boton primario chico" onClick={() => acciones.aplicarPropuesta(p.id)}>Aplicar</button>
              </div>
            </div>
          ))}
        </section>
      )}
      <section className="tarjeta">
        <h3>Cambios aplicados</h3>
        {commits.map((c, i) => (
          <div key={c.sha} className="fila-historial">
            <div>
              <b>{c.mensaje}</b>
              <div className="tenue chico">{new Date(c.fecha).toLocaleString('es-AR')} · <code>{c.corto}</code></div>
            </div>
            {i < commits.length - 1 && <button className="boton chico" onClick={() => deshacer(c)}>Deshacer</button>}
          </div>
        ))}
      </section>
      <section className="tarjeta">
        <h3>Corridas recientes</h3>
        {s.listaCorridas.slice(0, 12).map((m) => (
          <div key={m.id} className="fila-historial">
            <div>
              <b>{m.entregable}</b> <span className={`etiqueta etiqueta-${m.estado}`}>{m.estado}</span> {m.aprobada && <span className="etiqueta etiqueta-ok">aprobada</span>}
              <div className="tenue chico">{new Date(m.inicio).toLocaleString('es-AR')} · {m.origen}</div>
            </div>
            <button className="boton chico" onClick={() => { acciones.cargarCorrida(m.id); acciones.ui({ pagina: 'visualizador', vista: 'entregable', entregable: m.entregable, corridaPorEntregable: { ...s.ui.corridaPorEntregable, [m.entregable]: m.id } }); }}>Ver</button>
          </div>
        ))}
      </section>
    </div>
  );
}
