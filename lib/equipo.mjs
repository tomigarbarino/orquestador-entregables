// Perfil de equipo (equipo.yaml): lo que un equipo comparte y cada persona ajusta encima.
// Funciones puras, sin lectura de archivos: las usan el espacio, el servidor y los tests.

// Lo único que un perfil de equipo puede traer de la config.
export const CLAVES_EQUIPO = ['origen_tareas', 'fuentes', 'entregables', 'modulos', 'reglas_redaccion'];

// Campos de cada fuente que no tienen datos personales (carpetas, remitentes, notas y sesiones quedan afuera).
const CAMPOS_FUENTE = ['activo', 'via', 'servidor', 'herramientas_extra', 'proyectos', 'canales', 'menciones_directas', 'equipos', 'chats_directos', 'notetaker'];
const MAIL_COMPLETO = /[^\s@]+@[^\s@]+\.[^\s@]+/;

const esObjeto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const clonar = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const iguales = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Deep merge: la persona pisa al equipo. Los objetos se combinan clave por clave;
// las listas y los valores simples de la persona reemplazan a los del equipo.
export function fusionar(equipo, persona) {
  if (persona === undefined) return clonar(equipo);
  if (esObjeto(equipo) && esObjeto(persona)) {
    const salida = {};
    for (const k of new Set([...Object.keys(equipo), ...Object.keys(persona)])) {
      const v = fusionar(equipo[k], persona[k]);
      if (v !== undefined) salida[k] = v;
    }
    return salida;
  }
  return clonar(persona);
}

// Solo las claves que un perfil de equipo puede aportar (sin version ni nombre del equipo).
export function aporteDeEquipo(equipo) {
  const salida = {};
  for (const k of CLAVES_EQUIPO) if (equipo?.[k] !== undefined) salida[k] = clonar(equipo[k]);
  return salida;
}

// Config efectiva: el perfil de equipo como base y la config de la persona encima.
export function configEfectiva(equipo, persona) {
  if (!persona) return persona;
  return fusionar(aporteDeEquipo(equipo), persona);
}

// Rutas (con "/", como las del validador) de los valores que vienen del equipo y la persona no define.
// Una lista o un valor simple es una hoja; un objeto se recorre.
export function valoresDelEquipo(equipo, persona, base = '') {
  const salida = [];
  const recorrer = (e, p, ruta) => {
    if (e === undefined) return;
    if (esObjeto(e) && esObjeto(p)) {
      for (const k of Object.keys(e)) recorrer(e[k], p[k], `${ruta}/${k}`);
      return;
    }
    if (p === undefined) salida.push(ruta);
  };
  const aporte = aporteDeEquipo(equipo);
  for (const k of Object.keys(aporte)) recorrer(aporte[k], persona?.[k], `${base}/${k}`);
  return salida;
}

// Lo que se guarda en config.yaml de la persona al editar desde la interfaz: la config efectiva sin lo
// que solo viene del equipo (así no se copia al archivo de la persona y sigue heredándose).
export function sinHeredado(nueva, equipo, propia) {
  const aporte = aporteDeEquipo(equipo);
  if (!Object.keys(aporte).length) return nueva;
  const limpiar = (n, e, p, raiz) => {
    if (!esObjeto(n)) return n;
    const salida = {};
    for (const k of Object.keys(n)) {
      const enPropia = esObjeto(p) && k in p;
      const delEquipo = esObjeto(e) ? e[k] : undefined;
      if (!enPropia && delEquipo !== undefined && iguales(n[k], delEquipo)) continue;
      if (esObjeto(n[k]) && esObjeto(delEquipo)) {
        const sub = limpiar(n[k], delEquipo, enPropia ? p[k] : undefined, false);
        if (!Object.keys(sub).length && !enPropia) continue;
        salida[k] = sub;
      } else salida[k] = n[k];
    }
    return salida;
  };
  const salida = {};
  for (const k of Object.keys(nueva)) {
    if (!CLAVES_EQUIPO.includes(k)) {
      salida[k] = nueva[k];
      continue;
    }
    const enPropia = esObjeto(propia) && k in propia;
    if (!enPropia && iguales(nueva[k], aporte[k])) continue;
    salida[k] = esObjeto(nueva[k]) ? limpiar(nueva[k], aporte[k], propia?.[k], true) : nueva[k];
  }
  return salida;
}

// Arma el equipo.yaml a partir de una config: sin persona, sin nombres propios, sin mails ni carpetas.
export function perfilDeEquipo(config) {
  const perfil = { version: 1 };
  const nombre = config?.persona?.equipo;
  if (nombre) perfil.equipo = nombre;

  const origen = (config?.origen_tareas || []).map((o) => {
    const limpio = { fuente: o.fuente };
    for (const k of ['canales', 'equipos', 'proyectos', 'repos']) if (o[k]?.length) limpio[k] = [...o[k]];
    // Una dirección completa es de una persona: en el perfil quedan solo dominios (@empresa.com) y nombres.
    const remitentes = (o.remitentes || []).filter((r) => !MAIL_COMPLETO.test(r));
    if (remitentes.length) limpio.remitentes = remitentes;
    if (o.solo_mios !== undefined) limpio.solo_mios = o.solo_mios;
    return limpio;
  });
  if (origen.length) perfil.origen_tareas = origen;

  const fuentes = {};
  for (const [id, f] of Object.entries(config?.fuentes || {})) {
    const limpia = {};
    for (const k of CAMPOS_FUENTE) if (f[k] !== undefined) limpia[k] = clonar(f[k]);
    fuentes[id] = limpia;
  }
  if (Object.keys(fuentes).length) perfil.fuentes = fuentes;

  const entregables = {};
  for (const [id, e] of Object.entries(config?.entregables || {})) {
    const limpio = { receta: e.receta };
    if (e.nombre) limpio.nombre = e.nombre;
    limpio.activo = e.activo;
    if (e.fuentes) limpio.fuentes = [...e.fuentes];
    limpio.horario = clonar(e.horario);
    // Un canal de Slack que no es un canal (#...) puede ser una persona: ese destino no se comparte.
    const d = e.destino || { tipo: 'borrador' };
    limpio.destino = d.tipo === 'slack' && !String(d.canal || '').startsWith('#') ? { tipo: 'borrador' } : clonar(d);
    entregables[id] = limpio;
  }
  if (Object.keys(entregables).length) perfil.entregables = entregables;

  const modulos = {};
  for (const [clave, m] of Object.entries(config?.modulos || {})) modulos[clave] = { activo: Boolean(m.activo) };
  if (Object.keys(modulos).length) perfil.modulos = modulos;

  if (config?.reglas_redaccion?.length) perfil.reglas_redaccion = [...config.reglas_redaccion];
  return perfil;
}
