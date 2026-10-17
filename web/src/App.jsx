import { useEffect, useRef } from 'react';
import { hayBorrador, useApp } from './estado.jsx';
import { rutaHumana } from './textos.js';
import { DEMO_ESTATICA, URL_REPO } from './demo/estatica.js';
import Visualizador from './paginas/Visualizador.jsx';
import Entregables from './paginas/Entregables.jsx';
import Conectores from './paginas/Conectores.jsx';
import Perfil from './paginas/Perfil.jsx';
import Asistente from './paginas/Asistente.jsx';
import Historial from './paginas/Historial.jsx';
import CasoGuiado from './paginas/CasoGuiado.jsx';
import Chat from './componentes/Chat.jsx';
import Boton from './componentes/Boton.jsx';
import {
  CircleCheck,
  CircleX,
  FileStack,
  FlaskConical,
  HistoryIcon,
  Highlighter,
  Icono,
  Plug,
  Plus,
  RefreshCw,
  ServerCrash,
  TriangleAlert,
  UserRound,
  WifiOff,
  Workflow,
  X,
} from './componentes/Iconos.jsx';

const PAGINAS = [
  { id: 'caso', nombre: 'Caso guiado', icono: FlaskConical, Componente: CasoGuiado },
  { id: 'visualizador', nombre: 'Inicio', icono: Workflow, Componente: Visualizador },
  { id: 'entregables', nombre: 'Entregables', icono: FileStack, Componente: Entregables, borradores: 'entregable:' },
  { id: 'conectores', nombre: 'Conectores', icono: Plug, Componente: Conectores },
  { id: 'perfil', nombre: 'Perfil', icono: UserRound, Componente: Perfil, borradores: 'perfil' },
  { id: 'historial', nombre: 'Historial', icono: HistoryIcon, Componente: Historial },
];
const ASISTENTE = { id: 'asistente', nombre: 'Nuevo entregable', Componente: Asistente, borradores: 'asistente' };
const TODAS = [...PAGINAS, ASISTENTE];

const ICONO_AVISO = { ok: CircleCheck, error: CircleX, propuesta: Highlighter, alerta: TriangleAlert };

function Aviso({ a }) {
  const { acciones } = useApp();
  return (
    <div className={`aviso aviso-${a.nivel}`}>
      <Icono de={ICONO_AVISO[a.nivel] || TriangleAlert} className="aviso-icono" />
      <span className="aviso-texto">{a.texto}</span>
      {a.accion && (
        <button
          type="button"
          className="boton chico"
          onClick={() => {
            acciones.cerrarAviso(a.id);
            a.accion.alHacer?.();
          }}
        >
          {a.accion.texto}
        </button>
      )}
      <Boton soloIcono chico variante="texto" icono={X} onClick={() => acciones.cerrarAviso(a.id)}>
        Cerrar aviso
      </Boton>
    </div>
  );
}

// Dos regiones vivas montadas vacías desde la primera carga: los lectores de pantalla
// anuncian solo lo que entra después.
function Avisos() {
  const { s } = useApp();
  const tranquilos = s.avisos.filter((a) => a.nivel !== 'error');
  const errores = s.avisos.filter((a) => a.nivel === 'error');
  return (
    <div className="avisos">
      <div role="status" aria-live="polite" className="avisos-grupo">
        {tranquilos.map((a) => <Aviso key={a.id} a={a} />)}
      </div>
      <div role="alert" className="avisos-grupo">
        {errores.map((a) => <Aviso key={a.id} a={a} />)}
      </div>
    </div>
  );
}

function Banners() {
  const { s, acciones } = useApp();
  const banners = [];
  if (s.auth && !s.auth.logueado) {
    banners.push(
      <div className="banner banner-error banner-con-icono" key="auth">
        <Icono de={TriangleAlert} className="banner-icono" />
        <div className="banner-cuerpo">
          <p>
            Claude todavía no tiene una sesión iniciada en esta compu. Sin eso no funcionan el chat ni «Probar ahora». Pedile a quien te lo instaló que corra
            «claude auth login» (o corrélo vos en una terminal) y después tocá «Revisar de nuevo» en Conectores.
          </p>
          <div className="acciones">
            <button type="button" className="boton chico" onClick={() => acciones.ir('conectores')}>Ir a Conectores</button>
          </div>
        </div>
      </div>,
    );
  }
  if (s.validacion && !s.validacion.ok) {
    const errores = s.validacion.errores.slice(0, 5).map((e) => ({ ...e, humana: rutaHumana(e.ruta, s) }));
    const primero = errores[0]?.humana;
    banners.push(
      <div className="banner banner-error banner-con-icono" key="valid">
        <Icono de={CircleX} className="banner-icono" />
        <div className="banner-cuerpo">
          <p><b>La configuración tiene errores.</b> Hasta que se corrijan no se puede probar ningún entregable.</p>
          <ul>
            {errores.map((e, i) => (
              <li key={i} title={e.ruta}>
                {`${e.humana.texto}: ${e.mensaje}`}
              </li>
            ))}
          </ul>
          <div className="acciones">
            <button
              type="button"
              className="boton chico"
              onClick={() => acciones.ir(primero?.pagina || 'perfil', primero?.entregable ? { entregableEnFoco: primero.entregable } : {})}
            >
              Corregir
            </button>
          </div>
        </div>
      </div>,
    );
  }
  if (!banners.length) return null;
  return <div className="banners">{banners}</div>;
}

