import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useApp, useAccion, useBorrador, iguales } from '../estado.jsx';
import { api } from '../api.js';
import { textoHorario } from '@lib/horario.mjs';
import { EditorHorario, EditorDestino, Grupo, Campo } from '../componentes/Editores.jsx';
import Boton from '../componentes/Boton.jsx';
import AvisosEntregable from '../componentes/AvisosEntregable.jsx';
import { Icono, ICONO_FUENTE, ICONO_CONEXION, CalendarClock, Send, Plug, Play, Pencil, Plus, Workflow, TriangleAlert } from '../componentes/Iconos.jsx';
import { TEXTO_CONEXION, destinoHumano, nombreFuente, plural } from '../textos.js';

// Estado de conexión de una fuente, en las cuatro palabras del glosario.
function conexionDe(s, id) {
  const f = s.config?.fuentes?.[id];
  if (!f) return 'desconectada';
  if (f.activo === false) return 'apagada';
  const est = s.fuentes?.[id];
  if (!est) return 'desconocida';
  return est.conectada ? 'conectada' : 'desconectada';
}

// Recetas que aceptan opciones.periodo (dia | semana).
const RECETAS_CON_PERIODO = ['bitacora-reuniones'];

const TEXTO_CHIP = { desconectada: 'falta conectar', apagada: 'no se usa' };

function ChipFuente({ id, elegida, porDefecto, onAlternar }) {
  const { s } = useApp();
  const idMotivo = useId();
  const definida = Boolean(s.config.fuentes?.[id]);
  const conexion = conexionDe(s, id);
  const nombre = nombreFuente(s, id);
  const estado = definida ? TEXTO_CHIP[conexion] : null;
  return (
    <span className="chip-fuente-envoltura">
      <button
        type="button"
        className="chip-fuente"
        aria-pressed={elegida}
        aria-disabled={definida ? undefined : 'true'}
        aria-describedby={definida ? undefined : idMotivo}
        title={definida ? s.fuentes?.[id]?.detalle || undefined : 'No está en tu configuración: sumala desde Conectores'}
        onClick={() => definida && onAlternar()}
      >
        <Icono de={ICONO_FUENTE[id] || Plug} />
        {nombre}
        {estado && (
          <span className={`estado-chip ${conexion === 'apagada' ? 'no-se-usa' : 'falta'}`}>
            <Icono de={ICONO_CONEXION[conexion]} tam={14} />
            {estado}
          </span>
        )}
        {!porDefecto && <span className="mini-etiqueta">no la usa por defecto</span>}
        {!definida && <span id={idMotivo} className="mini-etiqueta">no está en tu configuración</span>}
      </button>
    </span>
  );
}

