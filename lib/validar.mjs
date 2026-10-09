// Validación de la configuración y de las recetas. La usan la interfaz (en el navegador)
// y el orquestador (en Node), con los mismos esquemas.
import Ajv from 'ajv';
import localizar from 'ajv-i18n/localize/es/index.js';

function formatear(errores) {
  if (!errores) return [];
  localizar(errores);
  // Los errores de "if/then" y "oneOf" repiten lo mismo con otras palabras: se dejan los concretos.
  const utiles = errores.filter((e) => !['if', 'oneOf', 'anyOf'].includes(e.keyword));
  const lista = (utiles.length ? utiles : errores).map((e) => {
    let mensaje = e.message;
    if (e.keyword === 'additionalProperties') mensaje = `no se reconoce el campo "${e.params.additionalProperty}"`;
    if (e.keyword === 'required') mensaje = `falta el campo "${e.params.missingProperty}"`;
    if (e.keyword === 'enum') mensaje = `tiene que ser uno de: ${e.params.allowedValues.join(', ')}`;
    return { ruta: e.instancePath || '/', mensaje };
  });
  const vistos = new Set();
  return lista.filter((e) => {
    const clave = `${e.ruta}|${e.mensaje}`;
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

export function crearValidadores({ config, receta }) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const vConfig = ajv.compile(config);
  const vReceta = ajv.compile(receta);
  return {
    config(datos) {
      const ok = vConfig(datos);
      return { ok, errores: ok ? [] : formatear(vConfig.errors) };
    },
    receta(datos) {
      const ok = vReceta(datos);
      return { ok, errores: ok ? [] : formatear(vReceta.errors) };
    },
  };
}

// Chequeos que el esquema no puede hacer solo: referencias entre config, recetas y módulos.
// recetas: { id: { receta } }. modulos: lista de módulos. Devuelve errores y avisos.
export function coherencia(config, recetas, modulos = [], catalogo = { fuentes: {} }) {
  const errores = [];
  const avisos = [];
  if (!config || typeof config !== 'object') return { errores, avisos };
  const fuentes = config.fuentes || {};
  for (const [id, e] of Object.entries(config.entregables || {})) {
    const base = recetas[e.receta];
    if (!base) {
      errores.push({ ruta: `/entregables/${id}/receta`, mensaje: `no existe la receta "${e.receta}"` });
      continue;
    }
    for (const f of e.fuentes || []) {
      if (!fuentes[f]) errores.push({ ruta: `/entregables/${id}/fuentes`, mensaje: `la fuente "${f}" no está definida en "fuentes"` });
      else if (!fuentes[f].activo) avisos.push({ ruta: `/entregables/${id}/fuentes`, mensaje: `la fuente "${f}" está apagada` });
    }
    const usadas = e.fuentes || base.receta.fuentes.map((f) => f.id);
    for (const f of base.receta.fuentes.filter((x) => x.requerida)) {
      if (!usadas.includes(f.id)) avisos.push({ ruta: `/entregables/${id}/fuentes`, mensaje: `la receta necesita la fuente "${f.id}" (${f.para})` });
    }
  }
  const claves = new Set(modulos.map((m) => m.clave));
  for (const clave of Object.keys(config.modulos || {})) {
    if (!claves.has(clave)) avisos.push({ ruta: `/modulos/${clave}`, mensaje: `no hay un módulo "${clave}"` });
  }
  for (const id of Object.keys(fuentes)) {
    if (catalogo.fuentes && !catalogo.fuentes[id]) avisos.push({ ruta: `/fuentes/${id}`, mensaje: `"${id}" no está en el catálogo: el orquestador solo usará las herramientas de "herramientas_extra"` });
  }
  return { errores, avisos };
}
