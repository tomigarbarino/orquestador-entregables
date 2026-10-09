import { useState } from 'react';
import { useApp } from '../estado.jsx';
import { api } from '../api.js';

const copia = (x) => JSON.parse(JSON.stringify(x));
const URL_CONECTORES = 'https://claude.ai/settings/connectors';

function FilaFuente({ id }) {
  const { s, acciones } = useApp();
  const f = s.config.fuentes[id];
  const est = s.fuentes?.[id] || {};
  const cat = s.catalogo?.fuentes?.[id] || {};
  const [servidor, setServidor] = useState(f.servidor || '');
  const servidores = s.detectado?.mcp?.servidores || [];

  const guardar = async (cambios, motivo) => {
    const config = copia(s.config);
    config.fuentes[id] = { ...config.fuentes[id], ...cambios };
    if (cambios.servidor === '') delete config.fuentes[id].servidor;
    await acciones.guardarConfig(config, motivo);
  };

  return (
    <tr className={f.activo ? '' : 'apagada'}>
      <td>
        <b>{cat.nombre || id}</b>
        <div className="tenue chico">{cat.descripcion}</div>
      </td>
      <td><code>{f.via}</code></td>
      <td>
        <span className={`conexion conexion-${f.activo && est.conectada ? 'conectada' : 'desconectada'}`}><i />{!f.activo ? 'Apagada' : est.conectada ? 'Conectada' : 'Sin conectar'}</span>
        <div className="chico">{est.detalle}</div>
        {f.activo && !est.conectada && (est.como_conectar || cat.como_conectar) && <div className="consejo chico">{est.como_conectar || cat.como_conectar}</div>}
        {f.via === 'mcp' && (
          <div className="fila chico">
            <input list={`servidores-${id}`} value={servidor} placeholder="Nombre del conector" onChange={(e) => setServidor(e.target.value)} />
            <datalist id={`servidores-${id}`}>{servidores.map((x) => <option key={x.nombre} value={x.nombre} />)}</datalist>
            {servidor !== (f.servidor || '') && <button className="boton chico" onClick={() => guardar({ servidor }, `Fuente ${id}: conector ${servidor || 'automático'}`)}>Guardar</button>}
          </div>
        )}
      </td>
      <td className="chico">{est.herramientas?.length ? `${est.herramientas.length} de lectura` : '—'}</td>
      <td>
        <label className="interruptor">
          <input type="checkbox" checked={f.activo} onChange={() => guardar({ activo: !f.activo }, `${f.activo ? 'Apagar' : 'Prender'} la fuente ${id}`)} />
        </label>
      </td>
    </tr>
  );
}

function AgregarMcp() {
  const { s, acciones } = useApp();
  const [datos, setDatos] = useState({ nombre: '', transporte: 'stdio', comando: '', args: '', url: '', alcance: 'user' });
  const [enviando, setEnviando] = useState(false);
  const set = (k) => (e) => setDatos({ ...datos, [k]: e.target.value });
  const agregar = async () => {
    setEnviando(true);
    try {
      const r = await api('/conectores/mcp', {
        metodo: 'POST',
        cuerpo: { ...datos, args: datos.args.split('\n').map((x) => x.trim()).filter(Boolean) },
      });
      acciones.avisar(`Agregado: ${r.comando}`, 'ok');
      setDatos({ ...datos, nombre: '', comando: '', args: '', url: '' });
    } catch (e) {
      acciones.avisar(e.message);
    }
    setEnviando(false);
  };
  return (
    <div className="tarjeta">
      <h3>Un MCP local</h3>
      <p className="tenue">Se suma con <code>claude mcp add</code>. Sus credenciales quedan en Claude Code, nunca en esta interfaz.</p>
      <div className="campos">
        <div className="campo"><label>Nombre</label><input value={datos.nombre} onChange={set('nombre')} placeholder="mi-jira" /></div>
        <div className="campo">
          <label>Tipo</label>
          <select value={datos.transporte} onChange={set('transporte')}>
            <option value="stdio">Programa local (stdio)</option>
            <option value="http">Servidor HTTP</option>
          </select>
        </div>
        <div className="campo">
          <label>Alcance</label>
          <select value={datos.alcance} onChange={set('alcance')}>
            <option value="user">Para todos mis proyectos (user)</option>
            <option value="local">Solo este espacio (local)</option>
          </select>
        </div>
      </div>
      {datos.transporte === 'stdio' ? (
        <div className="campos">
          <div className="campo"><label>Comando</label><input value={datos.comando} onChange={set('comando')} placeholder="npx" /></div>
          <div className="campo ancho"><label>Argumentos (uno por línea)</label><textarea rows={3} value={datos.args} onChange={set('args')} placeholder={'-y\n@paquete/servidor-mcp'} /></div>
        </div>
      ) : (
        <div className="campo"><label>URL</label><input value={datos.url} onChange={set('url')} placeholder="https://servidor.example/mcp" /></div>
      )}
      <button className="boton primario" disabled={enviando || s.demo || !datos.nombre} onClick={agregar}>{enviando ? 'Agregando…' : 'Agregar con claude mcp add'}</button>
    </div>
  );
}

