import { useEffect, useState } from 'react';
import { useApp, useAccion } from '../estado.jsx';
import { api } from '../api.js';
import Boton from '../componentes/Boton.jsx';
import Vacio from '../componentes/Vacio.jsx';
import { Undo2 } from 'lucide-react';
import { Icono, ICONO_PRUEBA, Check, Eye, FileCheck, FileText, Play } from '../componentes/Iconos.jsx';
import {
  ESTADO_PRUEBA,
  ORIGEN_PRUEBA,
  ORIGEN_PROPUESTA,
  origenHumano,
  nombreEntregable,
  fechaHora,
  haceCuanto,
  archivoHumano,
  entregableSugerido,
  entregableDePropuesta,
} from '../textos.js';

function FilaPropuesta({ p }) {
  const { s, acciones } = useApp();
  const [aplicar, aplicando] = useAccion(() => acciones.aplicarPropuesta(p.id));
  const archivos = [...new Set((p.diffs || []).map((d) => archivoHumano(d.archivo, s)))];
  const verEnFlujo = () => {
    const entregable = entregableDePropuesta(p, s);
    acciones.ir('visualizador', entregable ? { vista: 'entregable', entregable, propuestaEnFoco: p.id } : { vista: 'general', propuestaEnFoco: p.id });
  };
  return (
    <div className="fila-historial">
      <div>
        <span className="titulo-fila">{p.motivo}</span>
        <span className="meta">
          <span className="num" title={fechaHora(p.fecha)}>{haceCuanto(p.fecha) || fechaHora(p.fecha)}</span>
          {' · '}{origenHumano(ORIGEN_PROPUESTA, p.origen)}
          {archivos.length > 0 && ` · Cambia: ${archivos.join(', ')}`}
        </span>
      </div>
      <div className="acciones">
        <Boton chico icono={Eye} onClick={verEnFlujo}>Ver en el flujo</Boton>
        <Boton chico variante="peligro" onClick={() => acciones.descartarPropuesta(p.id)}>Descartar</Boton>
        <Boton chico variante="primario" icono={Check} enCurso={aplicando} textoEnCurso="Aplicando…" onClick={aplicar}>Aplicar el cambio</Boton>
      </div>
    </div>
  );
}

function FilaBorrador({ m }) {
  const { s, acciones } = useApp();
  const ver = () => {
    acciones.cargarCorrida(m.id);
    acciones.ir('visualizador', {
      vista: 'entregable',
      entregable: m.entregable,
      corridaPorEntregable: { ...s.ui.corridaPorEntregable, [m.entregable]: m.id },
    });
  };
  const estado = ESTADO_PRUEBA[m.estado] || 'Sin estado';
  return (
    <div className="fila-historial">
      <div>
        <span className="titulo-fila">
          {nombreEntregable(s, m.entregable)}
          <span className={`etiqueta etiqueta-${m.estado}`}>
            <Icono de={ICONO_PRUEBA[m.estado]} className={m.estado === 'en_curso' ? 'icono-gira' : undefined} />
            {estado}
          </span>
          {m.aprobada && (
            <span className="etiqueta etiqueta-ok"><Icono de={FileCheck} />Aprobado</span>
          )}
        </span>
        <span className="meta">
          <span className="num" title={fechaHora(m.inicio)}>{haceCuanto(m.inicio) || fechaHora(m.inicio)}</span>
          {' · '}{origenHumano(ORIGEN_PRUEBA, m.origen)}
        </span>
      </div>
      <Boton chico onClick={ver}>Ver borrador</Boton>
    </div>
  );
}

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

  const sugerido = entregableSugerido(s);
  const [probar, iniciandoPrueba] = useAccion(() => acciones.probar(sugerido));
  const pendientes = s.propuestas.filter((p) => p.estado === 'pendiente');
  const borradores = s.listaCorridas.slice(0, 12);

  return (
    <div className="pagina">
      <header className="cabecera">
        <div>
          <h1>Historial</h1>
          <p className="bajada">Cada cambio queda guardado y lo podés deshacer.</p>
        </div>
      </header>

      {pendientes.length > 0 && (
        <section className="tarjeta">
          <h2>Propuestas pendientes</h2>
          <p className="meta">Cambios que Claude propuso y todavía no aplicaste.</p>
          {pendientes.map((p) => <FilaPropuesta key={p.id} p={p} />)}
        </section>
      )}

      <section className="tarjeta">
        <h2>Borradores recientes</h2>
        {borradores.length === 0 ? (
          <Vacio
            icono={FileText}
            titulo="Todavía no probaste ningún entregable"
            accion={sugerido && (
              <Boton
                variante="primario"
                icono={Play}
                enCurso={iniciandoPrueba || Boolean(s.ui.iniciando?.[sugerido])}
                textoEnCurso="Iniciando…"
                onClick={probar}
              >
                {`Probar ${nombreEntregable(s, sugerido)}`}
              </Boton>
            )}
          >
            Los borradores aparecen acá.
          </Vacio>
        ) : (
          borradores.map((m) => <FilaBorrador key={m.id} m={m} />)
        )}
      </section>

      <section className="tarjeta">
        <h2>Cambios aplicados</h2>
        {commits.length === 0 && <p className="meta">Todavía no hay cambios guardados.</p>}
        {commits.map((c, i) => (
          <div key={c.sha} className="fila-historial">
            <div>
              <span className="titulo-fila">{c.mensaje}</span>
              <span className="meta num" title={`Versión ${c.corto || c.sha}`}>{fechaHora(c.fecha)}</span>
            </div>
            {i < commits.length - 1 && (
              <Boton chico icono={Undo2} onClick={() => deshacer(c)} aria-label={`Deshacer: ${c.mensaje}`}>Deshacer</Boton>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
