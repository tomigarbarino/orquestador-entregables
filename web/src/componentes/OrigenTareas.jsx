import { useEffect, useState } from 'react';
import { useApp, useAccion } from '../estado.jsx';
import { Campo } from './Editores.jsx';
import Boton from './Boton.jsx';
import { Icono, CircleCheck, TriangleAlert, Download, Upload, Users } from './Iconos.jsx';

const TECNICO = { spellCheck: false, autoCapitalize: 'none', autoComplete: 'off' };

// Las fuentes que la persona puede marcar como origen de sus tareas, con el detalle que pide cada una.
// "github" son los issues asignados (los PRs se leen aparte, siempre).
export const ORIGENES = [
  { id: 'slack', nombre: 'Slack', ayuda: 'Pedidos en canales o mensajes que te mencionan.', campos: [{ clave: 'canales', etiqueta: 'Canales', placeholder: '#pedidos-producto, #soporte' }], mios: 'Contar solo lo que me mencionan o me asignan' },
  { id: 'teams', nombre: 'Teams', ayuda: 'Pedidos en equipos, canales y chats de Teams.', campos: [{ clave: 'equipos', etiqueta: 'Equipos', placeholder: 'Producto' }, { clave: 'canales', etiqueta: 'Canales', placeholder: 'General' }], mios: 'Contar solo lo que me mencionan o me asignan' },
  { id: 'mail', nombre: 'Mail', ayuda: 'Pedidos que te llegan por mail.', campos: [{ clave: 'remitentes', etiqueta: 'Remitentes', placeholder: 'nombre o @empresa.com', ayuda: 'Para compartir con el equipo, usá dominios (@empresa.com): las direcciones completas no se exportan.' }], mios: 'Contar solo los mails dirigidos a mí' },
  { id: 'reuniones', nombre: 'Reuniones (Fathom)', ayuda: 'Tareas asignadas en los resúmenes de tus reuniones.', campos: [], mios: 'Contar solo las tareas asignadas a mí' },
  { id: 'jira', nombre: 'Jira', ayuda: 'Tickets que te asignan.', campos: [{ clave: 'proyectos', etiqueta: 'Proyectos', placeholder: 'RUT, DEP' }], mios: 'Contar solo los tickets asignados a mí' },
  { id: 'github', nombre: 'Issues de GitHub', ayuda: 'Issues asignados a tu usuario.', campos: [{ clave: 'repos', etiqueta: 'Repositorios', placeholder: 'dueño/repo, dueño/otro', tecnico: true, ayuda: 'Si lo dejás vacío se usan los repos de tus proyectos.' }], mios: null },
];

const aLista = (texto) => texto.split(',').map((x) => x.trim()).filter(Boolean);

// Valor en forma de lista, editable como texto separado por comas sin perder la coma que se está escribiendo.
function CampoLista({ etiqueta, ayuda, placeholder, tecnico, valor, onChange }) {
  const [texto, setTexto] = useState(valor.join(', '));
  useEffect(() => {
    setTexto((previo) => (JSON.stringify(aLista(previo)) === JSON.stringify(valor) ? previo : valor.join(', ')));
  }, [valor]);
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda} opcional>
      {(p) => (
        <input
          {...p}
          {...(tecnico ? TECNICO : {})}
          placeholder={placeholder}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            onChange(aLista(e.target.value));
          }}
        />
      )}
    </Campo>
  );
}

// Marca los valores que vienen del perfil de equipo y la persona todavía no pisó.
export function EtiquetaEquipo({ ruta }) {
  const { s } = useApp();
  if (!s.equipo?.valores?.some((v) => v === ruta || v.startsWith(`${ruta}/`))) return null;
  return (
    <span className="etiqueta etiqueta-equipo" title={s.equipo?.nombre ? `Viene del perfil de ${s.equipo.nombre}` : 'Viene del perfil de equipo'}>
      <Icono de={Users} />del equipo
    </span>
  );
}

function EstadoConexion({ id }) {
  const { s } = useApp();
  const definida = s.config?.fuentes?.[id];
  const est = s.fuentes?.[id];
  const comoConectar = est?.como_conectar || s.catalogo?.fuentes?.[id]?.como_conectar;
  if (definida && definida.activo !== false && est?.conectada) {
    return <span className="etiqueta etiqueta-ok"><Icono de={CircleCheck} />Conectada</span>;
  }
  const motivo = !definida ? 'Todavía no está en tus fuentes: al guardar se suma.' : definida.activo === false ? 'Está apagada en Conectores: al guardar se prende.' : null;
  return (
    <span className="origen-conexion">
      <span className="etiqueta etiqueta-alerta"><Icono de={TriangleAlert} />No conectada</span>
      <span className="meta">{[motivo, comoConectar].filter(Boolean).join(' ')}</span>
    </span>
  );
}

