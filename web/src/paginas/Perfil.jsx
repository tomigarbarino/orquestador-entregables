import { useMemo, useRef, useState } from 'react';
import { useApp, useAccion, useBorrador, CAMPOS_PERFIL } from '../estado.jsx';
import { Campo, Grupo } from '../componentes/Editores.jsx';
import Boton from '../componentes/Boton.jsx';
import { Icono, Plus, X, TriangleAlert } from '../componentes/Iconos.jsx';
import { rutaHumana } from '../textos.js';

const copia = (x) => JSON.parse(JSON.stringify(x ?? null));
const pick = (obj, claves) => Object.fromEntries(claves.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));
const TECNICO = { spellCheck: false, autoCapitalize: 'none', autoComplete: 'off' };

// Errores del validador que caen dentro de una ruta (por ejemplo '/persona' o '/proyectos').
function erroresDe(errores, prefijo) {
  return errores.filter((e) => e.ruta === prefijo || e.ruta.startsWith(`${prefijo}/`));
}

// Editor de listas de objetos: cada columna tiene un encabezado y su propio ejemplo.
function ListaEditable({ titulo, ayuda, tipo, agregar, items = [], campos, nuevo, onChange, errores = [] }) {
  const set = (i, clave, valor, tipoCampo) => {
    const lista = copia(items);
    if (tipoCampo === 'lista') lista[i][clave] = valor.split(',').map((x) => x.trim()).filter(Boolean);
    else if (valor) lista[i][clave] = valor;
    else delete lista[i][clave];
    onChange(lista);
  };
  const columnas = campos.map((c) => (c.ancho ? 'minmax(0, 2fr)' : 'minmax(0, 1fr)')).join(' ');
  return (
    <Grupo etiqueta={titulo} ayuda={ayuda}>
      <div className="lista-editable" style={{ '--columnas': columnas }}>
        {items.length > 0 && (
          <div className="encabezados" aria-hidden="true">
            {campos.map((c) => <span key={c.clave}>{c.encabezado}</span>)}
            <span />
          </div>
        )}
        {items.map((item, i) => (
          <div key={i} className="fila-lista">
            {campos.map((c) => (
              <input
                key={c.clave}
                aria-label={`${c.encabezado} (${tipo} ${i + 1})`}
                aria-invalid={errores.some((e) => e.ruta.startsWith(`/${c.ruta}/${i}/${c.clave}`)) ? 'true' : undefined}
                placeholder={c.placeholder}
                {...(c.tecnico ? TECNICO : {})}
                value={c.tipo === 'lista' ? (item[c.clave] || []).join(', ') : item[c.clave] || ''}
                onChange={(e) => set(i, c.clave, e.target.value, c.tipo)}
              />
            ))}
            <button type="button" className="boton solo-icono" aria-label={`Quitar ${tipo} ${i + 1}`} title={`Quitar ${tipo} ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <Icono de={X} />
            </button>
          </div>
        ))}
        <button type="button" className="boton chico boton-agregar" onClick={() => onChange([...items, nuevo()])}>
          <Icono de={Plus} />{agregar}
        </button>
        {errores.map((e, i) => (
          <p key={i} className="error-texto"><Icono de={TriangleAlert} tam={14} />{e.mensaje}</p>
        ))}
      </div>
    </Grupo>
  );
}

function ListaTextos({ titulo, ayuda, tipo, agregar, items = [], onChange, placeholder }) {
  return (
    <Grupo etiqueta={titulo} ayuda={ayuda}>
      <div className="lista-editable" style={{ '--columnas': 'minmax(0, 1fr)' }}>
        {items.map((t, i) => (
          <div key={i} className="fila-lista">
            <input aria-label={`${tipo} ${i + 1}`} placeholder={placeholder} value={t} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
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

function Importar() {
  const { acciones } = useApp();
  const [texto, setTexto] = useState('');
  const leerArchivo = async (e) => {
    const archivo = e.target.files?.[0];
    if (archivo) setTexto(await archivo.text());
  };
  const [importar, importando] = useAccion(async () => {
    if (await acciones.importarConfig(texto)) setTexto('');
  });
  return (
    <div className="campos-columna">
      <h3>Importar una configuración</h3>
      <p className="meta">Elegí un archivo de configuración (o pegalo). Se revisa antes de reemplazar el tuyo, y el anterior queda en el historial.</p>
      <Campo etiqueta="Archivo">{(p) => <input {...p} type="file" accept=".yaml,.yml" onChange={leerArchivo} />}</Campo>
      <Campo etiqueta="O pegá el contenido">
        {(p) => <textarea {...p} {...TECNICO} rows={6} className="codigo" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={'version: 1\npersona:\n  nombre: …'} />}
      </Campo>
      <div className="acciones">
        <Boton enCurso={importando} textoEnCurso="Importando…" motivo={texto.trim() ? undefined : 'Elegí un archivo o pegá el contenido'} onClick={importar}>Importar</Boton>
      </div>
    </div>
  );
}

export default function Perfil() {
  const { s, acciones, validadores } = useApp();
  const original = useMemo(() => pick(s.config || {}, CAMPOS_PERFIL), [s.config]);
  const [c, setC, { cambiado, desactualizado, conflictos, descartar, paraGuardar }] = useBorrador('perfil', original);
  const [verYaml, setVerYaml] = useState(false);
  const [mostrarErrores, setMostrarErrores] = useState(false);
  const formulario = useRef(null);

  // El navegador usa nombres canónicos (America/Buenos_Aires): se suma siempre el de la config.
  const zonas = useMemo(() => {
    const lista = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [];
    return [...new Set([c.zona_horaria, s.config?.zona_horaria, ...lista].filter(Boolean))].sort();
  }, [c.zona_horaria, s.config?.zona_horaria]);

  const validacion = validadores ? validadores.config({ ...s.config, ...c }) : { ok: true, errores: [] };
  const errores = (validacion.errores || []).filter((e) => CAMPOS_PERFIL.some((k) => e.ruta === `/${k}` || e.ruta.startsWith(`/${k}/`)));
  const visibles = mostrarErrores ? errores : [];
  const errorCampo = (ruta) => visibles.filter((e) => e.ruta === ruta).map((e) => e.mensaje).join('; ') || undefined;
  const setPersona = (k) => (e) => setC({ ...c, persona: { ...c.persona, [k]: e.target.value || undefined } });

  const [guardar, guardando] = useAccion(async () => {
    if (errores.length) {
      setMostrarErrores(true);
      // Después del render, el foco va al primer campo con error.
      setTimeout(() => {
        const primero = formulario.current?.querySelector('[aria-invalid="true"]');
        (primero || formulario.current?.querySelector('.error-texto'))?.focus?.();
        primero?.scrollIntoView({ block: 'center' });
      }, 0);
      return;
    }
    if (await acciones.guardarConfig({ ...s.config, ...paraGuardar() }, 'Perfil actualizado')) {
      descartar();
      setMostrarErrores(false);
    }
  });

  const nombreCampo = { persona: 'tus datos', idioma: 'el idioma', zona_horaria: 'la zona horaria', proyectos: 'los proyectos', personas: 'las personas', clientes: 'los clientes', glosario: 'el glosario', reglas_redaccion: 'las reglas de redacción', marca: 'la marca' };
  const sueltos = visibles.filter((e) => !/^\/(persona\/[a-z_]+|idioma|zona_horaria|proyectos|personas|clientes|glosario|marca)/.test(e.ruta));

  return (
    <div className="pagina" ref={formulario}>
      <header className="cabecera">
        <div>
          <h1>Perfil</h1>
          <p className="bajada">Quién sos, tu equipo, tu zona horaria y tus reglas de redacción. Los entregables usan estos datos para escribir como vos.</p>
        </div>
      </header>

      {desactualizado && (
        <div className="banner banner-alerta" role="status">
          <span>
            Mientras editabas cambió la configuración (por ejemplo, se aplicó un cambio del chat). Al guardar se conservan los dos cambios.
            {conflictos?.length > 0 && ` En ${conflictos.map((k) => nombreCampo[k] || k).join(', ')} queda lo tuyo.`}
          </span>
        </div>
      )}
      {sueltos.length > 0 && (
        <div className="banner banner-error" role="alert">
          {sueltos.map((e, i) => <div key={i}>{rutaHumana(e.ruta, s).texto}: {e.mensaje}</div>)}
        </div>
      )}

      <section className="tarjeta">
        <h2>Quién sos</h2>
        <div className="campos">
          <Campo etiqueta="Nombre" error={errorCampo('/persona/nombre')}>{(p) => <input {...p} autoComplete="name" value={c.persona?.nombre || ''} onChange={setPersona('nombre')} />}</Campo>
          <Campo etiqueta="Rol" error={errorCampo('/persona/rol')}>{(p) => <input {...p} value={c.persona?.rol || ''} onChange={setPersona('rol')} placeholder="Ej.: Líder técnica" />}</Campo>
          <Campo etiqueta="Equipo" error={errorCampo('/persona/equipo')}>{(p) => <input {...p} value={c.persona?.equipo || ''} onChange={setPersona('equipo')} />}</Campo>
          <Campo etiqueta="Empresa" error={errorCampo('/persona/empresa')}>{(p) => <input {...p} autoComplete="organization" value={c.persona?.empresa || ''} onChange={setPersona('empresa')} />}</Campo>
          <Campo etiqueta="Usuario de GitHub" opcional ayuda="Sirve para encontrar tus PRs." error={errorCampo('/persona/github_usuario')}>
            {(p) => <input {...p} {...TECNICO} value={c.persona?.github_usuario || ''} onChange={setPersona('github_usuario')} />}
          </Campo>
          <Campo etiqueta="Idioma" error={errorCampo('/idioma')}>{(p) => <input {...p} {...TECNICO} value={c.idioma || ''} onChange={(e) => setC({ ...c, idioma: e.target.value })} placeholder="Ej.: es-AR" />}</Campo>
          <Campo etiqueta="Zona horaria" error={errorCampo('/zona_horaria')}>
            {(p) => (
              <select {...p} value={c.zona_horaria || ''} onChange={(e) => setC({ ...c, zona_horaria: e.target.value })}>
                {zonas.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            )}
          </Campo>
        </div>
      </section>

      <section className="tarjeta">
        <h2>Proyectos</h2>
        <ListaEditable
          titulo="Proyectos y sus repositorios"
          tipo="proyecto"
          agregar="Agregar proyecto"
          ayuda="Repositorios como dueño/repo, separados por coma. La rama de producción define qué cuenta como «en producción»."
          items={c.proyectos}
          errores={erroresDe(visibles, '/proyectos')}
          campos={[
            { clave: 'nombre', ruta: 'proyectos', encabezado: 'Nombre', placeholder: 'Ej.: Portal de clientes' },
            { clave: 'repos', ruta: 'proyectos', encabezado: 'Repositorios', placeholder: 'dueño/repo, dueño/otro', tipo: 'lista', ancho: true, tecnico: true },
            { clave: 'rama_produccion', ruta: 'proyectos', encabezado: 'Rama de producción', placeholder: 'Ej.: main', tecnico: true },
          ]}
          nuevo={() => ({ nombre: '', repos: [] })}
          onChange={(proyectos) => setC({ ...c, proyectos })}
        />
      </section>

      <section className="tarjeta">
        <h2>Cómo escribís</h2>
        <ListaTextos
          titulo="Reglas de redacción"
          tipo="regla"
          agregar="Agregar regla"
          ayuda="Valen para todos los entregables."
          placeholder="Ej.: Frases cortas, sin tecnicismos"
          items={c.reglas_redaccion}
          onChange={(reglas_redaccion) => setC({ ...c, reglas_redaccion })}
        />
        <ListaEditable
          titulo="Personas"
          tipo="persona"
          agregar="Agregar persona"
          ayuda="Cómo nombrar a la gente en los textos."
          items={c.personas}
          errores={erroresDe(visibles, '/personas')}
          campos={[
            { clave: 'nombre', ruta: 'personas', encabezado: 'Nombre', placeholder: 'Ej.: María López' },
            { clave: 'alias', ruta: 'personas', encabezado: 'Cómo nombrarla', placeholder: 'Ej.: Mari' },
            { clave: 'nota', ruta: 'personas', encabezado: 'Nota', placeholder: 'Ej.: Lidera el equipo de datos', ancho: true },
          ]}
          nuevo={() => ({ nombre: '' })}
          onChange={(personas) => setC({ ...c, personas })}
        />
        <ListaEditable
          titulo="Clientes"
          tipo="cliente"
          agregar="Agregar cliente"
          items={c.clientes}
          errores={erroresDe(visibles, '/clientes')}
          campos={[
            { clave: 'nombre', ruta: 'clientes', encabezado: 'Nombre', placeholder: 'Ej.: Acme' },
            { clave: 'nota', ruta: 'clientes', encabezado: 'Nota', placeholder: 'Ej.: Prefiere resúmenes cortos', ancho: true },
          ]}
          nuevo={() => ({ nombre: '' })}
          onChange={(clientes) => setC({ ...c, clientes })}
        />
        <ListaEditable
          titulo="Glosario"
          tipo="término"
          agregar="Agregar término"
          ayuda="Términos propios y cómo pueden aparecer en un dictado."
          items={c.glosario}
          errores={erroresDe(visibles, '/glosario')}
          campos={[
            { clave: 'termino', ruta: 'glosario', encabezado: 'Término', placeholder: 'Ej.: Tablero' },
            { clave: 'significa', ruta: 'glosario', encabezado: 'Qué es', placeholder: 'Ej.: El panel de métricas del equipo', ancho: true },
            { clave: 'variantes_dictado', ruta: 'glosario', encabezado: 'Cómo puede sonar dictado', placeholder: 'Ej.: tablero, el tablerito', tipo: 'lista' },
          ]}
          nuevo={() => ({ termino: '' })}
          onChange={(glosario) => setC({ ...c, glosario })}
        />
        <div className="campos">
          <Campo etiqueta="Estilo para presentaciones y documentos" opcional className="ancho" ayuda="El nombre del design system que usan tus decks y documentos." error={errorCampo('/marca/design_system')}>
            {(p) => <input {...p} value={c.marca?.design_system || ''} onChange={(e) => setC({ ...c, marca: { ...c.marca, design_system: e.target.value || undefined } })} />}
          </Campo>
        </div>
      </section>

      {cambiado && (
        <div className="barra-sin-guardar">
          <span className="texto-sin-guardar"><Icono de={TriangleAlert} />Tenés cambios sin guardar</span>
          <Boton variante="texto" onClick={() => { descartar(); setMostrarErrores(false); }}>Deshacer</Boton>
          <Boton variante="primario" enCurso={guardando} textoEnCurso="Guardando…" onClick={guardar}>Guardar</Boton>
        </div>
      )}

      <details className="tarjeta detalle-tecnico">
        <summary>Avanzado</summary>
        <div className="contenido">
          <Importar />
          <div>
            <Boton chico aria-expanded={verYaml} onClick={() => setVerYaml(!verYaml)}>{verYaml ? 'Ocultar' : 'Ver'} el archivo de configuración</Boton>
            {verYaml && <pre className="codigo">{s.configTexto}</pre>}
          </div>
        </div>
      </details>
    </div>
  );
}
