import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useApp, useAccion, useBorrador } from '../estado.jsx';
import { api } from '../api.js';
import { generarEntregable, configConEntregable } from '@lib/asistente.mjs';
import { grafoEntregable } from '@lib/grafo.mjs';
import { textoHorario } from '@lib/horario.mjs';
import Flujo from '../componentes/Flujo.jsx';
import Diferencias from '../componentes/Diferencias.jsx';
import Boton from '../componentes/Boton.jsx';
import { Campo, Grupo, EditorHorario, EditorDestino } from '../componentes/Editores.jsx';
import {
  Icono,
  ICONO_FUENTE,
  ICONO_CONEXION,
  CalendarClock,
  Check,
  FileText,
  MessagesSquare,
  Pencil,
  Plug,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  X,
} from '../componentes/Iconos.jsx';
import { TEXTO_CONEXION, destinoHumano, nombreFuente, plural } from '../textos.js';

const PASOS = [
  { titulo: 'Qué armás siempre igual', ayuda: 'Ese informe, mail o presentación que hacés a mano todas las semanas.' },
  { titulo: 'De dónde sale cada dato', ayuda: 'Marcá las fuentes y escribí qué buscás en cada una. Sin fuentes no hay evidencia.' },
  { titulo: 'Reglas de formato y tono', ayuda: 'Largo, tono, qué no decir. Tus reglas generales del perfil ya se suman solas.' },
  { titulo: 'Cuándo corre y a dónde va', ayuda: 'Siempre sale como borrador: nada se manda sin tu OK.' },
];

// Memoizado a nivel de módulo: useBorrador compara contra este original.
const INICIAL = {
  nombre: '',
  que_armas: '',
  formato: '',
  ejemplo: '',
  fuentes: [],
  reglas_formato: [''],
  reglas_tono: [''],
  control: [],
  horario: { dias: ['vie'], hora: '17:00' },
  destino: { tipo: 'borrador' },
  propuestaId: null,
};

function conexionDe(s, id) {
  const f = s.config?.fuentes?.[id];
  if (!f) return 'desconectada';
  if (f.activo === false) return 'apagada';
  const est = s.fuentes?.[id];
  if (!est) return 'desconocida';
  return est.conectada ? 'conectada' : 'desconectada';
}

