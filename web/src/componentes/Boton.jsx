// Botón con variantes, estado "en curso" y motivo visible cuando no está disponible.
// Un botón no disponible nunca queda mudo: sigue siendo enfocable (aria-disabled) y dice por qué.
import { useId } from 'react';
import { Icono, Info, LoaderCircle } from './Iconos.jsx';

const CLASE = { secundario: '', primario: 'primario', texto: 'texto', peligro: 'peligro' };

export default function Boton({
  variante = 'secundario',
  chico = false,
  soloIcono = false,
  icono,
  enCurso = false,
  textoEnCurso,
  motivo,
  type = 'button',
  onClick,
  children,
  className,
  title,
  disabled,
  ...resto
}) {
  const idMotivo = useId();
  const bloqueado = Boolean(motivo) || Boolean(enCurso);
  const clases = ['boton', CLASE[variante] ?? '', chico && 'chico', soloIcono && 'solo-icono', className].filter(Boolean).join(' ');
  const etiqueta = soloIcono && typeof children === 'string' ? children : undefined;
  const describedBy = [resto['aria-describedby'], motivo ? idMotivo : null].filter(Boolean).join(' ') || undefined;

  const manejar = (e) => {
    if (bloqueado || disabled) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };

  const contenido = enCurso ? (
    <>
      <Icono de={LoaderCircle} className="icono-gira" />
      {soloIcono ? <span className="visualmente-oculto">{textoEnCurso || 'En curso…'}</span> : <span>{textoEnCurso || children}</span>}
    </>
  ) : (
    <>
      {icono && <Icono de={icono} />}
      {soloIcono ? (typeof children === 'string' ? null : children) : children}
    </>
  );

  const boton = (
    <button
      {...resto}
      type={type}
      className={clases}
      onClick={manejar}
      disabled={disabled}
      aria-disabled={bloqueado ? 'true' : resto['aria-disabled']}
      aria-busy={enCurso ? 'true' : undefined}
      aria-describedby={describedBy}
      aria-label={resto['aria-label'] || etiqueta}
      title={motivo || title || etiqueta}
    >
      {contenido}
    </button>
  );

  if (!motivo) return boton;
  return (
    <span className="boton-con-motivo">
      {boton}
      <span className="motivo-deshabilitado" id={idMotivo}>
        <Icono de={Info} tam={14} />
        {motivo}
      </span>
    </span>
  );
}

export { Boton };
