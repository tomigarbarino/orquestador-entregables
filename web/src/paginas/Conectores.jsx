import { useId, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useApp, useAccion } from '../estado.jsx';
import { api } from '../api.js';
import { DEMO_ESTATICA } from '../demo/estatica.js';
import { Campo } from '../componentes/Editores.jsx';
import Boton from '../componentes/Boton.jsx';
import { Icono, ICONO_FUENTE, ICONO_CONEXION, CircleCheck, Plug, Plus, RefreshCw, TriangleAlert, ChevronDown } from '../componentes/Iconos.jsx';
import { TEXTO_CONEXION, haceCuanto, fechaHora, nombreFuente, plural } from '../textos.js';

const URL_CONECTORES = 'https://claude.ai/settings/connectors';
const TECNICO = { spellCheck: false, autoCapitalize: 'none', autoComplete: 'off' };
const VIA = { gh: 'GitHub CLI en esta compu', mcp: 'Conector de Claude', local: 'Carpetas de esta compu', ollama: 'Modelo local (Ollama)' };
const ESTADO_SERVIDOR = { conectado: 'Conectado', requiere_auth: 'Falta autorizar', fallo: 'No conecta', desconocido: 'Sin revisar' };

function conexionDe(s, id) {
  const f = s.config?.fuentes?.[id];
  if (!f) return 'desconectada';
  if (f.activo === false) return 'apagada';
  const est = s.fuentes?.[id];
  if (!est) return 'desconocida';
  return est.conectada ? 'conectada' : 'desconectada';
}

// El consejo del catálogo, si no trae comandos. Los comandos van al detalle técnico.
function consejoLlano(texto) {
  if (!texto) return '';
  return texto.includes('`') ? 'Hay que instalar algo en esta compu: el paso exacto está en el detalle técnico, más abajo.' : texto;
}