// items: la lista origen_tareas del borrador. onChange recibe la lista nueva.
export function SeccionOrigenTareas({ items, onChange }) {
  const porFuente = new Map(items.map((o) => [o.fuente, o]));
  const alternar = (id, marcado) => onChange(marcado ? [...items, { fuente: id }] : items.filter((o) => o.fuente !== id));
  const cambiar = (id, cambios) => onChange(items.map((o) => {
    if (o.fuente !== id) return o;
    const nuevo = { ...o, ...cambios };
    for (const k of Object.keys(nuevo)) if (nuevo[k] === undefined || nuevo[k] === false || (Array.isArray(nuevo[k]) && !nuevo[k].length)) delete nuevo[k];
    return nuevo;
  }));
  return (
    <div className="origenes">
      {ORIGENES.map((o) => {
        const actual = porFuente.get(o.id);
        return (
          <div key={o.id} className={`origen ${actual ? 'marcado' : ''}`}>
            <div className="origen-cabecera">
              <label className="interruptor-texto">
                <input type="checkbox" checked={Boolean(actual)} onChange={(e) => alternar(o.id, e.target.checked)} />
                <b>{o.nombre}</b>
              </label>
              <EstadoConexion id={o.id} />
            </div>
            <p className="meta">{o.ayuda}</p>
            {actual && (
              <div className="campos">
                {o.campos.map((c) => (
                  <CampoLista key={c.clave} etiqueta={c.etiqueta} ayuda={c.ayuda} placeholder={c.placeholder} tecnico={c.tecnico} valor={actual[c.clave] || []} onChange={(v) => cambiar(o.id, { [c.clave]: v })} />
                ))}
                {o.mios && (
                  <label className="interruptor-texto ancho">
                    <input type="checkbox" checked={Boolean(actual.solo_mios)} onChange={(e) => cambiar(o.id, { solo_mios: e.target.checked })} />
                    {o.mios}
                  </label>
                )}
              </div>
            )}
          </div>
        );
      })}
      {items.filter((o) => !ORIGENES.some((x) => x.id === o.fuente)).map((o) => (
        <p key={o.fuente} className="meta">También se usa «{o.fuente}» (viene de tu configuración).</p>
      ))}
    </div>
  );
}

// Exportar el perfil de equipo (sin datos personales) e importar el de otra persona.
export function TarjetaPerfilEquipo() {
  const { s, acciones } = useApp();
  const [texto, setTexto] = useState('');
  const [exportar, exportando] = useAccion(async () => {
    const r = await acciones.exportarEquipo();
    if (!r) return;
    const url = URL.createObjectURL(new Blob([r.yaml], { type: 'text/yaml' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = r.nombre || 'equipo.yaml';
    a.click();
    URL.revokeObjectURL(url);
  });
  const [importar, importando] = useAccion(async () => {
    if (await acciones.importarEquipo(texto)) setTexto('');
  });
  const leerArchivo = async (e) => {
    const archivo = e.target.files?.[0];
    if (archivo) setTexto(await archivo.text());
  };
  return (
    <section className="tarjeta" aria-labelledby="titulo-perfil-equipo">
      <h2 id="titulo-perfil-equipo">Perfil de equipo</h2>
      <p className="meta">
        {s.equipo?.existe
          ? `Estás usando la configuración de tu equipo${s.equipo.nombre ? ` (${s.equipo.nombre})` : ''}. Lo que cambies acá pisa lo del equipo; lo marcado «del equipo» sigue heredándose.`
          : 'Si sos líder, armá un archivo con las fuentes de tareas, los canales, los entregables prendidos y las reglas de redacción del equipo. Cada integrante lo importa y ajusta lo suyo encima.'}
      </p>
      <div className="campos-columna">
        <div>
          <h3>Exportar perfil de equipo</h3>
          <p className="meta">Se genera sin tu nombre, tu mail ni tus carpetas: solo lo que se puede compartir.</p>
          <div className="acciones">
            <Boton icono={Download} enCurso={exportando} textoEnCurso="Armando…" onClick={exportar}>Exportar perfil de equipo</Boton>
          </div>
        </div>
        <div>
          <h3>Usar la configuración de mi equipo</h3>
          <p className="meta">Elegí el archivo del equipo (o pegalo). Se revisa antes de usarlo, tus ajustes se conservan encima y queda en el historial.</p>
          <Campo etiqueta="Archivo del equipo">{(p) => <input {...p} type="file" accept=".yaml,.yml" onChange={leerArchivo} />}</Campo>
          <Campo etiqueta="O pegá el contenido">
            {(p) => <textarea {...p} {...TECNICO} rows={5} className="codigo" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={'version: 1\nequipo: Producto'} />}
          </Campo>
          <div className="acciones">
            <Boton icono={Upload} enCurso={importando} textoEnCurso="Importando…" motivo={texto.trim() ? undefined : 'Elegí un archivo o pegá el contenido'} onClick={importar}>Usar la configuración de mi equipo</Boton>
          </div>
        </div>
      </div>
    </section>
  );
}
