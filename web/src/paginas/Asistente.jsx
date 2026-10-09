import { useMemo, useState } from 'react';
import { useApp } from '../estado.jsx';
import { api } from '../api.js';
import { generarEntregable, configConEntregable } from '@lib/asistente.mjs';
import { grafoEntregable } from '@lib/grafo.mjs';
import Flujo from '../componentes/Flujo.jsx';
import Diferencias from '../componentes/Diferencias.jsx';
import { EditorHorario, EditorDestino } from '../componentes/Editores.jsx';

const PASOS = [
  { titulo: 'Qué armás siempre igual', ayuda: 'Ese informe, mail o presentación que hacés a mano todas las semanas.' },
  { titulo: 'De dónde sale cada dato', ayuda: 'Marcá las fuentes y escribí qué buscás en cada una.' },
  { titulo: 'Reglas de formato y tono', ayuda: 'Largo, tono, qué no decir. Tus reglas generales del perfil ya se suman solas.' },
  { titulo: 'Cuándo corre y a dónde va', ayuda: 'Siempre sale como borrador: nada se manda sin tu OK.' },
];

function Lista({ titulo, items, onChange, placeholder }) {
  return (
    <div className="campo">
      <label>{titulo}</label>
      {items.map((t, i) => (
        <div key={i} className="fila-lista">
          <input className="ancho" value={t} placeholder={placeholder} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
          <button className="boton chico" onClick={() => onChange(items.filter((_, j) => j !== i))}>Quitar</button>
        </div>
      ))}
      <button className="boton chico" onClick={() => onChange([...items, ''])}>Agregar</button>
    </div>
  );
}