function TarjetaEntregable({ id, entrada, receta }) {
  const { s, acciones } = useApp();
  const [valor, setValor, { cambiado, desactualizado, conflictos, descartar, paraGuardar }] = useBorrador(`entregable:${id}`, entrada);
  const enFoco = s.ui.entregableEnFoco === id;
  // Prender o apagar desde esta misma tarjeta no cuenta como un cambio ajeno.
  const base = s.borradores?.[`entregable:${id}`]?.base;
  const cambioAjeno = desactualizado && (!base || Object.keys({ ...base, ...entrada }).some((k) => k !== 'activo' && !iguales(base[k], entrada[k])));
  const [abierto, setAbierto] = useState(enFoco || cambiado);
  const ref = useRef(null);
  const idEditor = useId();
  const idAyudaInterruptor = useId();

  useEffect(() => {
    if (!enFoco) return;
    setAbierto(true);
    ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [enFoco]);
  useEffect(() => {
    if (cambiado) setAbierto(true);
  }, [cambiado]);

  const nombre = entrada.nombre || receta?.nombre || id;
  const fuentesConfig = Object.keys(s.config.fuentes || {});
  const fuentesReceta = (receta?.fuentes || []).map((f) => f.id);
  const elegidas = valor.fuentes || fuentesReceta;
  const elegidasGuardadas = entrada.fuentes || fuentesReceta;
  const errores = s.validacion?.ok === false;

  const [guardar, guardando] = useAccion(async () => {
    const config = { ...s.config, entregables: { ...s.config.entregables, [id]: paraGuardar() } };
    if (await acciones.guardarConfig(config, `${nombre}: ajustes desde la interfaz`)) descartar();
  });
  const [alternarActivo, alternando] = useAccion(async () => {
    const activo = !entrada.activo;
    const config = { ...s.config, entregables: { ...s.config.entregables, [id]: { ...entrada, activo } } };
    if ((await acciones.guardarConfig(config, `${activo ? 'Prender' : 'Apagar'} ${nombre}`)) && cambiado) setValor({ ...valor, activo });
  });

  const alternarFuente = (f) => setValor({ ...valor, fuentes: elegidas.includes(f) ? elegidas.filter((x) => x !== f) : [...elegidas, f] });

  const motivoProbar = !entrada.activo ? 'Prendé este entregable para probarlo' : errores ? 'Hay errores en la configuración' : undefined;
  const clases = ['tarjeta', 'tarjeta-entregable', entrada.activo ? '' : 'apagada', enFoco ? 'en-foco' : ''].filter(Boolean).join(' ');

  return (
    <article ref={ref} className={clases} aria-labelledby={`${idEditor}-titulo`}>
      <div className="tarjeta-cabecera">
        <div className="titulo-entregable">
          <h2 id={`${idEditor}-titulo`} title={`Nombre técnico: ${id}`}>
            {nombre}
            {cambiado && <span className="etiqueta etiqueta-alerta"><Icono de={TriangleAlert} />Cambios sin guardar</span>}
          </h2>
          {receta?.descripcion && <p className="descripcion" title={receta.descripcion}>{receta.descripcion}</p>}
        </div>
        <div className="interruptor-con-ayuda">
          <label className="interruptor">
            <input
              type="checkbox"
              role="switch"
              checked={Boolean(entrada.activo)}
              aria-label={`Prender ${nombre}`}
              aria-describedby={idAyudaInterruptor}
              aria-busy={alternando || undefined}
              onChange={alternarActivo}
            />
            <span>{entrada.activo ? 'Prendido' : 'Apagado'}</span>
          </label>
          <span id={idAyudaInterruptor} className="ayuda-campo">Se guarda al instante</span>
        </div>
      </div>

      <AvisosEntregable id={id} variante="compacto" />

      <div className="pie-entregable">
        <p className="fila-meta">
          <span><Icono de={CalendarClock} />{textoHorario(entrada.horario)}</span>
          <span><Icono de={Send} />{destinoHumano(entrada.destino).titulo}</span>
          <span className="num"><Icono de={Plug} />{elegidasGuardadas.length} {plural(elegidasGuardadas.length, 'fuente', 'fuentes')}</span>
        </p>
        <div className="acciones">
          <Boton
            chico
            icono={Play}
            enCurso={Boolean(s.ui.iniciando?.[id])}
            textoEnCurso="Iniciando…"
            motivo={motivoProbar}
            onClick={() => acciones.probar(id)}
          >
            Probar ahora
          </Boton>
          <Boton chico icono={Workflow} onClick={() => acciones.ir('visualizador', { vista: 'entregable', entregable: id })}>Ver flujo</Boton>
          <Boton chico variante="texto" icono={Pencil} aria-expanded={abierto} aria-controls={idEditor} onClick={() => setAbierto(!abierto)}>
            Editar
          </Boton>
        </div>
      </div>

      {abierto && (
        <div id={idEditor} className="editor-entregable">
          {cambioAjeno && (
            <div className="banner banner-alerta" role="status">
              <span>
                Mientras editabas cambió la configuración (por ejemplo, se aplicó un cambio del chat). Al guardar se conservan los dos cambios.
                {conflictos?.length > 0 && ` En ${conflictos.map((k) => ({ fuentes: 'las fuentes', opciones: 'el período', horario: 'el horario', destino: 'el destino', activo: 'el encendido' }[k] || k)).join(', ')} queda lo tuyo.`}
              </span>
            </div>
          )}
          <Grupo etiqueta="Lee de" ayuda="Tocá una fuente para sumarla o sacarla de este entregable.">
            <div className="chips-fuente">
              {[...new Set([...fuentesReceta, ...fuentesConfig])].map((f) => (
                <ChipFuente key={f} id={f} elegida={elegidas.includes(f)} porDefecto={fuentesReceta.includes(f)} onAlternar={() => alternarFuente(f)} />
              ))}
            </div>
          </Grupo>
          {RECETAS_CON_PERIODO.includes(entrada.receta) && (
            <Campo etiqueta="Período" ayuda="Si la armás por día, cuenta las reuniones de hoy; por semana, las de los últimos 7 días." className="campo-periodo">
              {(p) => (
                <select
                  {...p}
                  value={valor.opciones?.periodo || 'semana'}
                  onChange={(e) => setValor({ ...valor, opciones: { ...valor.opciones, periodo: e.target.value } })}
                >
                  <option value="dia">Por día</option>
                  <option value="semana">Por semana</option>
                </select>
              )}
            </Campo>
          )}
          <EditorHorario horario={valor.horario} onChange={(horario) => setValor({ ...valor, horario })} />
          <EditorDestino destino={valor.destino} onChange={(destino) => setValor({ ...valor, destino })} />
          {cambiado && (
            <div className="barra-sin-guardar">
              <span className="texto-sin-guardar"><Icono de={TriangleAlert} />Tenés cambios sin guardar</span>
              <Boton variante="texto" onClick={descartar}>Deshacer cambios</Boton>
              <Boton variante="primario" enCurso={guardando} textoEnCurso="Guardando…" onClick={guardar}>Guardar</Boton>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function Rutinas() {
  const { s, acciones } = useApp();
  const [plan, setPlan] = useState(null);
  const [ver, viendo] = useAccion(async () => {
    try {
      setPlan(await api('/rutinas/plan'));
    } catch (e) {
      acciones.avisar(e.message);
    }
  });
  const [aplicar, aplicando] = useAccion(async () => {
    if (!window.confirm(`${plan.explicacion}\n\n¿Programar ${plan.tareas.length} rutinas en esta computadora?`)) return;
    try {
      const r = await api('/rutinas/aplicar', { metodo: 'POST', cuerpo: { confirmado: true } });
      acciones.avisar(`Rutinas programadas: ${r.filter((x) => x.ok).length} de ${r.length}.`, r.every((x) => x.ok) ? 'ok' : 'error');
    } catch (e) {
      acciones.avisar(e.message);
    }
  });
  return (
    <section className="tarjeta">
      <h2>Rutinas programadas</h2>
      <p className="meta">Cada entregable con horario puede correr solo en tu computadora y dejar su borrador acá. Primero ves el plan; nada se programa sin tu OK.</p>
      <div className="acciones">
        <Boton enCurso={viendo} textoEnCurso="Armando el plan…" onClick={ver}>Ver el plan</Boton>
        {plan && (
          <Boton variante="primario" enCurso={aplicando} textoEnCurso="Programando…" motivo={s.demo ? 'En la demo no se programan rutinas' : undefined} onClick={aplicar}>
            Programar
          </Boton>
        )}
      </div>
      {plan && (
        <div className="plan">
          <p>{plan.explicacion}</p>
          <p className="meta">{plan.requisitos}</p>
          <ul className="lista-codigo">{plan.tareas.map((t) => <li key={t.id}><b>{t.nombre}</b> · {textoHorario(t)}</li>)}</ul>
          <details className="detalle-tecnico">
            <summary>Detalle técnico</summary>
            <ul className="lista-codigo">{plan.tareas.map((t) => <li key={t.id}><code>{t.comando}</code></li>)}</ul>
          </details>
        </div>
      )}
    </section>
  );
}

export default function Entregables() {
  const { s, acciones } = useApp();
  const entradas = Object.entries(s.config?.entregables || {});
  // Los módulos que se activan solos (por ejemplo, según el origen de las tareas) no tienen interruptor.
  const modulos = useMemo(() => (s.modulos || []).filter((m) => !m.activo_si), [s.modulos]);
  return (
    <div className="pagina">
      <header className="cabecera">
        <div>
          <h1>Entregables</h1>
          <p className="bajada">Prendé y apagá cada uno, elegí de dónde lee, cuándo corre y a dónde va. Cada cambio queda en el historial.</p>
        </div>
        <Boton variante="primario" icono={Plus} onClick={() => acciones.ir('asistente')}>Nuevo entregable</Boton>
      </header>
      <div className="tarjetas">
        {entradas.map(([id, e]) => <TarjetaEntregable key={id} id={id} entrada={e} receta={s.recetas[e.receta]?.receta} />)}
      </div>
      <section className="tarjeta">
        <h2>Módulos opcionales</h2>
        <p className="meta">Vueltas de tuerca que se suman al flujo. Vienen apagados.</p>
        {modulos.map((m) => {
          const activo = Boolean(s.config?.modulos?.[m.clave]?.activo);
          return (
            <div key={m.clave} className={`modulo ${activo ? '' : 'apagado'}`}>
              <div>
                <b>{m.nombre}</b>
                <div className="meta">{m.descripcion}</div>
              </div>
              <label className="interruptor">
                <input type="checkbox" role="switch" checked={activo} aria-label={`Usar el módulo ${m.nombre}`} onChange={() => acciones.modulo(m.clave, !activo)} />
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