function Lista({ titulo, tipo, agregar, items, onChange, placeholder }) {
  return (
    <Grupo etiqueta={titulo}>
      <div className="lista-editable" style={{ '--columnas': 'minmax(0, 1fr)' }}>
        {items.map((t, i) => (
          <div key={i} className="fila-lista">
            <input aria-label={`${tipo} ${i + 1}`} value={t} placeholder={placeholder} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
            <button type="button" className="boton solo-icono" aria-label={`Quitar ${tipo} ${i + 1}`} title={`Quitar ${tipo} ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <Icono de={X} />
            </button>
          </div>
        ))}
        <button type="button" className="boton chico boton-agregar" onClick={() => onChange([...items, ''])}>
          <Icono de={Plus} />{agregar}
        </button>
      </div>
    </Grupo>
  );
}

function Resumen({ generado, propuesta, onCrear, creando, onSeguir }) {
  const { s } = useApp();
  const titulo = useRef(null);
  useEffect(() => {
    titulo.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    titulo.current?.focus({ preventScroll: true });
  }, [propuesta.id]);
  const r = generado.receta;
  const nFormato = (generado.reglasFormato || []).length;
  const nTono = (generado.reglasTono || []).length;
  const nControl = r.control.length;
  return (
    <section className="tarjeta resumen-entregable" aria-labelledby="titulo-resumen">
      <h2 id="titulo-resumen" ref={titulo} tabIndex={-1}>Así va a quedar tu entregable</h2>
      <div className="acciones">
        <Boton variante="primario" icono={Check} enCurso={creando} textoEnCurso="Creando…" onClick={onCrear}>Crear el entregable</Boton>
        <Boton icono={Pencil} onClick={onSeguir}>Seguir editando</Boton>
      </div>
      <ul>
        <li>
          <Icono de={FileText} />
          <div>
            <span className="rotulo">Nombre y qué es</span>
            <b>{r.nombre}</b> · {r.descripcion}
          </div>
        </li>
        <li>
          <Icono de={CalendarClock} />
          <div>
            <span className="rotulo">Cuándo corre</span>
            {textoHorario(generado.entrada.horario)}
          </div>
        </li>
        <li>
          <Icono de={Plug} />
          <div>
            <span className="rotulo">Lee de</span>
            <div className="chips-fuente">
              {r.fuentes.map((f) => {
                const k = conexionDe(s, f.id);
                return (
                  <span key={f.id} className="chip-lee" title={f.para}>
                    <Icono de={ICONO_FUENTE[f.id] || Plug} />
                    {nombreFuente(s, f.id)}
                    <span className={`conexion conexion-${k}`}><Icono de={ICONO_CONEXION[k]} tam={14} />{TEXTO_CONEXION[k]}</span>
                  </span>
                );
              })}
            </div>
          </div>
        </li>
        <li>
          <Icono de={ShieldCheck} />
          <div>
            <span className="rotulo">Reglas</span>
            <span className="num">{nFormato} de formato, {nTono} de tono, {nControl} de control</span>
          </div>
        </li>
        <li>
          <Icono de={Send} />
          <div>
            <span className="rotulo">Se entrega en</span>
            {destinoHumano(generado.entrada.destino).titulo}, siempre como borrador
          </div>
        </li>
      </ul>
      <details className="detalle-tecnico">
        <summary>Ver los archivos que se crean (detalle técnico)</summary>
        <Diferencias diffs={propuesta.diffs} />
      </details>
    </section>
  );
}

export default function Asistente() {
  const { s, acciones, validadores } = useApp();
  const [f, setF, { descartar }] = useBorrador('asistente', INICIAL);
  const [paso, setPaso] = useState(0);
  const [errores, setErrores] = useState({});
  const [propuestaLocal, setPropuestaLocal] = useState(null);
  const tituloPaso = useRef(null);
  const primerRender = useRef(true);
  const ids = { fuentes: useId() };
  const cerrando = useRef(false);

  const nombresFuentes = useMemo(() => Object.fromEntries(Object.entries(s.catalogo?.fuentes || {}).map(([id, x]) => [id, x.nombre])), [s.catalogo]);
  const datos = useMemo(() => {
    const { propuestaId, ...resto } = f;
    return resto;
  }, [f]);
  const generado = useMemo(() => {
    const g = generarEntregable(datos);
    g.reglasFormato = datos.reglas_formato.map((x) => x.trim()).filter(Boolean);
    g.reglasTono = datos.reglas_tono.map((x) => x.trim()).filter(Boolean);
    return g;
  }, [datos]);
  const existe = Boolean(s.recetas[generado.id] || s.config?.entregables?.[generado.id]);
  const grafo = useMemo(() => {
    const config = configConEntregable(s.config, generado, s.catalogo);
    const recetas = { ...s.recetas, [generado.id]: { id: generado.id, origen: 'propia', receta: generado.receta, instrucciones: generado.instrucciones } };
    return grafoEntregable({ entregableId: generado.id, config, recetas, modulos: s.modulos, estadoFuentes: s.fuentes, nombresFuentes, disposicion: 'angosta', compacto: true });
  }, [generado, s.config, s.recetas, s.modulos, s.fuentes, s.catalogo, nombresFuentes]);
  const validacion = validadores ? validadores.receta(generado.receta) : { ok: true, errores: [] };

  // La propuesta pendiente: la que vino del servidor (s.propuestas) o la recién creada.
  const propuesta = f.propuestaId
    ? s.propuestas.find((p) => p.id === f.propuestaId) || (propuestaLocal?.id === f.propuestaId ? propuestaLocal : null)
    : null;
  const pendiente = propuesta?.estado === 'pendiente' ? propuesta : null;

  // Al volver a la página: si la propuesta ya no está pendiente (o no existe), se limpia el id.
  useEffect(() => {
    if (!f.propuestaId || !s.cargado || cerrando.current) return;
    if (!propuesta || propuesta.estado !== 'pendiente') setF({ ...f, propuestaId: null });
  }, [f.propuestaId, propuesta?.estado, s.cargado]);

  useEffect(() => {
    if (primerRender.current) {
      primerRender.current = false;
      return;
    }
    tituloPaso.current?.focus({ preventScroll: true });
  }, [paso]);

  // Cualquier edición con una propuesta pendiente la descarta: ya no coincide con lo cargado.
  const actualizar = (cambios) => {
    if (f.propuestaId) acciones.descartarPropuesta(f.propuestaId, { confirmar: false });
    setF({ ...f, ...cambios, propuestaId: null });
  };
  const set = (k) => (e) => {
    if (errores[k]) setErrores({ ...errores, [k]: undefined });
    actualizar({ [k]: e.target.value });
  };

  const completo = (i) => {
    if (i === 0) return Boolean(f.nombre.trim()) && !existe;
    if (i === 1) return f.fuentes.length > 0;
    return true;
  };

  // Valida un paso; si falla, muestra el error junto al campo y lo enfoca.
  const validarPaso = (i) => {
    if (i === 0 && !f.nombre.trim()) return { nombre: 'Poné un nombre: así lo vas a reconocer en el mapa.' };
    if (i === 0 && existe) return { nombre: 'Ya tenés un entregable con ese nombre: cambiale el nombre' };
    if (i === 1 && !f.fuentes.length) return { fuentes: 'Elegí al menos una fuente: sin fuentes no hay evidencia y el borrador sale vacío.' };
    return null;
  };
  const enfocarError = (campo) => {
    setTimeout(() => {
      const el = document.querySelector(campo === 'nombre' ? '.asistente input[aria-invalid="true"]' : '.fuentes-asistente input[type=checkbox]');
      el?.focus();
    }, 0);
  };
  const irA = (destino) => {
    for (let i = 0; i < destino; i++) {
      const error = validarPaso(i);
      if (error) {
        setErrores(error);
        setPaso(i);
        enfocarError(Object.keys(error)[0]);
        return false;
      }
    }
    setErrores({});
    setPaso(destino);
    return true;
  };

  const alternarFuente = (id) => {
    const tiene = f.fuentes.some((x) => x.id === id);
    if (errores.fuentes) setErrores({ ...errores, fuentes: undefined });
    actualizar({ fuentes: tiene ? f.fuentes.filter((x) => x.id !== id) : [...f.fuentes, { id, para: '' }] });
  };

  const [revisar, preparando] = useAccion(async () => {
    if (!irA(3)) return;
    if (pendiente) await acciones.descartarPropuesta(pendiente.id, { confirmar: false });
    try {
      const p = await api('/asistente', { metodo: 'POST', cuerpo: { ...datos, reglas_formato: generado.reglasFormato, reglas_tono: generado.reglasTono } });
      setPropuestaLocal(p);
      if (p.estado !== 'pendiente') {
        acciones.avisar(`No se pudo preparar el entregable: ${(p.errores || []).map((e) => e.mensaje).join('; ')}`);
        setF({ ...f, propuestaId: null });
        return;
      }
      setF({ ...f, propuestaId: p.id });
    } catch (e) {
      acciones.avisar(e.message);
    }
  });

  const [crear, creando] = useAccion(async () => {
    if (!pendiente) return;
    const id = generado.id;
    cerrando.current = true;
    if (await acciones.aplicarPropuesta(pendiente.id)) {
      descartar();
      setPaso(0);
      acciones.ir('visualizador', { vista: 'entregable', entregable: id });
    } else cerrando.current = false;
  });

  const seguirEditando = () => {
    if (pendiente) acciones.descartarPropuesta(pendiente.id, { confirmar: false });
    setF({ ...f, propuestaId: null });
    setTimeout(() => tituloPaso.current?.focus(), 0);
  };

  const charlando = () => {
    const partes = [`Quiero sumar un entregable nuevo${f.nombre ? `: ${f.nombre}` : ''}.`];
    if (f.que_armas) partes.push(`Qué es: ${f.que_armas}.`);
    if (f.fuentes.length) partes.push(`Fuentes: ${f.fuentes.map((x) => nombreFuente(s, x.id)).join(', ')}.`);
    partes.push('Guiame con los cuatro pasos y armalo conmigo.');
    acciones.escribirEnChat(partes.join(' '));
  };

  const nombreVista = f.nombre.trim() || 'tu entregable nuevo';

  return (
    <div className="pagina">
      <header className="cabecera">
        <div>
          <h1>Nuevo entregable</h1>
          <p className="bajada">Cuatro preguntas y queda andando. Podés completarlo acá o charlando con Claude; el flujo se arma solo a medida que respondés.</p>
        </div>
        <Boton icono={MessagesSquare} onClick={charlando}>Completar charlando</Boton>
      </header>

      <ol className="pasos-asistente" aria-label="Pasos">
        {PASOS.map((p, i) => {
          const hecho = i < 2 ? completo(i) && (i < paso || Boolean(pendiente)) : i === 2 && paso > 2;
          return (
            <li key={p.titulo}>
              <button type="button" className={hecho ? 'hecho' : undefined} aria-current={i === paso && !pendiente ? 'step' : undefined} onClick={() => irA(i)}>
                <span className="numero">{hecho ? <Icono de={Check} tam={14} /> : i + 1}</span>
                <span className="texto-paso">
                  {p.titulo}
                  {i === 2 && <span className="meta"> (opcional)</span>}
                </span>
                {hecho && <span className="visualmente-oculto"> (listo)</span>}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="asistente">
        {pendiente ? (
          <Resumen generado={generado} propuesta={pendiente} onCrear={crear} creando={creando} onSeguir={seguirEditando} />
        ) : (
          <section className="tarjeta" aria-labelledby="titulo-paso">
            <h2 id="titulo-paso" ref={tituloPaso} tabIndex={-1}>
              <span className="visualmente-oculto">Paso {paso + 1} de 4: </span>
              {PASOS[paso].titulo}
            </h2>
            <p className="meta">{PASOS[paso].ayuda}</p>

            {paso === 0 && (
              <>
                <Campo etiqueta="Nombre" error={errores.nombre}>
                  {(p) => <input {...p} value={f.nombre} onChange={set('nombre')} placeholder="Resumen semanal para clientes" />}
                </Campo>
                <Campo etiqueta="Qué es y para quién">
                  {(p) => <input {...p} value={f.que_armas} onChange={set('que_armas')} placeholder="Un mail de los viernes para cada cliente con lo que avanzó su proyecto" />}
                </Campo>
                <Campo etiqueta="Cómo se ve cuando está bien hecho">
                  {(p) => <textarea {...p} rows={3} value={f.formato} onChange={set('formato')} placeholder="Tres bloques: avances, próximos pasos y riesgos. Máximo 150 palabras." />}
                </Campo>
                <Campo etiqueta="Un ejemplo real" opcional ayuda="Pegá uno que ya hayas mandado; se usa como molde de estructura y largo.">
                  {(p) => <textarea {...p} rows={5} className="codigo" value={f.ejemplo} onChange={set('ejemplo')} />}
                </Campo>
              </>
            )}

            {paso === 1 && (
              <Grupo etiqueta="Fuentes">
                <div className="fuentes-asistente" id={ids.fuentes}>
                  {Object.entries(s.catalogo?.fuentes || {}).map(([id, cat]) => {
                    const elegida = f.fuentes.find((x) => x.id === id);
                    const k = conexionDe(s, id);
                    const falta = elegida && k !== 'conectada' && k !== 'desconocida';
                    return (
                      <div key={id} className={`fuente-opcion ${elegida ? 'elegida' : ''}`}>
                        <label>
                          <input
                            type="checkbox"
                            checked={Boolean(elegida)}
                            aria-invalid={errores.fuentes ? 'true' : undefined}
                            aria-describedby={errores.fuentes ? `${ids.fuentes}-error` : undefined}
                            onChange={() => alternarFuente(id)}
                          />
                          <Icono de={ICONO_FUENTE[id] || Plug} />
                          <b title={cat.nombre}>{cat.nombre}</b>
                          <span className={`conexion conexion-${k}`}><Icono de={ICONO_CONEXION[k]} tam={14} />{TEXTO_CONEXION[k]}</span>
                        </label>
                        {elegida && (
                          <input
                            className="ancho"
                            aria-label={`Qué buscás en ${cat.nombre}`}
                            placeholder={`Qué buscás en ${cat.nombre}`}
                            value={elegida.para}
                            onChange={(e) => actualizar({ fuentes: f.fuentes.map((x) => (x.id === id ? { ...x, para: e.target.value } : x)) })}
                          />
                        )}
                        {falta && (
                          <div className="aviso-fuente">
                            <Icono de={TriangleAlert} />
                            <span>Hasta que conectes {cat.nombre}, lo que salga de ahí va a quedar afuera del borrador.</span>
                            <button type="button" className="boton texto chico" onClick={() => acciones.ir('conectores')}>Cómo conectarla</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {errores.fuentes && (
                  <p className="error-texto" id={`${ids.fuentes}-error`}><Icono de={TriangleAlert} tam={14} />{errores.fuentes}</p>
                )}
              </Grupo>
            )}

            {paso === 2 && (
              <>
                <Lista titulo="Formato" tipo="regla de formato" agregar="Agregar regla de formato" items={f.reglas_formato} placeholder="Ej.: Máximo tres ítems por bloque" onChange={(reglas_formato) => actualizar({ reglas_formato })} />
                <Lista titulo="Tono" tipo="regla de tono" agregar="Agregar regla de tono" items={f.reglas_tono} placeholder="Ej.: Sin tecnicismos: lo lee el cliente" onChange={(reglas_tono) => actualizar({ reglas_tono })} />
                <Lista titulo="Control de evidencia (además del básico)" tipo="regla de control" agregar="Agregar regla de control" items={f.control} placeholder="Ej.: Cada avance cita su ticket o PR" onChange={(control) => actualizar({ control })} />
              </>
            )}

            {paso === 3 && (
              <>
                <EditorHorario horario={f.horario} onChange={(horario) => actualizar({ horario })} />
                <EditorDestino destino={f.destino} onChange={(destino) => actualizar({ destino })} />
              </>
            )}

            <div className="acciones">
              {paso > 0 && <Boton onClick={() => irA(paso - 1)}>Anterior</Boton>}
              {paso < 3 && <Boton variante="primario" onClick={() => irA(paso + 1)}>Siguiente</Boton>}
              {paso === 3 && (
                <Boton
                  variante="primario"
                  icono={Sparkles}
                  enCurso={preparando}
                  textoEnCurso="Preparando…"
                  motivo={validacion.ok ? undefined : 'Falta completar algo: mirá el detalle debajo.'}
                  onClick={revisar}
                >
                  Revisar antes de crear
                </Boton>
              )}
            </div>
            {!validacion.ok && paso === 3 && (
              <p className="error-texto"><Icono de={TriangleAlert} tam={14} />{validacion.errores.map((e) => e.mensaje).join('; ')}</p>
            )}
          </section>
        )}

        <section className="vista-previa" aria-labelledby="titulo-vista-previa">
          <h2 id="titulo-vista-previa">Así se ve el flujo</h2>
          <p className="meta">
            Lee de {generado.receta.fuentes.length} {plural(generado.receta.fuentes.length, 'fuente', 'fuentes')} · {generado.receta.pasos.length} {plural(generado.receta.pasos.length, 'paso', 'pasos')} de trabajo, y siempre termina con el control de evidencia y la entrega como borrador
            {f.fuentes.length === 0 && ' (mientras no elijas ninguna, usa tus sesiones de Claude)'}
          </p>
          <Flujo clave={`asistente-${grafo.nodes.length}`} grafo={grafo} variante="mini" etiqueta={`Vista previa del flujo de ${nombreVista}`} />
        </section>
      </div>
    </div>
  );
}
