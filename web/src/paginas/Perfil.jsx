import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../estado.jsx';

const copia = (x) => JSON.parse(JSON.stringify(x));

// Editor de listas de objetos: cada campo es texto o una lista separada por comas.
function ListaEditable({ titulo, ayuda, items = [], campos, nuevo, onChange }) {
  const set = (i, clave, valor, tipo) => {
    const lista = copia(items);
    if (tipo === 'lista') lista[i][clave] = valor.split(',').map((x) => x.trim()).filter(Boolean);
    else if (valor) lista[i][clave] = valor;
    else delete lista[i][clave];
    onChange(lista);
  };
  return (
    <div className="campo">
      <label>{titulo}</label>
      {ayuda && <div className="tenue chico">{ayuda}</div>}
      {items.map((item, i) => (
        <div key={i} className="fila-lista">
          {campos.map((c) => (
            <input
              key={c.clave}
              className={c.ancho ? 'ancho' : ''}
              placeholder={c.etiqueta}
              value={c.tipo === 'lista' ? (item[c.clave] || []).join(', ') : item[c.clave] || ''}
              onChange={(e) => set(i, c.clave, e.target.value, c.tipo)}
            />
          ))}
          <button className="boton chico" onClick={() => onChange(items.filter((_, j) => j !== i))}>Quitar</button>
        </div>
      ))}
      <button className="boton chico" onClick={() => onChange([...items, nuevo()])}>Agregar</button>
    </div>
  );
}

function ListaTextos({ titulo, ayuda, items = [], onChange }) {
  return (
    <div className="campo">
      <label>{titulo}</label>
      {ayuda && <div className="tenue chico">{ayuda}</div>}
      {items.map((t, i) => (
        <div key={i} className="fila-lista">
          <input className="ancho" value={t} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
          <button className="boton chico" onClick={() => onChange(items.filter((_, j) => j !== i))}>Quitar</button>
        </div>
      ))}
      <button className="boton chico" onClick={() => onChange([...items, ''])}>Agregar</button>
    </div>
  );
}

function Importar() {
  const { acciones } = useApp();
  const [texto, setTexto] = useState('');
  const leerArchivo = async (e) => {
    const archivo = e.target.files?.[0];
    if (archivo) setTexto(await archivo.text());
  };
  return (
    <section className="tarjeta">
      <h3>Importar una configuración</h3>
      <p className="tenue">Elegí un config.yaml (o pegalo). Se valida antes de reemplazar el tuyo, y el anterior queda en el historial.</p>
      <input type="file" accept=".yaml,.yml" onChange={leerArchivo} />
      <textarea rows={6} className="codigo" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="version: 1&#10;persona:&#10;  nombre: …" />
      <button className="boton primario" disabled={!texto.trim()} onClick={async () => { if (await acciones.importarConfig(texto)) setTexto(''); }}>Importar</button>
    </section>
  );
}