export default function Asistente() {
  const { s, acciones, validadores } = useApp();
  const [paso, setPaso] = useState(0);
  const [f, setF] = useState({
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
  });
  const [propuesta, setPropuesta] = useState(null);
  const [creando, setCreando] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const nombresFuentes = useMemo(() => Object.fromEntries(Object.entries(s.catalogo?.fuentes || {}).map(([id, x]) => [id, x.nombre])), [s.catalogo]);
  const generado = useMemo(() => generarEntregable(f), [f]);
  const existe = Boolean(s.recetas[generado.id]);
  const grafo = useMemo(() => {
    const config = configConEntregable(s.config, generado, s.catalogo);
    const recetas = { ...s.recetas, [generado.id]: { id: generado.id, origen: 'propia', receta: generado.receta, instrucciones: generado.instrucciones } };
    return grafoEntregable({ entregableId: generado.id, config, recetas, modulos: s.modulos, estadoFuentes: s.fuentes, nombresFuentes });
  }, [generado, s.config, s.recetas, s.modulos, s.fuentes]);
  const validacion = validadores ? validadores.receta(generado.receta) : { ok: true, errores: [] };

  const alternarFuente = (id) => {
    const tiene = f.fuentes.some((x) => x.id === id);
    setF({ ...f, fuentes: tiene ? f.fuentes.filter((x) => x.id !== id) : [...f.fuentes, { id, para: '' }] });
  };

  const crear = async () => {
    setCreando(true);
    try {
      const p = await api('/asistente', { metodo: 'POST', cuerpo: { ...f, reglas_formato: f.reglas_formato.filter(Boolean), reglas_tono: f.reglas_tono.filter(Boolean) } });
      setPropuesta(p);
      if (p.estado !== 'pendiente') acciones.avisar(`La propuesta no es válida: ${p.errores.map((e) => e.mensaje).join('; ')}`);
    } catch (e) {
      acciones.avisar(e.message);
    }
    setCreando(false);
  };

  const charlando = () => {
    const partes = [`Quiero sumar un entregable nuevo${f.nombre ? `: ${f.nombre}` : ''}.`];
    if (f.que_armas) partes.push(`Qué es: ${f.que_armas}.`);
    if (f.fuentes.length) partes.push(`Fuentes: ${f.fuentes.map((x) => x.id).join(', ')}.`);
    partes.push('Guiame con los cuatro pasos y armá la receta.');
    acciones.escribirEnChat(partes.join(' '));
  };

  return (
    <div className="pagina">
      <header className="cabecera">
        <div>
          <h1>Nuevo entregable</h1>
          <p className="bajada">Cuatro preguntas y queda andando. Podés completarlo acá o charlando con Claude; el flujo se dibuja a medida que respondés.</p>
        </div>
        <button className="boton" onClick={charlando}>Completar charlando</button>
      </header>

      <ol className="pasos-asistente">
        {PASOS.map((p, i) => (
          <li key={p.titulo} className={i === paso ? 'activo' : i < paso ? 'hecho' : ''} onClick={() => setPaso(i)}>
            <span className="numero">{i + 1}</span> {p.titulo}
          </li>
        ))}
      </ol>

      <div className="asistente">
        <section className="tarjeta">
          <h3>{PASOS[paso].titulo}</h3>
          <p className="tenue">{PASOS[paso].ayuda}</p>

          {paso === 0 && (
            <>
              <div className="campo"><label>Nombre</label><input value={f.nombre} onChange={set('nombre')} placeholder="Resumen semanal para clientes" /></div>
              {existe && <div className="error-texto">Ya existe una receta "{generado.id}": cambiale el nombre.</div>}
              <div className="campo"><label>Qué es y para quién</label><input value={f.que_armas} onChange={set('que_armas')} placeholder="Un mail de los viernes para cada cliente con lo que avanzó su proyecto" /></div>
              <div className="campo"><label>Cómo se ve cuando está bien hecho</label><textarea rows={3} value={f.formato} onChange={set('formato')} placeholder="Tres bloques: avances, próximos pasos y riesgos. Máximo 150 palabras." /></div>
              <div className="campo"><label>Un ejemplo real (opcional)</label><textarea rows={5} className="codigo" value={f.ejemplo} onChange={set('ejemplo')} placeholder="Pegá uno que ya hayas mandado; se usa como molde de estructura y largo." /></div>
            </>
          )}

          {paso === 1 && (
            <div className="fuentes-asistente">
              {Object.entries(s.catalogo?.fuentes || {}).map(([id, cat]) => {
                const elegida = f.fuentes.find((x) => x.id === id);
                const est = s.fuentes?.[id];
                return (
                  <div key={id} className={`fuente-opcion ${elegida ? 'elegida' : ''}`}>
                    <label>
                      <input type="checkbox" checked={Boolean(elegida)} onChange={() => alternarFuente(id)} />
                      <span className={`conexion conexion-${est?.conectada ? 'conectada' : 'desconectada'}`}><i /></span>
                      <b>{cat.nombre}</b> <span className="tenue chico">{est?.conectada ? 'conectada' : 'sin conectar'}</span>
                    </label>
                    {elegida && (
                      <input
                        className="ancho"
                        placeholder={`Qué buscás en ${cat.nombre.toLowerCase()}`}
                        value={elegida.para}
                        onChange={(e) => setF({ ...f, fuentes: f.fuentes.map((x) => (x.id === id ? { ...x, para: e.target.value } : x)) })}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {paso === 2 && (
            <>
              <Lista titulo="Formato" items={f.reglas_formato} placeholder="Máximo tres ítems por bloque" onChange={(reglas_formato) => setF({ ...f, reglas_formato })} />
              <Lista titulo="Tono" items={f.reglas_tono} placeholder="Sin tecnicismos: lo lee el cliente" onChange={(reglas_tono) => setF({ ...f, reglas_tono })} />
              <Lista titulo="Control de evidencia (además del básico)" items={f.control} placeholder="Cada avance cita su ticket o PR" onChange={(control) => setF({ ...f, control })} />
            </>
          )}

          {paso === 3 && (
            <>
              <EditorHorario horario={f.horario} onChange={(horario) => setF({ ...f, horario })} />
              <EditorDestino destino={f.destino} onChange={(destino) => setF({ ...f, destino })} />
            </>
          )}

          <div className="acciones">
            {paso > 0 && <button className="boton" onClick={() => setPaso(paso - 1)}>Anterior</button>}
            {paso < 3 && <button className="boton primario" onClick={() => setPaso(paso + 1)} disabled={paso === 0 && (!f.nombre.trim() || existe)}>Siguiente</button>}
            {paso === 3 && <button className="boton primario" onClick={crear} disabled={creando || !f.nombre.trim() || existe || !validacion.ok}>{creando ? 'Armando…' : 'Armar la receta'}</button>}
          </div>
          {!validacion.ok && <div className="error-texto chico">{validacion.errores.map((e) => `${e.ruta}: ${e.mensaje}`).join('; ')}</div>}
        </section>

        <section className="vista-previa">
          <div className="tenue chico">Vista previa: <code>{generado.id}</code></div>
          <Flujo clave={`asistente-${grafo.nodes.length}`} grafo={grafo} alto={340} />
          {propuesta && (
            <div className="tarjeta">
              <h3>Receta lista para aplicar</h3>
              <p className="tenue">Se crea la receta <code>{generado.id}</code> en tu espacio y su entrada en la config.</p>
              <Diferencias diffs={propuesta.diffs} />
              <div className="acciones">
                <button className="boton" onClick={() => acciones.descartarPropuesta(propuesta.id).then(() => setPropuesta(null))}>Descartar</button>
                <button
                  className="boton primario"
                  disabled={propuesta.estado !== 'pendiente'}
                  onClick={async () => {
                    if (await acciones.aplicarPropuesta(propuesta.id)) {
                      setPropuesta(null);
                      acciones.ui({ pagina: 'visualizador', vista: 'entregable', entregable: generado.id, nodo: null });
                    }
                  }}
                >
                  Aplicar y ver el flujo
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