function FilaFuente({ id }) {
  const { s, acciones } = useApp();
  const f = s.config.fuentes[id];
  const est = s.fuentes?.[id] || {};
  const cat = s.catalogo?.fuentes?.[id] || {};
  const nombre = nombreFuente(s, id);
  const conexion = conexionDe(s, id);
  const [servidor, setServidor] = useState(f.servidor || '');
  const [eligiendo, setEligiendo] = useState(false);
  const idFila = useId();
  const servidores = s.detectado?.mcp?.servidores || [];

  const guardar = async (cambios, motivo) => {
    const fuentes = { ...s.config.fuentes, [id]: { ...s.config.fuentes[id], ...cambios } };
    if (cambios.servidor === '') delete fuentes[id].servidor;
    return acciones.guardarConfig({ ...s.config, fuentes }, motivo);
  };
  const [guardarServidor, guardandoServidor] = useAccion(async () => {
    if (await guardar({ servidor }, `${nombre}: conector ${servidor || 'automático'}`)) setEligiendo(false);
  });
  const [alternar] = useAccion(() => guardar({ activo: !f.activo }, `${f.activo ? 'Apagar' : 'Prender'} la fuente ${nombre}`));

  let queHacer;
  if (conexion === 'apagada') queHacer = <span>Prendela si querés que Claude la lea.</span>;
  else if (conexion === 'conectada') queHacer = <span>Nada: Claude ya la puede leer.</span>;
  else if (f.via === 'mcp') {
    queHacer = (
      <>
        <a className="boton chico" href={URL_CONECTORES} target="_blank" rel="noreferrer">
          <Icono de={ExternalLink} />Conectar en claude.ai
        </a>
        <span>{consejoLlano(est.como_conectar || cat.como_conectar)}</span>
      </>
    );
  } else queHacer = <span>{consejoLlano(est.como_conectar || cat.como_conectar) || 'Revisá el detalle técnico, más abajo.'}</span>;

  return (
    <>
      <tr className={f.activo ? '' : 'apagada'}>
        <td>
          <div className="nombre-fuente">
            <Icono de={ICONO_FUENTE[id] || Plug} />
            <div>
              <b>{nombre}</b>
              {cat.descripcion && <div className="descripcion-fuente">{cat.descripcion}</div>}
            </div>
          </div>
        </td>
        <td>
          <span className={`conexion conexion-${conexion}`}>
            <Icono de={ICONO_CONEXION[conexion]} />
            {TEXTO_CONEXION[conexion]}
          </span>
        </td>
        <td>
          <div className="que-hacer">
            {queHacer}
            {f.via === 'mcp' && f.activo && (
              <Boton chico variante="texto" icono={ChevronDown} aria-expanded={eligiendo} aria-controls={idFila} onClick={() => setEligiendo(!eligiendo)}>
                Elegir conector
              </Boton>
            )}
          </div>
        </td>
        <td className="col-activa">
          <label className="interruptor">
            <input type="checkbox" role="switch" checked={Boolean(f.activo)} aria-label={`Usar ${nombre}`} onChange={alternar} />
          </label>
        </td>
      </tr>
      {f.via === 'mcp' && f.activo && eligiendo && (
        <tr className="fila-elegir" id={idFila}>
          <td colSpan={4}>
            <div className="elegir-conector">
              <Campo etiqueta={`Conector de Claude que usa ${nombre}`} ayuda="Dejalo vacío para que lo elija solo.">
                {(props) => (
                  <input {...props} {...TECNICO} list={`servidores-${id}`} value={servidor} placeholder="Ej.: claude.ai Atlassian" onChange={(e) => setServidor(e.target.value)} />
                )}
              </Campo>
              <datalist id={`servidores-${id}`}>{servidores.map((x) => <option key={x.nombre} value={x.nombre} />)}</datalist>
              {servidor !== (f.servidor || '') && (
                <Boton chico variante="primario" enCurso={guardandoServidor} textoEnCurso="Guardando…" onClick={guardarServidor}>Usar este conector</Boton>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Fuentes del catálogo que todavía no están en la configuración (por ejemplo Slack y Teams en una
// configuración que usaba "chat"). Se suman apagadas: la persona las prende cuando quiere.
function FilaSumar({ id }) {
  const { s, acciones } = useApp();
  const cat = s.catalogo?.fuentes?.[id] || {};
  const nombre = nombreFuente(s, id);
  const [sumar] = useAccion(() => {
    const nueva = { activo: false, via: cat.via || 'mcp' };
    if (nueva.via === 'mcp' && cat.proveedores?.[0]) nueva.servidor = cat.proveedores[0].nombre;
    return acciones.guardarConfig({ ...s.config, fuentes: { ...s.config.fuentes, [id]: nueva } }, `Sumar la fuente ${nombre}`);
  });
  return (
    <tr className="apagada">
      <td>
        <div className="nombre-fuente">
          <Icono de={ICONO_FUENTE[id] || Plug} />
          <div>
            <b>{nombre}</b>
            {cat.descripcion && <div className="descripcion-fuente">{cat.descripcion}</div>}
          </div>
        </div>
      </td>
      <td><span className="conexion conexion-apagada"><Icono de={ICONO_CONEXION.apagada} />No está en tu configuración</span></td>
      <td><div className="que-hacer"><span>Sumala para poder prenderla y elegirla en tus entregables.</span></div></td>
      <td className="col-activa">
        <Boton chico variante="texto" icono={Plus} onClick={sumar} aria-label={`Sumar ${nombre}`}>Sumar</Boton>
      </td>
    </tr>
  );
}

function AgregarMcp() {
  const { s, acciones } = useApp();
  const [datos, setDatos] = useState({ nombre: '', transporte: 'stdio', comando: '', args: '', url: '', alcance: 'user' });
  const set = (k) => (e) => setDatos({ ...datos, [k]: e.target.value });
  const [agregar, enviando] = useAccion(async () => {
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
  });
  const motivo = DEMO_ESTATICA ? 'En la demo pública no se pueden agregar conectores: hace falta instalar el orquestador en tu compu' : s.demo ? 'En la demo no se agregan conectores' : !datos.nombre.trim() ? 'Poné un nombre para el conector' : undefined;
  return (
    <div className="tarjeta">
      <h3>Un MCP local</h3>
      <p className="meta">Se suma con <code>claude mcp add</code>. Sus credenciales quedan en Claude Code, nunca en esta interfaz.</p>
      <div className="campos">
        <Campo etiqueta="Nombre">{(p) => <input {...p} {...TECNICO} value={datos.nombre} onChange={set('nombre')} placeholder="Ej.: mi-jira" />}</Campo>
        <Campo etiqueta="Tipo">
          {(p) => (
            <select {...p} value={datos.transporte} onChange={set('transporte')}>
              <option value="stdio">Programa local (stdio)</option>
              <option value="http">Servidor HTTP</option>
            </select>
          )}
        </Campo>
        <Campo etiqueta="Alcance">
          {(p) => (
            <select {...p} value={datos.alcance} onChange={set('alcance')}>
              <option value="user">Para todos mis proyectos (user)</option>
              <option value="local">Solo este espacio (local)</option>
            </select>
          )}
        </Campo>
      </div>
      {datos.transporte === 'stdio' ? (
        <div className="campos">
          <Campo etiqueta="Comando">{(p) => <input {...p} {...TECNICO} value={datos.comando} onChange={set('comando')} placeholder="Ej.: npx" />}</Campo>
          <Campo etiqueta="Argumentos (uno por línea)">
            {(p) => <textarea {...p} {...TECNICO} rows={3} value={datos.args} onChange={set('args')} placeholder={'-y\n@paquete/servidor-mcp'} />}
          </Campo>
        </div>
      ) : (
        <Campo etiqueta="URL">
          {(p) => <input {...p} {...TECNICO} type="url" inputMode="url" value={datos.url} onChange={set('url')} placeholder="https://servidor.example/mcp" />}
        </Campo>
      )}
      <div className="acciones">
        <Boton variante="primario" enCurso={enviando} textoEnCurso="Agregando…" motivo={motivo} onClick={agregar}>Agregar con claude mcp add</Boton>
      </div>
    </div>
  );
}

function ChipHerramienta({ nombre, ok, detalle, neutro }) {
  const clase = ok ? 'ok' : neutro ? 'neutro' : 'error';
  return (
    <div className={`chip-estado ${clase}`}>
      <b>{nombre}</b>
      <span className="veredicto">
        <Icono de={ok ? CircleCheck : TriangleAlert} />
        {ok ? 'OK' : 'Revisar'}
      </span>
      {detalle && <span className="meta">{detalle}</span>}
    </div>
  );
}

export default function Conectores() {
  const { s, acciones } = useApp();
  const [revisar, revisando] = useAccion(() => acciones.refrescarConectores());
  const det = s.detectado || {};
  const ids = Object.keys(s.config?.fuentes || {});
  const sumables = Object.entries(s.catalogo?.fuentes || {}).filter(([id, c]) => !c.alias && c.via === 'mcp' && !ids.includes(id)).map(([id]) => id);
  return (
    <div className="pagina">
      <header className="cabecera">
        <div>
          <h1>Conectores</h1>
          <p className="bajada">Qué puede leer Claude y qué falta conectar. Acá no se guarda ninguna contraseña.</p>
        </div>
        <Boton variante="primario" icono={RefreshCw} enCurso={revisando} textoEnCurso="Revisando…" onClick={revisar}>Revisar de nuevo</Boton>
      </header>

      <section className="tarjeta">
        <h2>Fuentes</h2>
        <div className="tabla-scroll">
          <table className="tabla tabla-fuentes">
            <thead><tr><th scope="col">Fuente</th><th scope="col">Estado</th><th scope="col">Qué hacer</th><th scope="col">Activa</th></tr></thead>
            <tbody>
              {ids.map((id) => <FilaFuente key={id} id={id} />)}
              {sumables.map((id) => <FilaSumar key={id} id={id} />)}
            </tbody>
          </table>
        </div>
        {det.actualizado && <p className="pie-revisado" title={fechaHora(det.actualizado)}>Revisado {haceCuanto(det.actualizado)}</p>}
      </section>

      <section className="tarjeta">
        <h2>Cómo conectar una fuente de claude.ai</h2>
        <p>Calendario, mail, Slack, Teams o Jira se conectan desde tu cuenta de Claude:</p>
        <ol className="pasos-claude-ai">
          <li>Abrí <a href={URL_CONECTORES} target="_blank" rel="noreferrer">la configuración de conectores de claude.ai</a>.</li>
          <li>Elegí el conector (por ejemplo Microsoft 365, Google Calendar, Slack o Atlassian) y tocá <b>Conectar</b>.</li>
          <li>Autorizalo con tu cuenta en la ventana que se abre. Las credenciales quedan en claude.ai.</li>
          <li>Volvé acá y tocá <b>Revisar de nuevo</b>.</li>
          <li>Si la fuente sigue sin conectar, tocá <b>Elegir conector</b> en su fila y elegilo de la lista.</li>
        </ol>
      </section>

      <details className="tarjeta detalle-tecnico">
        <summary>Detalles técnicos y conectores avanzados</summary>
        <div className="contenido">
          <div className="estado-herramientas">
            <ChipHerramienta nombre="Claude Code" ok={Boolean(s.auth?.logueado)} detalle={s.auth?.detalle} />
            <ChipHerramienta nombre="GitHub CLI" ok={Boolean(det.gh?.ok)} detalle={det.gh?.detalle} />
            <ChipHerramienta nombre="Conectores MCP" ok={Boolean(det.mcp?.ok)} detalle={det.mcp?.ok ? `${det.mcp.servidores.length} detectados` : det.mcp?.error} />
            <ChipHerramienta nombre="Ollama" ok={Boolean(det.ollama?.ok)} neutro detalle={det.ollama?.detalle} />
          </div>

          <div className="tabla-scroll">
            <table className="tabla">
              <thead><tr><th scope="col">Fuente</th><th scope="col">Cómo se lee</th><th scope="col">Detalle</th><th scope="col">Herramientas</th></tr></thead>
              <tbody>
                {ids.map((id) => {
                  const f = s.config.fuentes[id];
                  const est = s.fuentes?.[id] || {};
                  const cat = s.catalogo?.fuentes?.[id] || {};
                  const n = est.herramientas?.length || 0;
                  return (
                    <tr key={id}>
                      <td>{nombreFuente(s, id)}</td>
                      <td title={f.via}>{VIA[f.via] || f.via}</td>
                      <td className="meta">
                        {est.detalle}
                        {!est.conectada && (est.como_conectar || cat.como_conectar) && <div>{est.como_conectar || cat.como_conectar}</div>}
                      </td>
                      <td className="num" title={(est.herramientas || []).join('\n')}>{n ? `${n} de lectura` : 'Ninguna'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {det.mcp?.servidores?.length > 0 && (
            <div>
              <h3>Conectores que ve Claude Code</h3>
              <ul className="lista-servidores">
                {det.mcp.servidores.map((x) => {
                  const k = x.estado === 'conectado' ? 'conectada' : x.estado === 'desconocido' ? 'desconocida' : 'desconectada';
                  return (
                    <li key={x.nombre}>
                      <span className={`conexion conexion-${k}`}>
                        <Icono de={ICONO_CONEXION[k]} />
                        {ESTADO_SERVIDOR[x.estado] || ESTADO_SERVIDOR.desconocido}
                      </span>
                      <b>{x.nombre}</b> <span className="meta">{x.detalle}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <p className="meta">
            El estado se lee con <code>claude mcp list</code> y <code>gh auth status</code>. La autorización queda en manos de Claude y de gh.
            {' '}{ids.length} {plural(ids.length, 'fuente configurada', 'fuentes configuradas')}.
          </p>

          <AgregarMcp />
        </div>
      </details>
    </div>
  );
}