export default function Perfil() {
  const { s, acciones, validadores } = useApp();
  const [c, setC] = useState(() => copia(s.config || {}));
  useEffect(() => setC(copia(s.config || {})), [s.configTexto]);
  const [verYaml, setVerYaml] = useState(false);
  // El navegador usa nombres canónicos (America/Buenos_Aires): se suma siempre el de la config.
  const zonas = useMemo(() => {
    const lista = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [];
    return [...new Set([c.zona_horaria, s.config?.zona_horaria, ...lista].filter(Boolean))].sort();
  }, [c.zona_horaria, s.config?.zona_horaria]);
  const cambiado = JSON.stringify(c) !== JSON.stringify(s.config);
  const validacion = validadores ? validadores.config(c) : { ok: true, errores: [] };
  const setPersona = (k) => (e) => setC({ ...c, persona: { ...c.persona, [k]: e.target.value || undefined } });

  return (
    <div className="pagina">
      <header className="cabecera">
        <div>
          <h1>Perfil</h1>
          <p className="bajada">Quién sos, tu equipo, tu zona horaria y tus reglas de redacción. Las recetas usan estos datos: nada de esto está escrito en el repo.</p>
        </div>
        <div className="acciones">
          {cambiado && <button className="boton" onClick={() => setC(copia(s.config))}>Deshacer cambios</button>}
          <button className="boton primario" disabled={!cambiado || !validacion.ok} onClick={() => acciones.guardarConfig(c, 'Perfil actualizado')}>Guardar</button>
        </div>
      </header>
      {!validacion.ok && <div className="banner banner-error">{validacion.errores.map((e, i) => <div key={i}><code>{e.ruta}</code> {e.mensaje}</div>)}</div>}

      <section className="tarjeta">
        <h3>Quién sos</h3>
        <div className="campos">
          <div className="campo"><label>Nombre</label><input value={c.persona?.nombre || ''} onChange={setPersona('nombre')} /></div>
          <div className="campo"><label>Rol</label><input value={c.persona?.rol || ''} onChange={setPersona('rol')} /></div>
          <div className="campo"><label>Equipo</label><input value={c.persona?.equipo || ''} onChange={setPersona('equipo')} /></div>
          <div className="campo"><label>Empresa</label><input value={c.persona?.empresa || ''} onChange={setPersona('empresa')} /></div>
          <div className="campo"><label>Usuario de GitHub</label><input value={c.persona?.github_usuario || ''} onChange={setPersona('github_usuario')} placeholder="para filtrar tus PRs" /></div>
          <div className="campo"><label>Idioma</label><input value={c.idioma || ''} onChange={(e) => setC({ ...c, idioma: e.target.value })} /></div>
          <div className="campo">
            <label>Zona horaria</label>
            <select value={c.zona_horaria || ''} onChange={(e) => setC({ ...c, zona_horaria: e.target.value })}>
              {zonas.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section className="tarjeta">
        <h3>Proyectos</h3>
        <ListaEditable
          titulo="Proyectos y sus repos"
          ayuda="Repos como dueño/repo, separados por coma. La rama de producción define qué cuenta como 'en producción'."
          items={c.proyectos}
          campos={[{ clave: 'nombre', etiqueta: 'Nombre' }, { clave: 'repos', etiqueta: 'dueño/repo, dueño/otro', tipo: 'lista', ancho: true }, { clave: 'rama_produccion', etiqueta: 'main' }]}
          nuevo={() => ({ nombre: '', repos: [] })}
          onChange={(proyectos) => setC({ ...c, proyectos })}
        />
      </section>

      <section className="tarjeta">
        <h3>Cómo escribís</h3>
        <ListaTextos titulo="Reglas de redacción" ayuda="Valen para todos los entregables." items={c.reglas_redaccion} onChange={(reglas_redaccion) => setC({ ...c, reglas_redaccion })} />
        <ListaEditable
          titulo="Personas"
          ayuda="Cómo nombrar a la gente en los textos."
          items={c.personas}
          campos={[{ clave: 'nombre', etiqueta: 'Nombre' }, { clave: 'alias', etiqueta: 'Cómo nombrarla' }, { clave: 'nota', etiqueta: 'Nota', ancho: true }]}
          nuevo={() => ({ nombre: '' })}
          onChange={(personas) => setC({ ...c, personas })}
        />
        <ListaEditable
          titulo="Clientes"
          items={c.clientes}
          campos={[{ clave: 'nombre', etiqueta: 'Nombre' }, { clave: 'nota', etiqueta: 'Nota', ancho: true }]}
          nuevo={() => ({ nombre: '' })}
          onChange={(clientes) => setC({ ...c, clientes })}
        />
        <ListaEditable
          titulo="Glosario"
          ayuda="Términos propios y cómo puede aparecer en un dictado."
          items={c.glosario}
          campos={[{ clave: 'termino', etiqueta: 'Término' }, { clave: 'significa', etiqueta: 'Qué es', ancho: true }, { clave: 'variantes_dictado', etiqueta: 'variantes, separadas por coma', tipo: 'lista' }]}
          nuevo={() => ({ termino: '' })}
          onChange={(glosario) => setC({ ...c, glosario })}
        />
        <div className="campos">
          <div className="campo ancho"><label>Design system para decks y documentos</label><input value={c.marca?.design_system || ''} onChange={(e) => setC({ ...c, marca: { ...c.marca, design_system: e.target.value } })} /></div>
        </div>
      </section>

      <Importar />

      <section className="tarjeta">
        <button className="boton chico" onClick={() => setVerYaml(!verYaml)}>{verYaml ? 'Ocultar' : 'Ver'} config.yaml</button>
        {verYaml && <pre className="codigo">{s.configTexto}</pre>}
      </section>
    </div>
  );
}
