import { useApp } from '../estado.jsx';

export default function PanelNodo({ nodo, entregable }) {
  const { s, acciones } = useApp();
  const d = nodo.data;
  const fuente = d.fuente ? s.fuentes?.[d.fuente] : null;
  const cat = d.fuente ? s.catalogo?.fuentes?.[d.fuente] : null;
  const pedir = (texto) => acciones.escribirEnChat(texto);
  const enEntregable = entregable || d.entregable;

  return (
    <aside className="panel-nodo">
      <div className="panel-cabecera">
        <div>
          <div className="nodo-tipo">{d.tipo}</div>
          <h3>{d.titulo}</h3>
        </div>
        <button className="boton chico" onClick={() => acciones.ui({ nodo: null })}>Cerrar</button>
      </div>

      {d.subtitulo && <p>{d.subtitulo}</p>}
      {d.detalle && <p className="tenue">{d.detalle}</p>}

      {d.tipo === 'fuente' && (
        <>
          <p>
            <span className={`conexion conexion-${d.conexion}`}><i />{d.conexion === 'conectada' ? 'Conectada' : 'Sin conectar'}</span>{' '}
            {fuente?.detalle || d.detalleConexion}
          </p>
          {d.conexion !== 'conectada' && (fuente?.como_conectar || cat?.como_conectar) && <p className="consejo">{fuente?.como_conectar || cat?.como_conectar}</p>}
          {fuente?.herramientas?.length > 0 && (
            <details>
              <summary>Herramientas de solo lectura ({fuente.herramientas.length})</summary>
              <ul className="lista-codigo">{fuente.herramientas.map((h) => <li key={h}><code>{h}</code></li>)}</ul>
            </details>
          )}
          <div className="acciones">
            <button className="boton" onClick={() => acciones.ir('conectores')}>Ir a conectores</button>
            {enEntregable && <button className="boton" onClick={() => pedir(`En ${enEntregable}, cambiá cómo se usa la fuente ${d.fuente}: `)}>Cambiar en el chat</button>}
          </div>
        </>
      )}

      {d.tipo === 'paso' && (
        <>
          {d.usa?.length > 0 && <p>Lee: {d.usa.join(', ')}</p>}
          {d.modulo && <p className="tenue">Lo agrega el módulo {d.modulo}.</p>}
          <div className="acciones">
            <button className="boton primario" onClick={() => pedir(`Cambiar el paso "${d.titulo}" de ${enEntregable}: `)}>Cambiar este paso</button>
          </div>
        </>
      )}

      {d.tipo === 'control' && (
        <>
          <h4>Reglas del control</h4>
          <ul>{(d.reglas || []).map((r, i) => <li key={i}>{r}</li>)}</ul>
          <h4>Reglas aprendidas</h4>
          {d.reglasAprendidas?.length ? (
            <ul>{d.reglasAprendidas.map((r, i) => <li key={i}><span className="fecha">{r.fecha}</span> {r.texto}</li>)}</ul>
          ) : <p className="tenue">Todavía ninguna. Cada corrección que pidas en el chat queda acá, con su fecha.</p>}
          <div className="acciones">
            <button className="boton" onClick={() => pedir(`Sumá una regla al control de ${enEntregable}: `)}>Sumar una regla</button>
          </div>
        </>
      )}

      {(d.tipo === 'destino' || d.tipo === 'disparador' || d.tipo === 'entregable') && (
        <div className="acciones">
          <button className="boton" onClick={() => acciones.ir('entregables', { entregable: enEntregable })}>Editar en Entregables</button>
          {d.tipo === 'entregable' && <button className="boton primario" onClick={() => acciones.ui({ vista: 'entregable', entregable: d.entregable, nodo: null })}>Ver su flujo</button>}
          <button className="boton" onClick={() => pedir(`Cambiar ${d.tipo === 'disparador' ? 'cuándo corre' : d.tipo === 'destino' ? 'a dónde se entrega' : ''} ${enEntregable}: `)}>Cambiar en el chat</button>
        </div>
      )}
    </aside>
  );
}
