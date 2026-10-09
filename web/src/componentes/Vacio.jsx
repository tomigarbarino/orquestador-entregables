// Estado vacío: ícono, título, texto y (opcional) la acción que destraba la pantalla.
import { Icono } from './Iconos.jsx';

export default function Vacio({ icono, titulo, accion, children, className }) {
  return (
    <div className={['vacio', className].filter(Boolean).join(' ')}>
      {icono && <Icono de={icono} tam={24} className="vacio-icono" />}
      {titulo && <p className="vacio-titulo">{titulo}</p>}
      {children && <p className="vacio-texto">{children}</p>}
      {accion && <div className="vacio-accion">{accion}</div>}
    </div>
  );
}

export { Vacio };
