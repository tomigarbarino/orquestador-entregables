// Textos visibles de la interfaz: estados, nombres, fechas y traducciones de lo técnico
// a lenguaje de oficina. JS puro (sin React ni alias de Vite) para poder testearlo con node --test.
import { entregablesDe } from '../../lib/receta-efectiva.mjs';

export const ESTADO_PRUEBA = { en_curso: 'Probando…', lista: 'Borrador listo', error: 'Falló', cancelada: 'Cancelada' };
export const ESTADO_NODO = { en_curso: 'En curso', ok: 'Listo', error: 'Error', omitido: 'Omitido', aviso: 'Aviso', espera: 'En espera', sin_probar: 'Sin probar' };
export const TEXTO_CONEXION = { conectada: 'Conectada', desconectada: 'Falta conectar', apagada: 'No se usa', desconocida: 'Sin revisar' };
export const TIPO_NODO = {
  disparador: 'Cuándo corre',
  fuente: 'Lee de',
  paso: 'Paso',
  control: 'Antes de entregar',
  destino: 'Se entrega en',
  orquestador: 'Arma los borradores',
  entregable: 'Entregable',
};
export const ORIGEN_PRUEBA = { interfaz: 'Desde la interfaz', rutina: 'Programada', consola: 'Desde la terminal', 'claude-code': 'Desde Claude Code' };
export const ORIGEN_PROPUESTA = { chat: 'Desde el chat', asistente: 'Desde el asistente', 'claude-code': 'Desde Claude Code', interfaz: 'Desde la interfaz' };

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function origenHumano(mapa, clave) {
  return (mapa && Object.prototype.hasOwnProperty.call(mapa, clave) && mapa[clave]) || 'Otro origen';
}

export function plural(n, singular, pluralTexto) {
  return Number(n) === 1 ? singular : pluralTexto;
}

function capitalizar(t) {
  const x = String(t ?? '');
  return x ? x[0].toUpperCase() + x.slice(1) : x;
}

const NOMBRE_FUENTE = { reuniones: 'Reuniones (notetaker)' };

export function nombreFuente(s, id) {
  if (!id) return '';
  return s?.fuentes?.[id]?.nombre || s?.catalogo?.fuentes?.[id]?.nombre || NOMBRE_FUENTE[id] || capitalizar(String(id).replace(/_/g, ' '));
}

function listaEntregables(s) {
  try {
    return entregablesDe(s?.config, s?.recetas, s?.modulos);
  } catch {
    return [];
  }
}

export function nombreEntregable(s, id) {
  if (!id) return '';
  const e = s?.config?.entregables?.[id];
  const desdeConfig = e?.nombre || s?.recetas?.[e?.receta]?.receta?.nombre;
  if (desdeConfig) return desdeConfig;
  const efectivo = listaEntregables(s).find((x) => x.id === id);
  return efectivo?.nombre || s?.recetas?.[id]?.receta?.nombre || id;
}

function nombreReceta(s, id) {
  const usado = Object.entries(s?.config?.entregables || {}).find(([, e]) => e?.receta === id);
  if (usado) return nombreEntregable(s, usado[0]);
  return s?.recetas?.[id]?.receta?.nombre || id;
}

// 'YYYY-MM-DD' (o un ISO que empiece así) → '9 oct 2026', sin pasar por UTC.
export function fecha(isoDia) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDia ?? ''));
  if (!m) return '';
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return '';
  return `${dia} ${MESES[mes - 1]} ${m[1]}`;
}

