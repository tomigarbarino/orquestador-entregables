import { useApp } from './estado.jsx';
import Visualizador from './paginas/Visualizador.jsx';
import Entregables from './paginas/Entregables.jsx';
import Conectores from './paginas/Conectores.jsx';
import Perfil from './paginas/Perfil.jsx';
import Asistente from './paginas/Asistente.jsx';
import Historial from './paginas/Historial.jsx';
import Chat from './componentes/Chat.jsx';

const PAGINAS = [
  { id: 'visualizador', nombre: 'Visualizador', Componente: Visualizador },
  { id: 'entregables', nombre: 'Entregables', Componente: Entregables },
  { id: 'conectores', nombre: 'Conectores', Componente: Conectores },
  { id: 'perfil', nombre: 'Perfil', Componente: Perfil },
  { id: 'asistente', nombre: 'Nuevo entregable', Componente: Asistente },
  { id: 'historial', nombre: 'Historial', Componente: Historial },
];

function Avisos() {
  const { s, d } = useApp();
  return (
    <div className="avisos">
      {s.avisos.map((a) => (
        <div key={a.id} className={`aviso aviso-${a.nivel}`} onClick={() => d({ tipo: 'cerrarAviso', id: a.id })}>
          {a.texto}
        </div>
      ))}
    </div>
  );
}

function Banners() {
  const { s, acciones } = useApp();
  const banners = [];
  if (s.auth && !s.auth.logueado) {
    banners.push(
      <div className="banner banner-error" key="auth">
        <b>Claude Code no tiene una sesión iniciada.</b> El chat y "Probar ahora" lo necesitan. Abrí una terminal, corré <code>claude auth login</code> y después tocá "Revisar de nuevo" en Conectores.
      </div>,
    );
  }
  if (s.validacion && !s.validacion.ok) {
    banners.push(
      <div className="banner banner-error" key="valid">
        <b>La configuración tiene errores:</b>
        <ul>{s.validacion.errores.slice(0, 5).map((e, i) => <li key={i}><code>{e.ruta}</code> {e.mensaje}</li>)}</ul>
        <button className="boton chico" onClick={() => acciones.ir('perfil')}>Corregir</button>
      </div>,
    );
  }
  return banners;
}

export default function App() {
  const { s, acciones } = useApp();
  if (s.errorCarga) return <div className="cargando">No se pudo cargar la interfaz: {s.errorCarga}</div>;
  if (!s.cargado) return <div className="cargando">Cargando…</div>;
  const pagina = PAGINAS.find((p) => p.id === s.ui.pagina) || PAGINAS[0];
  const pendientes = s.propuestas.filter((p) => p.estado === 'pendiente').length;
  return (
    <div className={`app ${s.ui.chatAbierto ? 'con-chat' : ''}`}>
      <aside className="nav">
        <div className="marca">
          <div className="marca-logo" aria-hidden="true"><span /><span /><span /></div>
          <div>
            <div className="marca-titulo">Orquestador</div>
            <div className="marca-sub">de entregables</div>
          </div>
        </div>
        <nav>
          {PAGINAS.map((p) => (
            <button key={p.id} className={`nav-item ${p.id === pagina.id ? 'activo' : ''}`} onClick={() => acciones.ir(p.id)}>
              {p.nombre}
              {p.id === 'historial' && pendientes > 0 && <span className="insignia">{pendientes}</span>}
            </button>
          ))}
        </nav>
        <div className="nav-pie">
          {s.demo && <div className="etiqueta etiqueta-demo">Modo demo</div>}
          <div className={`etiqueta ${s.validacion?.ok ? 'etiqueta-ok' : 'etiqueta-error'}`}>{s.validacion?.ok ? 'Config válida' : 'Config con errores'}</div>
          <div className="nav-persona">{s.config?.persona?.nombre}</div>
          <div className="nav-espacio" title={s.espacio}>{s.espacio}</div>
        </div>
      </aside>
      <main className="principal">
        <Banners />
        <pagina.Componente />
      </main>
      <Chat />
      <Avisos />
    </div>
  );
}
