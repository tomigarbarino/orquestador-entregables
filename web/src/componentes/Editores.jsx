import { useId, useState } from 'react';
import { DIAS, NOMBRE_DIA } from '@lib/horario.mjs';
import { Icono, Stamp, TriangleAlert } from './Iconos.jsx';

// Campo con etiqueta asociada: <Campo etiqueta="Nombre">{(props) => <input {...props} />}</Campo>.
// Al control le llegan id, aria-describedby (ayuda y error) y aria-invalid.
export function Campo({ etiqueta, ayuda, error, opcional, children, className }) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const describedBy = [ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(' ') || undefined;
  const props = { id, 'aria-describedby': describedBy, 'aria-invalid': error ? 'true' : undefined };
  return (
    <div className={['campo', className].filter(Boolean).join(' ')}>
      {etiqueta && (
        <label htmlFor={id}>
          {etiqueta}
          {opcional && <span className="campo-opcional"> (opcional)</span>}
        </label>
      )}
      {typeof children === 'function' ? children(props) : children}
      {ayuda && <p className="campo-ayuda" id={idAyuda}>{ayuda}</p>}
      {error && (
        <p className="error-texto" id={idError}>
          <Icono de={TriangleAlert} tam={14} />
          {error}
        </p>
      )}
    </div>
  );
}

// Grupo de controles con título propio (fieldset + legend).
export function Grupo({ etiqueta, ayuda, children, className }) {
  const id = useId();
  return (
    <fieldset className={['campo', 'grupo', className].filter(Boolean).join(' ')} aria-describedby={ayuda ? `${id}-ayuda` : undefined}>
      {etiqueta && <legend>{etiqueta}</legend>}
      {children}
      {ayuda && <p className="campo-ayuda" id={`${id}-ayuda`}>{ayuda}</p>}
    </fieldset>
  );
}

export function EditorHorario({ horario, onChange }) {
  const aPedido = !horario || horario.a_pedido;
  const [aviso, setAviso] = useState('');
  return (
    <Grupo etiqueta="Cuándo corre">
      <div className="fila">
        <label className="interruptor-texto">
          <input
            type="checkbox"
            checked={aPedido}
            onChange={(e) => {
              setAviso('');
              onChange(e.target.checked ? { a_pedido: true } : { dias: ['lun', 'mar', 'mie', 'jue', 'vie'], hora: '09:00' });
            }}
          />{' '}
          A pedido
        </label>
        {!aPedido && (
          <>
            <div className="dias" role="group" aria-label="Días">
              {DIAS.map((d) => {
                const activo = horario.dias.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    className={`dia ${activo ? 'activo' : ''}`}
                    aria-pressed={activo}
                    aria-label={NOMBRE_DIA[d]}
                    title={NOMBRE_DIA[d]}
                    onClick={() => {
                      const dias = activo ? horario.dias.filter((x) => x !== d) : DIAS.filter((x) => x === d || horario.dias.includes(x));
                      if (!dias.length) {
                        setAviso('Tiene que quedar al menos un día (o marcá «A pedido»)');
                        return;
                      }
                      setAviso('');
                      onChange({ ...horario, dias });
                    }}
                  >
                    {NOMBRE_DIA[d].slice(0, 2)}
                  </button>
                );
              })}
            </div>
            <input type="time" className="num" aria-label="Hora" value={horario.hora} onChange={(e) => onChange({ ...horario, hora: e.target.value })} />
          </>
        )}
      </div>
      <p className="campo-ayuda" aria-live="polite">{aviso}</p>
    </Grupo>
  );
}

function urlValida(url) {
  if (!url || !String(url).trim()) return false;
  try {
    const u = new URL(url);
    return Boolean(u.hostname) && /^https?:$/.test(u.protocol);
  } catch {
    return false;
  }
}

export function EditorDestino({ destino, onChange }) {
  const d = destino || { tipo: 'borrador' };
  const set = (k, v) => onChange({ ...d, [k]: v || undefined });
  const [tocada, setTocada] = useState(false);
  const pideUrl = d.tipo === 'doc' || d.tipo === 'formulario';
  const errorUrl = !pideUrl || urlValida(d.url)
    ? null
    : !d.url && !tocada
      ? 'Falta la dirección: pegala completa, con https://'
      : 'Pegá la dirección completa, por ejemplo https://docs.empresa.com/tablero';
  const idSelect = useId();
  return (
    <Grupo etiqueta="A dónde se entrega">
      <p className="campo-ayuda con-icono">
        <Icono de={Stamp} tam={14} />
        Siempre llega primero como borrador: nada se manda sin tu OK.
      </p>
      <div className="fila fila-arriba">
        <select
          id={idSelect}
          aria-label="Tipo de destino"
          value={d.tipo}
          onChange={(e) => {
            setTocada(false);
            onChange({ tipo: e.target.value });
          }}
        >
          <option value="borrador">Queda como borrador</option>
          <option value="slack">Slack</option>
          <option value="doc">Documento</option>
          <option value="formulario">Formulario</option>
        </select>
        {d.tipo !== 'borrador' && (
          <Campo etiqueta="Nombre corto" opcional>
            {(p) => <input {...p} placeholder="Ej.: Tablero de tareas" value={d.nombre || ''} onChange={(e) => set('nombre', e.target.value)} />}
          </Campo>
        )}
        {d.tipo === 'slack' && (
          <Campo etiqueta="Canal">
            {(p) => (
              <input {...p} placeholder="#equipo" spellCheck={false} autoCapitalize="none" autoComplete="off" value={d.canal || ''} onChange={(e) => set('canal', e.target.value)} />
            )}
          </Campo>
        )}
        {pideUrl && (
          <Campo etiqueta="Dirección (URL)" error={errorUrl} className="ancho">
            {(p) => (
              <input
                {...p}
                type="url"
                inputMode="url"
                spellCheck={false}
                autoCapitalize="none"
                autoComplete="off"
                placeholder="https://…"
                value={d.url || ''}
                onBlur={() => setTocada(true)}
                onChange={(e) => set('url', e.target.value)}
              />
            )}
          </Campo>
        )}
      </div>
    </Grupo>
  );
}