function aFecha(iso) {
  if (iso === null || iso === undefined || iso === '') return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const dos = (n) => String(n).padStart(2, '0');

export function fechaHora(iso) {
  const d = aFecha(iso);
  if (!d) return '';
  const hoy = new Date();
  const anio = d.getFullYear() === hoy.getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MESES[d.getMonth()]}${anio}, ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

export function haceCuanto(iso) {
  const d = aFecha(iso);
  if (!d) return '';
  const seg = Math.round((Date.now() - d.getTime()) / 1000);
  if (seg < 0) return fechaHora(d);
  if (seg < 60) return 'hace un momento';
  const min = Math.round(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dias = Math.round(h / 24);
  if (dias === 1) return 'ayer';
  if (dias < 7) return `hace ${dias} días`;
  return fechaHora(d);
}

export function dinero(n) {
  if (n === null || n === undefined || n === '' || typeof n === 'boolean') return '';
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  const fijo = v.toFixed(v !== 0 && Math.abs(v) < 0.01 ? 3 : 2);
  const [entero, dec] = fijo.split('.');
  return `US$ ${entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
}

export function entregableSugerido(s) {
  const entregables = s?.config?.entregables || {};
  const ids = Object.keys(entregables);
  if (!ids.length) return null;
  if (entregables.daily && entregables.daily.activo !== false) return 'daily';
  return ids.find((id) => entregables[id]?.activo !== false) || ids[0];
}

function entregableDeReceta(receta, s) {
  if (!receta) return null;
  const entregables = s?.config?.entregables || {};
  if (entregables[receta]?.receta === receta) return receta;
  const usado = Object.entries(entregables).find(([, e]) => e?.receta === receta);
  if (usado) return usado[0];
  if (entregables[receta]) return receta;
  return null;
}

export function entregableDePropuesta(p, s) {
  if (!p) return null;
  if (p.entregable) return p.entregable;
  const desdeRegla = entregableDeReceta(p.regla?.receta, s);
  if (desdeRegla) return desdeRegla;
  const archivos = [...(p.diffs || []).map((x) => x?.archivo), ...(p.cambios || []).map((x) => x?.archivo || x?.ruta)];
  for (const a of archivos) {
    const m = /^recetas\/([^/]+)\//.exec(String(a || ''));
    const id = m && entregableDeReceta(m[1], s);
    if (id) return id;
  }
  for (const c of p.cambios || []) {
    const id = entregableDeReceta(c?.receta, s);
    if (id) return id;
  }
  return null;
}

export function destinoHumano(destino) {
  const d = destino || { tipo: 'borrador' };
  switch (d.tipo) {
    case 'slack': {
      const canal = d.canal && d.canal !== '#canal' ? d.canal : d.nombre;
      return {
        titulo: canal ? `Slack · ${canal}` : 'Slack',
        frase: 'Llega a Slack solo cuando lo aprobás y pedís que se entregue.',
      };
    }
    case 'doc':
      return {
        titulo: d.nombre ? `Documento · ${d.nombre}` : 'Documento',
        frase: 'Se suma al documento solo cuando lo aprobás y pedís que se entregue.',
      };
    case 'formulario':
      return {
        titulo: d.nombre ? `Formulario · ${d.nombre}` : 'Formulario',
        frase: 'Se carga en el formulario solo cuando lo aprobás y pedís que se entregue.',
      };
    case 'borrador':
    case undefined:
    case null:
    case '':
      return { titulo: 'Queda como borrador', frase: 'No tiene destino: lo copiás y lo usás donde quieras.' };
    default:
      return {
        titulo: d.nombre ? `${capitalizar(d.tipo)} · ${d.nombre}` : capitalizar(d.tipo),
        frase: 'Se entrega solo cuando lo aprobás y pedís que se entregue.',
      };
  }
}

export function refHumana(fuente, ref) {
  const crudo = String(ref ?? '');
  const pr = /^[^/\s#]+\/([^#\s/]+)#(\d+)$/.exec(crudo);
  if (pr) return { texto: `PR #${pr[2]} · ${pr[1]}`, title: crudo };
  if (/^claude:/i.test(crudo)) return { texto: 'Sesión de Claude Code', title: crudo };
  if (/^codex:/i.test(crudo)) return { texto: 'Sesión de Codex', title: crudo };
  return { texto: crudo, title: crudo };
}

const CAMPO_ENTREGABLE = {
  fuentes: 'Fuentes',
  horario: 'Horario',
  destino: 'Destino',
  receta: 'Instrucciones',
  activo: 'Encendido',
  opciones: 'Opciones',
  nombre: 'Nombre',
};
const CAMPO_PERFIL = {
  persona: 'Tus datos',
  idioma: 'Idioma',
  zona_horaria: 'Zona horaria',
  proyectos: 'Proyectos',
  personas: 'Personas',
  clientes: 'Clientes',
  glosario: 'Glosario',
  reglas_redaccion: 'Reglas de redacción',
  marca: 'Marca',
  version: 'Versión',
};

export function rutaHumana(ruta, s) {
  const r = String(ruta ?? '').trim();
  if (!r || r === '/' || r === 'config.yaml') return { texto: 'Configuración', pagina: 'perfil' };
  const receta = /^receta\s+([^/\s]+)/.exec(r);
  if (receta) {
    const entregable = entregableDeReceta(receta[1], s);
    return { texto: `Instrucciones de ${nombreReceta(s, receta[1])}`, pagina: 'entregables', ...(entregable ? { entregable } : {}) };
  }
  if (r === 'regla') return { texto: 'Regla nueva', pagina: 'historial' };
  const partes = r.replace(/^\//, '').split('/').filter(Boolean);
  const [raiz, id, campo] = partes;
  if (raiz === 'entregables') {
    if (!id) return { texto: 'Entregables', pagina: 'entregables' };
    const nombre = nombreEntregable(s, id);
    const texto = campo ? `${nombre} › ${CAMPO_ENTREGABLE[campo] || capitalizar(campo)}` : nombre;
    return { texto, pagina: 'entregables', entregable: id };
  }
  if (raiz === 'fuentes') {
    return { texto: id ? `Conectores › ${nombreFuente(s, id)}` : 'Conectores', pagina: 'conectores' };
  }
  if (raiz === 'modulos') {
    const m = (s?.modulos || []).find((x) => x.clave === id);
    return { texto: id ? `Módulos › ${m?.nombre || id}` : 'Módulos', pagina: 'entregables' };
  }
  const nombre = CAMPO_PERFIL[raiz] || capitalizar(raiz.replace(/_/g, ' '));
  const indice = /^\d+$/.test(id || '') ? ` (${Number(id) + 1})` : '';
  return { texto: `Perfil › ${nombre}${indice}`, pagina: 'perfil' };
}

export function archivoHumano(archivo, s) {
  const a = String(archivo ?? '');
  if (/(^|\/)config\.ya?ml$/.test(a)) return 'Configuración';
  const m = /^(?:recetas\/)?([^/]+)\/(receta\.ya?ml|instrucciones\.md)$/.exec(a);
  if (m) return `Instrucciones de ${nombreReceta(s, m[1])}`;
  return a;
}

// Avisos de lib/validar.mjs (coherencia). Formatos conocidos:
//   { ruta: '/entregables/{id}/fuentes', mensaje: 'la fuente "x" está apagada' }
//   { ruta: '/entregables/{id}/fuentes', mensaje: 'la receta necesita la fuente "x" (para qué)' }
// También acepta el aviso como texto suelto con 'ruta: mensaje'.
export function avisoCoherencia(aviso, s) {
  let ruta = '';
  let mensaje = '';
  if (typeof aviso === 'string') {
    const m = /^(\S+):\s*(.*)$/.exec(aviso);
    if (m) [, ruta, mensaje] = m;
    else mensaje = aviso;
  } else if (aviso && typeof aviso === 'object') {
    ruta = aviso.ruta || '';
    mensaje = aviso.mensaje || '';
  }
  const ent = /^\/entregables\/([^/]+)/.exec(ruta);
  const entregable = ent ? ent[1] : null;
  const apagada = /la fuente "([^"]+)" está apagada/.exec(mensaje);
  if (apagada) {
    const fuente = apagada[1];
    return {
      texto: `${nombreFuente(s, fuente)} está apagada: lo que salga de ahí va a quedar afuera del borrador.`,
      entregable,
      fuente,
      accion: 'prender',
    };
  }
  const necesita = /la receta necesita la fuente "([^"]+)"(?:\s*\(([^)]*)\))?/.exec(mensaje);
  if (necesita) {
    const fuente = necesita[1];
    const para = necesita[2] ? ` (la usa para ${necesita[2].replace(/^para\s+/i, '')})` : '';
    const quien = entregable ? nombreEntregable(s, entregable) : 'Este entregable';
    return {
      texto: `${quien} necesita ${nombreFuente(s, fuente)}${para}, pero no está entre las fuentes que lee.`,
      entregable,
      fuente,
      accion: null,
    };
  }
  const modulo = /no hay un módulo "([^"]+)"/.exec(mensaje);
  if (modulo) return { texto: `La configuración nombra un módulo que no existe (${modulo[1]}).`, entregable, fuente: null, accion: null };
  const catalogo = /^"([^"]+)" no está en el catálogo/.exec(mensaje);
  if (catalogo) {
    return {
      texto: `${nombreFuente(s, catalogo[1])} no es una fuente conocida: Claude solo va a usar las herramientas que le indiques a mano.`,
      entregable,
      fuente: catalogo[1],
      accion: null,
    };
  }
  return { texto: capitalizar(mensaje || 'Hay algo para revisar en la configuración.'), entregable, fuente: null, accion: null };
}

export function duracionEstimada(s) {
  return s?.demo ? 'En la demo tarda unos segundos.' : 'Suele tardar entre 1 y 3 minutos.';
}