function Esqueleto() {
  return (
    <div className="esqueleto" aria-busy="true" aria-label="Cargando el orquestador">
      <div><i className="alto" /><i /><i /><i className="corto" /><i /></div>
      <div><i className="alto" /><i className="corto" /><i className="bloque" /><i /><i className="corto" /></div>
      <div><i className="alto" /><i /><i className="corto" /></div>
    </div>
  );
}

function ErrorCarga() {
  const { s, acciones } = useApp();
  return (
    <main className="error-carga">
      <div className="error-carga-caja" role="alert">
        <Icono de={ServerCrash} tam={28} />
        <h1>No se pudo conectar con el orquestador</h1>
        <p>¿Sigue abierta la ventana donde corriste npm start o npm run demo? Si la cerraste, volvé a abrirla y tocá «Reintentar».</p>
        <Boton variante="primario" icono={RefreshCw} onClick={() => acciones.reintentarCarga()}>Reintentar</Boton>
        <details>
          <summary>Detalle técnico</summary>
          <code>{s.errorCarga}</code>
        </details>
      </div>
    </main>
  );
}

function PuntoSinGuardar() {
  return (
    <>
      <span className="punto-sin-guardar" title="Tenés cambios sin guardar" aria-hidden="true" />
      <span className="visualmente-oculto">, tiene cambios sin guardar</span>
    </>
  );
}

export default function App() {
  const { s, acciones } = useApp();
  const principal = useRef(null);

  // Cada vez que cambia la página, el contenido arranca desde arriba.
  useEffect(() => {
    principal.current?.scrollTo(0, 0);
  }, [s.ui.pagina]);

  if (s.errorCarga && !s.cargado) return <ErrorCarga />;
  if (!s.cargado) return <Esqueleto />;
  const pagina = TODAS.find((p) => p.id === s.ui.pagina) || PAGINAS[0];
  const pendientes = s.propuestas.filter((p) => p.estado === 'pendiente').length;
  const validaOk = s.validacion?.ok;
  return (
    <div className={`app ${s.ui.chatAbierto && pagina.id !== 'caso' ? 'con-chat' : ''}`}>
      <a className="salto-contenido" href="#contenido">Saltar al contenido</a>
      <div className="nav">
        <div className="marca">
          <span className="marca-logo" aria-hidden="true"><Icono de={Workflow} tam={20} /></span>
          <span className="marca-titulo">Orquestador de entregables</span>
        </div>
        <button
          type="button"
          className={`boton nav-nuevo ${pagina.id === 'asistente' ? 'activo' : ''}`}
          aria-current={pagina.id === 'asistente' ? 'page' : undefined}
          onClick={() => acciones.ir('asistente')}
        >
          <Icono de={Plus} />
          Nuevo entregable
          {hayBorrador(s, 'asistente') && <PuntoSinGuardar />}
        </button>
        <nav aria-label="Secciones">
          {PAGINAS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`nav-item ${p.id === pagina.id ? 'activo' : ''}`}
              aria-current={p.id === pagina.id ? 'page' : undefined}
              onClick={() => acciones.ir(p.id)}
            >
              <Icono de={p.icono} />
              <span className="nav-texto">{p.nombre}</span>
              {p.borradores && hayBorrador(s, p.borradores) && <PuntoSinGuardar />}
              {p.id === 'historial' && pendientes > 0 && (
                <span className="insignia num" aria-label={`${pendientes} ${pendientes === 1 ? 'propuesta pendiente' : 'propuestas pendientes'}`}>
                  {pendientes}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="nav-pie">
          <div className={`nav-validez ${validaOk ? 'ok' : 'error'}`}>
            <Icono de={validaOk ? CircleCheck : TriangleAlert} />
            <span>{pagina.id === 'caso' ? 'Snapshot público, sin cuentas' : validaOk ? 'Configuración válida' : 'La configuración tiene errores'}</span>
          </div>
          <div className="nav-persona">{pagina.id === 'caso' ? 'Caso guiado' : s.config?.persona?.nombre}</div>
          <div className="nav-espacio" title={pagina.id === 'caso' ? 'Corrida registrada · revisión humana pendiente' : s.espacio}>{pagina.id === 'caso' ? 'Corrida registrada · revisión pendiente' : s.espacio}</div>
        </div>
      </div>
      <div className="columna-principal">
        {s.conexion === 'cortada' && (
          <div className="franja-conexion" role="status">
            <Icono de={WifiOff} />
            Se cortó la conexión con el orquestador. Reintentando…
          </div>
        )}
        {DEMO_ESTATICA && (
          <div className="franja-demo franja-demo-publica" role="note">
            <Icono de={FlaskConical} />
            <span>
              Demo pública: el caso guiado reproduce un snapshot público; las otras recetas usan datos ficticios.{' '}
              <a href={URL_REPO} target="_blank" rel="noopener noreferrer">(github.com/tomigarbarino/orquestador-entregables)</a>
            </span>
          </div>
        )}
        {s.demo && !DEMO_ESTATICA && (
          <div className="franja-demo">
            <Icono de={FlaskConical} />
            Modo demo: datos ficticios, nada sale de tu compu.
          </div>
        )}
        <main id="contenido" className="principal" tabIndex={-1} ref={principal}>
          {pagina.id !== 'caso' && <Banners />}
          <pagina.Componente />
        </main>
        <Avisos />
      </div>
      {pagina.id !== 'caso' && <Chat />}
      <div className="visualmente-oculto" role="status" aria-live="polite">{s.anuncio}</div>
    </div>
  );
}