export default function Conectores() {
  const { s, acciones } = useApp();
  const [revisando, setRevisando] = useState(false);
  const revisar = async () => {
    setRevisando(true);
    await acciones.refrescarConectores();
    setRevisando(false);
  };
  const det = s.detectado || {};
  return (
    <div className="pagina">
      <header className="cabecera">
        <div>
          <h1>Conectores</h1>
          <p className="bajada">El estado de cada fuente se lee de <code>claude mcp list</code> y <code>gh auth status</code>. La autorización queda en manos de Claude y de gh: acá no se guarda ningún token.</p>
        </div>
        <button className="boton primario" onClick={revisar} disabled={revisando}>{revisando ? 'Revisando…' : 'Revisar de nuevo'}</button>
      </header>

      <div className="estado-herramientas">
        <div className={`chip-estado ${s.auth?.logueado ? 'ok' : 'error'}`}><b>Claude Code</b> {s.auth?.detalle || 'sin revisar'}</div>
        <div className={`chip-estado ${det.gh?.ok ? 'ok' : 'error'}`}><b>GitHub CLI</b> {det.gh?.detalle || 'sin revisar'}</div>
        <div className={`chip-estado ${det.mcp?.ok ? 'ok' : 'error'}`}><b>Conectores MCP</b> {det.mcp?.ok ? `${det.mcp.servidores.length} detectados` : det.mcp?.error || 'sin revisar'}</div>
        <div className={`chip-estado ${det.ollama?.ok ? 'ok' : 'neutro'}`}><b>Ollama</b> {det.ollama?.detalle || 'sin revisar'}</div>
      </div>
      {det.actualizado && <p className="tenue chico">Revisado: {new Date(det.actualizado).toLocaleString('es-AR')}</p>}

      <section className="tarjeta">
        <h3>Fuentes</h3>
        <table className="tabla">
          <thead><tr><th>Fuente</th><th>Vía</th><th>Estado</th><th>Herramientas</th><th>Activa</th></tr></thead>
          <tbody>{Object.keys(s.config?.fuentes || {}).map((id) => <FilaFuente key={id} id={id} />)}</tbody>
        </table>
      </section>

      {det.mcp?.servidores?.length > 0 && (
        <section className="tarjeta">
          <h3>Conectores que ve Claude Code</h3>
          <ul className="lista-servidores">
            {det.mcp.servidores.map((x) => (
              <li key={x.nombre}><span className={`conexion conexion-${x.estado === 'conectado' ? 'conectada' : 'desconectada'}`}><i /></span> <b>{x.nombre}</b> <span className="tenue">{x.detalle}</span></li>
            ))}
          </ul>
        </section>
      )}

      <h2>Sumar un conector</h2>
      <div className="tarjetas dos">
        <div className="tarjeta">
          <h3>Un conector de claude.ai</h3>
          <p>Calendario, mail, Slack, Teams o Jira se conectan desde tu cuenta de Claude:</p>
          <ol>
            <li>Abrí <a href={URL_CONECTORES} target="_blank" rel="noreferrer">la configuración de conectores de claude.ai</a>.</li>
            <li>Elegí el conector (por ejemplo Microsoft 365, Google Calendar, Slack o Atlassian) y tocá <b>Conectar</b>.</li>
            <li>Autorizalo con tu cuenta en la ventana que se abre. Las credenciales quedan en claude.ai.</li>
            <li>Volvé acá y tocá <b>Revisar de nuevo</b>: va a aparecer como "claude.ai …" en la lista de arriba.</li>
            <li>En la fila de la fuente, elegí ese conector y prendela.</li>
          </ol>
        </div>
        <AgregarMcp />
      </div>
    </div>
  );
}
