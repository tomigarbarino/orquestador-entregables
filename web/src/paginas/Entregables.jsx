import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../estado.jsx';
import { api } from '../api.js';
import { textoHorario } from '@lib/horario.mjs';
import { EditorHorario, EditorDestino } from '../componentes/Editores.jsx';
import { nombreDestino } from '@lib/receta-efectiva.mjs';

const copia = (x) => JSON.parse(JSON.stringify(x));

function TarjetaEntregable({ id, entrada, receta }) {
  const { s, acciones } = useApp();
  const [borrador, setBorrador] = useState(copia(entrada));
  useEffect(() => setBorrador(copia(entrada)), [JSON.stringify(entrada)]);
  const cambiado = JSON.stringify(borrador) !== JSON.stringify(entrada);
  const fuentesConfig = Object.keys(s.config.fuentes || {});
  const fuentesReceta = (receta?.fuentes || []).map((f) => f.id);
  const elegidas = borrador.fuentes || fuentesReceta;

  const guardar = async () => {
    const config = copia(s.config);
    config.entregables[id] = borrador;
    await acciones.guardarConfig(config, `Entregable ${id}: ajustes desde la interfaz`);
  };
  const alternarActivo = async () => {
    const config = copia(s.config);
    config.entregables[id] = { ...entrada, activo: !entrada.activo };
    await acciones.guardarConfig(config, `${entrada.activo ? 'Apagar' : 'Prender'} ${id}`);
  };

  return (
    <div className={`tarjeta ${entrada.activo ? '' : 'apagada'} ${s.ui.entregable === id ? 'resaltada' : ''}`}>
      <div className="tarjeta-cabecera">
        <div>
          <h3>{entrada.nombre || receta?.nombre || id}</h3>
          <div className="tenue">{receta?.descripcion}</div>
          <div className="tenue chico">{textoHorario(entrada.horario)} · {nombreDestino(entrada.destino)} · receta <code>{entrada.receta}</code></div>
        </div>
        <label className="interruptor">
          <input type="checkbox" checked={entrada.activo} onChange={alternarActivo} />
          <span>{entrada.activo ? 'Prendido' : 'Apagado'}</span>
        </label>
      </div>
      <div className="campo">
        <label>Fuentes</label>
        <div className="opciones">
          {[...new Set([...fuentesReceta, ...fuentesConfig])].map((f) => {
            const est = s.fuentes?.[f];
            const definida = Boolean(s.config.fuentes?.[f]);
            return (
              <label key={f} className={`opcion ${definida ? '' : 'deshabilitada'}`} title={est?.detalle || (definida ? '' : 'No está definida en la config')}>
                <input
                  type="checkbox"
                  disabled={!definida}
                  checked={elegidas.includes(f)}
                  onChange={(e) => setBorrador({ ...borrador, fuentes: e.target.checked ? [...elegidas, f] : elegidas.filter((x) => x !== f) })}
                />
                <span className={`conexion conexion-${est?.conectada ? 'conectada' : 'desconectada'}`}><i /></span>
                {s.catalogo?.fuentes?.[f]?.nombre || f}
                {fuentesReceta.includes(f) ? '' : <span className="tenue chico"> (extra)</span>}
              </label>
            );
          })}
        </div>
      </div>
      <EditorHorario horario={borrador.horario} onChange={(horario) => setBorrador({ ...borrador, horario })} />
      <EditorDestino destino={borrador.destino} onChange={(destino) => setBorrador({ ...borrador, destino })} />
      <div className="acciones">
        <button className="boton" onClick={() => acciones.ui({ pagina: 'visualizador', vista: 'entregable', entregable: id, nodo: null })}>Ver flujo</button>
        <button className="boton" disabled={!entrada.activo || !s.validacion?.ok} onClick={() => acciones.probar(id)}>Probar ahora</button>
        {cambiado && <button className="boton" onClick={() => setBorrador(copia(entrada))}>Deshacer cambios</button>}
        <button className="boton primario" disabled={!cambiado} onClick={guardar}>Guardar</button>
      </div>
    </div>
  );
}

function Rutinas() {
  const { s, acciones } = useApp();
  const [plan, setPlan] = useState(null);
  const ver = async () => {
    try {
      setPlan(await api('/rutinas/plan'));
    } catch (e) {
      acciones.avisar(e.message);
    }
  };
  const aplicar = async () => {
    if (!window.confirm(`${plan.explicacion}\n\n¿Programar ${plan.tareas.length} rutinas en esta computadora?`)) return;
    try {
      const r = await api('/rutinas/aplicar', { metodo: 'POST', cuerpo: { confirmado: true } });
      acciones.avisar(`Rutinas programadas: ${r.filter((x) => x.ok).length} de ${r.length}.`, r.every((x) => x.ok) ? 'ok' : 'error');
    } catch (e) {
      acciones.avisar(e.message);
    }
  };
  return (
    <section className="tarjeta">
      <h3>Rutinas programadas</h3>
      <p className="tenue">Cada entregable con horario puede correr solo en tu computadora y dejar su borrador acá. Primero ves el plan; nada se programa sin tu OK.</p>
      <div className="acciones">
        <button className="boton" onClick={ver}>Ver el plan</button>
        {plan && !s.demo && <button className="boton primario" onClick={aplicar}>Programar</button>}
      </div>
      {plan && (
        <div className="plan">
          <p>{plan.explicacion}</p>
          <p className="tenue">{plan.requisitos}</p>
          <ul className="lista-codigo">{plan.tareas.map((t) => <li key={t.id}><b>{t.nombre}</b> · {textoHorario(t)}<br /><code>{t.comando}</code></li>)}</ul>
        </div>
      )}
    </section>
  );
}

export default function Entregables() {
  const { s, acciones } = useApp();
  const entradas = Object.entries(s.config?.entregables || {});
  const modulos = useMemo(() => s.modulos || [], [s.modulos]);
  return (
    <div className="pagina">
      <header className="cabecera">
        <div>
          <h1>Entregables</h1>
          <p className="bajada">Prendé y apagá cada uno, elegí sus fuentes, cuándo corre y a dónde va. Cada cambio queda en el historial.</p>
        </div>
        <button className="boton primario" onClick={() => acciones.ir('asistente')}>Sumar un entregable</button>
      </header>
      <div className="tarjetas">
        {entradas.map(([id, e]) => <TarjetaEntregable key={id} id={id} entrada={e} receta={s.recetas[e.receta]?.receta} />)}
      </div>
      <section className="tarjeta">
        <h3>Módulos opcionales</h3>
        <p className="tenue">Vueltas de tuerca que se suman al flujo. Vienen apagados.</p>
        {modulos.map((m) => {
          const activo = Boolean(s.config?.modulos?.[m.clave]?.activo);
          return (
            <div key={m.clave} className="modulo">
              <div>
                <b>{m.nombre}</b>
                <div className="tenue">{m.descripcion}</div>
              </div>
              <label className="interruptor">
                <input type="checkbox" checked={activo} onChange={() => acciones.modulo(m.clave, !activo)} />
                <span>{activo ? 'Activo' : 'Apagado'}</span>
              </label>
            </div>
          );
        })}
      </section>
      <Rutinas />
    </div>
  );
}
