import { DIAS, NOMBRE_DIA } from '@lib/horario.mjs';

export function EditorHorario({ horario, onChange }) {
  const aPedido = !horario || horario.a_pedido;
  return (
    <div className="campo">
      <label>Cuándo corre</label>
      <div className="fila">
        <label className="interruptor-texto">
          <input type="checkbox" checked={aPedido} onChange={(e) => onChange(e.target.checked ? { a_pedido: true } : { dias: ['lun', 'mar', 'mie', 'jue', 'vie'], hora: '09:00' })} /> A pedido
        </label>
        {!aPedido && (
          <>
            <div className="dias">
              {DIAS.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`dia ${horario.dias.includes(d) ? 'activo' : ''}`}
                  onClick={() => {
                    const dias = horario.dias.includes(d) ? horario.dias.filter((x) => x !== d) : DIAS.filter((x) => x === d || horario.dias.includes(x));
                    if (dias.length) onChange({ ...horario, dias });
                  }}
                >
                  {NOMBRE_DIA[d].slice(0, 2)}
                </button>
              ))}
            </div>
            <input type="time" value={horario.hora} onChange={(e) => onChange({ ...horario, hora: e.target.value })} />
          </>
        )}
      </div>
    </div>
  );
}

export function EditorDestino({ destino, onChange }) {
  const d = destino || { tipo: 'borrador' };
  const set = (k, v) => onChange({ ...d, [k]: v || undefined });
  return (
    <div className="campo">
      <label>A dónde se entrega <span className="tenue">(siempre como borrador primero)</span></label>
      <div className="fila">
        <select value={d.tipo} onChange={(e) => onChange({ tipo: e.target.value, ...(e.target.value === 'slack' ? { canal: '#canal' } : {}), ...(e.target.value === 'formulario' ? { url: 'https://' } : {}) })}>
          <option value="borrador">Borrador en el chat</option>
          <option value="slack">Slack</option>
          <option value="doc">Documento</option>
          <option value="formulario">Formulario</option>
        </select>
        {d.tipo !== 'borrador' && <input placeholder="Nombre corto" value={d.nombre || ''} onChange={(e) => set('nombre', e.target.value)} />}
        {d.tipo === 'slack' && <input placeholder="#canal" value={d.canal || ''} onChange={(e) => set('canal', e.target.value)} />}
        {(d.tipo === 'doc' || d.tipo === 'formulario') && <input className="ancho" placeholder="https://…" value={d.url || ''} onChange={(e) => set('url', e.target.value)} />}
      </div>
    </div>
  );
}

