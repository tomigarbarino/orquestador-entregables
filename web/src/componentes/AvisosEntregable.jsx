// Lo que conviene saber antes de probar un entregable: fuentes apagadas o sin conectar,
// avisos de coherencia de la configuración y si el entregable está apagado.
import { useId, useState } from 'react';
import { useAccion, useApp } from '../estado.jsx';
import { avisoCoherencia, nombreFuente } from '../textos.js';
import Boton from './Boton.jsx';
import { Icono, TriangleAlert } from './Iconos.jsx';

function BotonPrender({ fuente }) {
  const { s, acciones } = useApp();
  const nombre = nombreFuente(s, fuente);
  const [prender, enCurso] = useAccion(async () => {
    const config = s.config;
    if (!config?.fuentes?.[fuente]) return;
    await acciones.guardarConfig(
      { ...config, fuentes: { ...config.fuentes, [fuente]: { ...config.fuentes[fuente], activo: true } } },
      `Prender ${nombre}`,
    );
  });
  return (
    <Boton chico enCurso={enCurso} textoEnCurso="Prendiendo…" onClick={prender}>
      Prender {nombre}
    </Boton>
  );
}

function fuentesDe(s, id) {
  const e = s.config?.entregables?.[id];
  if (!e) return [];
  if (Array.isArray(e.fuentes)) return e.fuentes;
  return s.recetas?.[e.receta]?.receta?.fuentes?.map((f) => f.id) || [];
}

export function avisosDeEntregable(s, id) {
  const lista = [];
  if (!s?.config?.entregables?.[id]) return lista;
  const prefijo = `/entregables/${id}/`;
  const vistas = new Set();
  for (const a of s.validacion?.avisos || []) {
    const ruta = typeof a === 'string' ? a.split(':')[0] : a?.ruta || '';
    if (!`${ruta}/`.startsWith(prefijo)) continue;
    const h = avisoCoherencia(a, s);
    if (h.fuente) vistas.add(h.fuente);
    lista.push({ clave: `c-${lista.length}`, texto: h.texto, fuente: h.fuente, accion: h.accion });
  }
  for (const f of fuentesDe(s, id)) {
    const est = s.fuentes?.[f];
    const activa = s.config?.fuentes?.[f]?.activo !== false && est?.activa !== false;
    if (!est || !activa || est.conectada !== false || vistas.has(f)) continue;
    lista.push({
      clave: `f-${f}`,
      texto: `${nombreFuente(s, f)} falta conectar: lo que salga de ahí va a quedar afuera del borrador.`,
      fuente: f,
      accion: 'conectores',
    });
  }
  return lista;
}

function Accion({ aviso }) {
  const { acciones } = useApp();
  if (aviso.accion === 'prender' && aviso.fuente) return <BotonPrender fuente={aviso.fuente} />;
  if (aviso.accion === 'conectores') {
    return (
      <button type="button" className="boton texto chico" onClick={() => acciones.ir('conectores')}>
        Ir a Conectores
      </button>
    );
  }
  return null;
}

export default function AvisosEntregable({ id, variante = 'completo' }) {
  const { s } = useApp();
  const [abierto, setAbierto] = useState(false);
  const idResto = useId();
  if (!id || !s?.config?.entregables?.[id]) return null;
  const lista = avisosDeEntregable(s, id);
  if (variante === 'completo' && s.config.entregables[id].activo === false) {
    lista.push({ clave: 'apagado', texto: 'Este entregable está apagado: no corre solo, pero podés probarlo igual.', accion: null });
  }
  if (!lista.length) return null;

  if (variante === 'compacto') {
    const [primero, ...resto] = lista;
    return (
      <div className="banner banner-alerta avisos-entregable compacto">
        <div className="avisos-entregable-linea">
          <Icono de={TriangleAlert} className="banner-icono" />
          <span>{primero.texto}</span>
          <Accion aviso={primero} />
          {resto.length > 0 && (
            <button type="button" className="boton texto chico" aria-expanded={abierto} aria-controls={idResto} onClick={() => setAbierto(!abierto)}>
              {abierto ? 'Ver menos' : `y ${resto.length} más`}
            </button>
          )}
        </div>
        {resto.length > 0 && abierto && (
          <ul id={idResto} className="avisos-entregable-lista">
            {resto.map((a) => (
              <li key={a.clave}>
                <span>{a.texto}</span>
                <Accion aviso={a} />
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="banner banner-alerta avisos-entregable">
      <Icono de={TriangleAlert} className="banner-icono" />
      <ul className="avisos-entregable-lista">
        {lista.map((a) => (
          <li key={a.clave}>
            <span>{a.texto}</span>
            <Accion aviso={a} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export { AvisosEntregable };
