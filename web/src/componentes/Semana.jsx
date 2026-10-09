import { semana } from '@lib/horario.mjs';

export default function Semana({ entregables, hoy, onEntregable }) {
  const s = semana(entregables);
  return (
    <section className="semana">
      <h2>La semana</h2>
      <div className="semana-grilla">
        {s.dias.map((d) => (
          <div key={d.dia} className={`semana-dia ${hoy === d.dia ? 'hoy' : ''}`}>
            <div className="semana-nombre">{d.nombre}{hoy === d.dia ? ' · hoy' : ''}</div>
            {d.items.length === 0 && <div className="semana-vacio">—</div>}
            {d.items.map((i) => (
              <button key={i.id} className={`semana-item ${i.activo ? '' : 'inactivo'}`} onClick={() => onEntregable?.(i.id)}>
                <span className="semana-hora">{i.hora}</span> {i.nombre}
              </button>
            ))}
          </div>
        ))}
      </div>
      {s.aPedido.length > 0 && (
        <div className="semana-pedido">
          A pedido:{' '}
          {s.aPedido.map((i) => (
            <button key={i.id} className={`semana-item ${i.activo ? '' : 'inactivo'}`} onClick={() => onEntregable?.(i.id)}>{i.nombre}</button>
          ))}
        </div>
      )}
    </section>
  );
}
