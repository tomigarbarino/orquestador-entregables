// La semana: qué entregable corre cada día. Compacta y sin falsas alarmas.
import { semana } from '@lib/horario.mjs';

// El nombre accesible dice el día: «Lunes, 09:00: Daily» (y «apagado» si corresponde).
function Item({ item, dia, onEntregable, conHora = true }) {
  const titulo = `${item.nombre}${item.activo ? '' : ' (apagado)'}`;
  const etiqueta = `${dia}${conHora ? `, ${item.hora}` : ''}: ${item.nombre}${item.activo ? '' : ', apagado'}`;
  return (
    <button type="button" className={`semana-item${item.activo ? '' : ' apagado'}`} title={titulo} aria-label={etiqueta} onClick={() => onEntregable?.(item.id)}>
      {conHora && <span className="semana-hora num">{item.hora}<span aria-hidden="true"> ·</span></span>}
      <span className="semana-nombre-item">{item.nombre}</span>
      {!item.activo && <span className="semana-apagado">Apagado</span>}
    </button>
  );
}

export default function Semana({ entregables, hoy, onEntregable }) {
  const s = semana(entregables);
  return (
    <section className="semana" aria-labelledby="semana-titulo">
      <h2 id="semana-titulo">La semana</h2>
      <div className="semana-contenedor">
        <ul className="semana-grilla">
          {s.dias.map((d) => {
            const esHoy = hoy === d.dia;
            const finde = d.dia === 'sab' || d.dia === 'dom';
            return (
              <li key={d.dia} className={`semana-dia${esHoy ? ' hoy' : ''}${finde ? ' finde' : ''}`} aria-current={esHoy ? 'date' : undefined}>
                <div className="semana-nombre">
                  <span>{d.nombre}</span>
                  {esHoy && <span className="semana-hoy">Hoy</span>}
                </div>
                {d.items.length > 0 && (
                  <ul className="semana-items">
                    {d.items.map((i) => <li key={i.id}><Item item={i} dia={d.nombre} onEntregable={onEntregable} /></li>)}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        {s.aPedido.length > 0 && (
          <div className="semana-dia semana-pedido">
            <div className="semana-nombre"><span>A pedido</span></div>
            <ul className="semana-items">
              {s.aPedido.map((i) => <li key={i.id}><Item item={i} dia="A pedido" onEntregable={onEntregable} conHora={false} /></li>)}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
