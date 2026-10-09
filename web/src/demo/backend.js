// Backend simulado en memoria para la demo pública estática. Implementa las mismas rutas y formatos
// que servidor/index.mjs, sin servidor: los archivos del repo (recetas, módulos, esquemas, catálogo y
// ejemplos) entran en el build y todo lo que cambia la persona vive solo en esta pestaña.
import YAML from 'yaml';
import { createTwoFilesPatch } from 'diff';
import { crearValidadores, coherencia } from '@lib/validar.mjs';
import { entregablesDe, recetaEfectiva, nombreDestino } from '@lib/receta-efectiva.mjs';
import { contextoPlantilla, completar } from '@lib/plantilla.mjs';
import { configEfectiva, valoresDelEquipo, sinHeredado, perfilDeEquipo } from '@lib/equipo.mjs';
import { generarEntregable } from '@lib/asistente.mjs';
import { armarEspacio, propuestasAplicadas, corridasSemilla, chatSemilla } from '@lib/semilla.mjs';
import { ahoraEn } from '@lib/horario.mjs';
import esquemaConfig from '../../../esquema/config.schema.json';
import esquemaReceta from '../../../esquema/receta.schema.json';
import esquemaEquipo from '../../../esquema/equipo.schema.json';
import configEjemplo from '../../../config.example.yaml?raw';
import catalogoTexto from '../../../conectores/catalogo.yaml?raw';
import fixtureCorridas from '../../../ejemplo/demo/corridas.json';
import fixtureConectores from '../../../ejemplo/demo/conectores.json';

const ARCHIVOS_REPO = import.meta.glob(['../../../recetas/*/*', '../../../modulos/*/*'], { query: '?raw', import: 'default', eager: true });
const ARCHIVOS_SEMILLA = import.meta.glob('../../../ejemplo/demo/semilla/*', { query: '?raw', import: 'default', eager: true });

const ID_VALIDO = /^[a-z][a-z0-9-]{0,63}$/;
const PAUSA = 700;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const clonar = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const alFinal = (t) => (t.endsWith('\n') ? t : `${t}\n`);
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');

// ---------- Eventos en vivo ----------

const oyentes = new Set();
function emitir(tipo, datos) {
  const copia = clonar(datos);
  for (const fn of oyentes) fn(tipo, copia);
}

export function suscribir(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

// ---------- Archivos del repo (en el build) ----------

const repo = { recetas: {}, modulos: {} };
for (const [ruta, texto] of Object.entries(ARCHIVOS_REPO)) {
  const m = ruta.match(/(recetas|modulos)\/([^/]+)\/([^/]+)$/);
  if (m) (repo[m[1]][m[2]] ||= {})[m[3]] = texto;
}

const esquemas = () => ({ config: esquemaConfig, receta: esquemaReceta, equipo: esquemaEquipo });
let validadoresCache;
const validadores = () => (validadoresCache ||= crearValidadores(esquemas()));
const catalogo = () => YAML.parse(catalogoTexto);

// ---------- Espacio en memoria ----------
// Archivos del espacio: 'config.yaml', 'equipo.yaml' y 'recetas/<id>/receta.yaml|instrucciones.md'.

// Arranca con la semilla (ejemplo/demo/semilla), igual que la demo del servidor: ver sembrar() más abajo.
let archivos = { 'config.yaml': configEjemplo };

function leerEquipo() {
  const texto = archivos['equipo.yaml'];
  if (texto === undefined) return { existe: false, texto: '', datos: null, errores: [], usable: false, errorYaml: null };
  try {
    const datos = YAML.parse(texto) || {};
    const errores = validadores().equipo(datos).errores;
    return { existe: true, texto, datos, errores, usable: errores.length === 0, errorYaml: null };
  } catch (e) {
    return { existe: true, texto, datos: null, errores: [], usable: false, errorYaml: e.message };
  }
}

function leerConfig() {
  const texto = archivos['config.yaml'];
  const equipo = leerEquipo();
  try {
    const propios = YAML.parse(texto) || {};
    const base = equipo.usable ? equipo.datos : null;
    return { texto, datos: configEfectiva(base, propios), propios, equipo, delEquipo: valoresDelEquipo(base, propios), errorYaml: null };
  } catch (e) {
    return { texto, datos: null, propios: null, equipo, delEquipo: [], errorYaml: e.message };
  }
}

function leerReceta(receta, instrucciones, origen) {
  let datos = null;
  let errorYaml = null;
  try {
    datos = YAML.parse(receta);
  } catch (e) {
    errorYaml = e.message;
  }
  return { receta: datos, recetaTexto: receta, instrucciones: instrucciones || '', origen, errorYaml };
}

function listarModulos() {
  return Object.values(repo.modulos).filter((d) => d['modulo.yaml']).map((d) => {
    const meta = YAML.parse(d['modulo.yaml']);
    return { ...meta, instrucciones_texto: (meta.instrucciones && d[meta.instrucciones]) || '' };
  });
}

function listarRecetas() {
  const recetas = {};
  const agregar = (r) => {
    if (!r.receta?.id) return;
    recetas[r.receta.id] = { id: r.receta.id, ...r, sobrescribe: Boolean(recetas[r.receta.id]) };
  };
  for (const d of Object.values(repo.recetas)) if (d['receta.yaml']) agregar(leerReceta(d['receta.yaml'], d['instrucciones.md'], 'base'));
  for (const d of Object.values(repo.modulos)) if (d['receta.yaml']) agregar(leerReceta(d['receta.yaml'], d['instrucciones.md'], 'modulo'));
  for (const clave of Object.keys(archivos)) {
    const m = clave.match(/^recetas\/([^/]+)\/receta\.yaml$/);
    if (m && ID_VALIDO.test(m[1])) agregar(leerReceta(archivos[clave], archivos[`recetas/${m[1]}/instrucciones.md`], 'propia'));
  }
  return recetas;
}

function validarTodo(config, recetas, modulos) {
  const v = validadores();
  const resultadoConfig = config ? v.config(config) : { ok: false, errores: [{ ruta: '/', mensaje: 'config vacía' }] };
  const erroresRecetas = [];
  for (const [id, r] of Object.entries(recetas)) {
    if (r.errorYaml) {
      erroresRecetas.push({ ruta: `receta ${id}`, mensaje: `YAML inválido: ${r.errorYaml}` });
      continue;
    }
    for (const e of v.receta(r.receta).errores) erroresRecetas.push({ ruta: `receta ${id}${e.ruta}`, mensaje: e.mensaje });
  }
  const coh = resultadoConfig.ok ? coherencia(config, recetas, modulos, catalogo()) : { errores: [], avisos: [] };
  const errores = [...resultadoConfig.errores, ...coh.errores, ...erroresRecetas];
  return { ok: errores.length === 0, errores, avisos: coh.avisos };
}

function estadoEspacio() {
  const c = leerConfig();
  const recetas = listarRecetas();
  const modulos = listarModulos();
  const validacion = c.errorYaml
    ? { ok: false, errores: [{ ruta: 'config.yaml', mensaje: `YAML inválido: ${c.errorYaml}` }], avisos: [] }
    : validarTodo(c.datos, recetas, modulos);
  if (c.equipo.errorYaml) validacion.avisos.push({ ruta: 'equipo.yaml', mensaje: `YAML inválido, no se usa: ${c.equipo.errorYaml}` });
  else for (const e of c.equipo.errores) validacion.avisos.push({ ruta: `equipo.yaml${e.ruta}`, mensaje: `${e.mensaje} (no se usa el perfil de equipo)` });
  return {
    config: c.datos,
    configPropia: c.propios,
    configTexto: c.texto,
    equipo: { existe: c.equipo.existe, nombre: c.equipo.datos?.equipo || null, texto: c.equipo.texto, valores: c.delEquipo },
    validacion,
    recetas,
    modulos,
  };
}

// ---------- Conectores (fixture) ----------

const AUTH = { instalado: true, logueado: true, detalle: 'Modo demo' };
const detectado = () => ({ ...fixtureConectores, actualizado: new Date().toISOString(), demo: true });

function coincideNombre(nombre, palabras) {
  const n = nombre.toLowerCase();
  return palabras.some((p) => n.includes(p.toLowerCase()));
}

function estadoFuentes(config, det, cat = catalogo()) {
  const salida = {};
  for (const [id, f] of Object.entries(config?.fuentes || {})) {
    const c = cat.fuentes?.[id] || {};
    const base = { nombre: c.nombre || id, via: f.via, activa: f.activo, como_conectar: c.como_conectar || '' };
    if (f.via === 'gh') {
      const gh = det.gh || {};
      salida[id] = { ...base, conectada: Boolean(gh.ok), detalle: gh.detalle || 'Sin revisar', herramientas: ['leer_github', 'leer_issues_github'] };
    } else if (f.via === 'mcp') {
      const proveedores = c.proveedores || [];
      const candidatos = (det.mcp?.servidores || []).filter((s) => {
        if (f.servidor) return s.nombre.toLowerCase().includes(f.servidor.toLowerCase());
        return proveedores.some((p) => coincideNombre(s.nombre, p.coincide || []));
      });
      const indice = (s) => {
        const i = proveedores.findIndex((p) => coincideNombre(s.nombre, p.coincide || []));
        return i < 0 ? proveedores.length : i;
      };
      const conectados = candidatos.filter((s) => s.estado === 'conectado');
      if (c.elige_por_orden && !f.servidor) conectados.sort((a, b) => indice(a) - indice(b));
      const servidor = conectados[0] || candidatos[0];
      if (!servidor) {
        salida[id] = { ...base, conectada: false, detalle: `No aparece ningún conector${f.servidor ? ` "${f.servidor}"` : ''} en \`claude mcp list\``, herramientas: [] };
        continue;
      }
      const proveedor = proveedores.find((p) => coincideNombre(servidor.nombre, p.coincide || []) || (f.servidor && coincideNombre(f.servidor, p.coincide || [])));
      const nombres = [...(proveedor?.herramientas || []), ...(f.herramientas_extra || [])];
      const conectada = servidor.estado === 'conectado';
      salida[id] = {
        ...base,
        conectada,
        servidor: servidor.nombre,
        detalle: conectada
          ? `${proveedor?.aviso ? `${proveedor.aviso} · ` : ''}${servidor.nombre}: conectado${nombres.length ? '' : ' (sin herramientas de lectura conocidas: sumalas en herramientas_extra)'}`
          : `${servidor.nombre}: ${servidor.estado === 'requiere_auth' ? 'falta autorizarlo' : servidor.detalle}`,
        herramientas: nombres.map((h) => `mcp__${servidor.clave}__${h}`),
        registrar_con: 'registrar_lectura',
        como_referenciar: proveedor?.como_referenciar || c.como_referenciar,
      };
    } else if (id === 'sesiones_ia') {
      salida[id] = { ...base, conectada: true, detalle: `Se leen las sesiones de Claude Code${f.codex ? ' y Codex' : ''}`, herramientas: ['leer_sesiones'] };
    } else if (id === 'ollama') {
      const o = det.ollama || {};
      const tieneModelo = !f.modelo || (o.modelos || []).some((m) => m === f.modelo || m.startsWith(f.modelo) || m === `${f.modelo}:latest`);
      salida[id] = {
        ...base,
        conectada: Boolean(o.ok && tieneModelo),
        detalle: o.ok ? (tieneModelo ? o.detalle : `Ollama corre, pero falta el modelo ${f.modelo} (ollama pull ${f.modelo})`) : o.detalle || 'Sin revisar',
        herramientas: ['resumir_local'],
      };
    } else {
      salida[id] = {
        ...base,
        conectada: Boolean(f.carpeta),
        detalle: f.carpeta ? `Carpeta ${f.carpeta}` : 'Falta configurar la carpeta',
        herramientas: ['leer_registros'],
      };
    }
  }
  return salida;
}

function resumenEspacio() {
  const e = estadoEspacio();
  return {
    demo: true,
    espacio: 'Espacio de demo (en tu navegador)',
    config: e.config,
    configPropia: e.configPropia,
    equipo: e.equipo,
    configTexto: e.configTexto,
    validacion: e.validacion,
    recetas: Object.fromEntries(Object.entries(e.recetas).map(([id, r]) => [id, { id, origen: r.origen, sobrescribe: r.sobrescribe, receta: r.receta, instrucciones: r.instrucciones, errorYaml: r.errorYaml }])),
    modulos: e.modulos,
    fuentes: e.config ? estadoFuentes(e.config, detectado()) : {},
    detectado: detectado(),
    auth: AUTH,
    ahora: ahoraEn(e.config?.zona_horaria),
  };
}

// ---------- Historial ----------

let commits = [];

function confirmar(mensaje) {
  const antes = commits.at(-1)?.despues || {};
  const despues = { ...archivos };
  const cambiados = [...new Set([...Object.keys(antes), ...Object.keys(despues)])].filter((k) => antes[k] !== despues[k]);
  if (commits.length && !cambiados.length) return null;
  const id = hex(20);
  commits.push({ sha: id, fecha: new Date().toISOString(), mensaje, antes, despues, cambiados });
  return id;
}

function log(limite = 40) {
  return commits.slice(-limite).reverse().map((c) => ({ sha: c.sha, corto: c.sha.slice(0, 7), fecha: c.fecha, mensaje: c.mensaje }));
}

function deshacer(id) {
  if (!/^[0-9a-f]{7,40}$/.test(id)) throw new Error('Identificador de cambio inválido');
  const c = commits.find((x) => x.sha.startsWith(id));
  if (!c) throw new Error('No existe ese cambio');
  if (c.cambiados.some((k) => archivos[k] !== c.despues[k])) {
    throw new Error('No se pudo deshacer: un cambio posterior toca lo mismo. Deshacé primero los más nuevos.');
  }
  const nuevos = { ...archivos };
  for (const k of c.cambiados) {
    if (c.antes[k] === undefined) delete nuevos[k];
    else nuevos[k] = c.antes[k];
  }
  archivos = nuevos;
  const r = confirmar(`Revert "${c.mensaje}"`);
  emitirEspacio();
  return r;
}

function emitirEspacio() {
  emitir('espacio', resumenEspacio());
  emitir('propuestas', listarPropuestas());
}

// ---------- Propuestas ----------

const propuestas = [];

// Un " #" dentro de un texto sin comillas corta el valor: YAML toma el resto como comentario.
function textosCortados(texto) {
  const doc = YAML.parseDocument(String(texto || ''));
  const cortes = [];
  YAML.visit(doc, {
    Scalar(_, n) {
      if (n.comment && typeof n.value === 'string') cortes.push({ antes: n.value.slice(-40), comentario: n.comment.trim() });
    },
  });
  return cortes;
}

function construirVista(cambios, regla) {
  const actual = leerConfig();
  let configTexto = actual.texto;
  let equipoTexto = actual.equipo.texto;
  const recetas = listarRecetas();
  const nuevasRecetas = {};
  const errores = [];

  for (const c of cambios) {
    if (c.tipo === 'config') {
      if (typeof c.yaml !== 'string' || !c.yaml.trim()) errores.push({ ruta: 'config', mensaje: 'el cambio de config viene vacío' });
      else configTexto = c.yaml;
    } else if (c.tipo === 'equipo') {
      if (typeof c.yaml !== 'string' || !c.yaml.trim()) errores.push({ ruta: 'equipo.yaml', mensaje: 'el perfil de equipo viene vacío' });
      else equipoTexto = c.yaml;
    } else if (c.tipo === 'receta') {
      if (!ID_VALIDO.test(c.id || '')) {
        errores.push({ ruta: `receta ${c.id}`, mensaje: 'id de receta inválido' });
        continue;
      }
      const previa = recetas[c.id];
      const recetaTexto = c.receta_yaml ?? previa?.recetaTexto;
      const instrucciones = c.instrucciones ?? previa?.instrucciones ?? '';
      if (!recetaTexto) {
        errores.push({ ruta: `receta ${c.id}`, mensaje: 'una receta nueva necesita receta_yaml' });
        continue;
      }
      let receta = null;
      try {
        receta = YAML.parse(recetaTexto);
      } catch (e) {
        errores.push({ ruta: `receta ${c.id}`, mensaje: `YAML inválido: ${e.message}` });
        continue;
      }
      if (receta?.id !== c.id) errores.push({ ruta: `receta ${c.id}`, mensaje: `el campo id de la receta tiene que ser "${c.id}"` });
      for (const corte of textosCortados(recetaTexto)) {
        errores.push({ ruta: `receta ${c.id}`, mensaje: `un texto quedó cortado por un " #" (YAML lo toma como comentario): "...${corte.antes}" pierde "#${corte.comentario}". Ponelo entre comillas simples.` });
      }
      nuevasRecetas[c.id] = { recetaTexto, instrucciones, receta, nueva: !previa };
    }
  }

  let equipoDatos = null;
  const erroresEquipo = [];
  if (equipoTexto.trim()) {
    try {
      equipoDatos = YAML.parse(equipoTexto) || {};
      for (const e of validadores().equipo(equipoDatos).errores) erroresEquipo.push({ ruta: `equipo.yaml${e.ruta}`, mensaje: e.mensaje });
    } catch (e) {
      erroresEquipo.push({ ruta: 'equipo.yaml', mensaje: `YAML inválido: ${e.message}` });
    }
  }
  if (equipoTexto !== actual.equipo.texto) errores.push(...erroresEquipo);
  const equipoValido = erroresEquipo.length === 0;

  let configDatos = null;
  try {
    const propios = YAML.parse(configTexto);
    configDatos = propios && equipoValido ? configEfectiva(equipoDatos, propios) : propios;
  } catch (e) {
    errores.push({ ruta: 'config.yaml', mensaje: `YAML inválido: ${e.message}` });
  }

  if (regla?.texto && regla?.receta) {
    const fuente = nuevasRecetas[regla.receta] || recetas[regla.receta];
    if (!fuente) errores.push({ ruta: 'regla', mensaje: `no existe la receta "${regla.receta}"` });
    else {
      const receta = clonar(fuente.receta);
      receta.reglas = [...(receta.reglas || []), { fecha: ahoraEn(configDatos?.zona_horaria).fecha, texto: regla.texto.trim(), origen: 'chat' }];
      nuevasRecetas[regla.receta] = { recetaTexto: YAML.stringify(receta, { lineWidth: 0 }), instrucciones: fuente.instrucciones, receta, nueva: fuente.nueva || false };
    }
  }

  const recetasVista = { ...recetas };
  for (const [id, r] of Object.entries(nuevasRecetas)) recetasVista[id] = { ...recetas[id], id, origen: 'propia', ...r };
  const validacion = configDatos ? validarTodo(configDatos, recetasVista, listarModulos()) : { ok: false, errores: [], avisos: [] };
  return { actual, configTexto, equipoTexto, configDatos, nuevasRecetas, recetasVista, errores: [...errores, ...validacion.errores], avisos: validacion.avisos || [] };
}

function diffs(vista, recetasActuales) {
  const salida = [];
  const parche = (archivo, nombre, antes, despues) => salida.push({ archivo, parche: createTwoFilesPatch(nombre, nombre, antes, despues, 'actual', 'propuesto') });
  if (vista.configTexto !== vista.actual.texto) parche('config.yaml', 'config.yaml', vista.actual.texto, vista.configTexto);
  if (vista.equipoTexto !== vista.actual.equipo.texto) parche('equipo.yaml', 'equipo.yaml', vista.actual.equipo.texto, vista.equipoTexto);
  for (const [id, r] of Object.entries(vista.nuevasRecetas)) {
    const previa = recetasActuales[id];
    if ((previa?.recetaTexto || '') !== r.recetaTexto) parche(`recetas/${id}/receta.yaml`, `${id}/receta.yaml`, previa?.recetaTexto || '', r.recetaTexto);
    if ((previa?.instrucciones || '') !== (r.instrucciones || '')) parche(`recetas/${id}/instrucciones.md`, `${id}/instrucciones.md`, previa?.instrucciones || '', r.instrucciones || '');
  }
  return salida;
}

function crearPropuesta({ motivo, origen = 'chat', cambios = [], regla = null }) {
  if (!motivo || typeof motivo !== 'string') throw new Error('Toda propuesta necesita un motivo');
  if (!cambios.length && !regla) throw new Error('La propuesta no trae cambios');
  const vista = construirVista(cambios, regla);
  const p = {
    id: `p-${Date.now()}-${hex(2)}`,
    fecha: new Date().toISOString(),
    origen,
    motivo: motivo.trim().slice(0, 300),
    cambios,
    regla,
    estado: vista.errores.length ? 'invalida' : 'pendiente',
    errores: vista.errores,
    avisos: vista.avisos,
    diffs: diffs(vista, listarRecetas()),
  };
  propuestas.push(p);
  emitir('propuestas', listarPropuestas());
  return p;
}

function buscarPropuesta(id) {
  const p = propuestas.find((x) => x.id === id);
  if (!p) throw new Error(`No existe la propuesta ${id}`);
  return p;
}

function listarPropuestas(estado) {
  return propuestas.filter((p) => !estado || p.estado === estado).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

function vistaPrevia(id) {
  const p = buscarPropuesta(id);
  const vista = construirVista(p.cambios, p.regla);
  const recetas = {};
  for (const [rid, r] of Object.entries(vista.recetasVista)) recetas[rid] = { id: rid, origen: r.origen, receta: r.receta, instrucciones: r.instrucciones };
  return { propuesta: p, config: vista.configDatos, recetas, errores: vista.errores, avisos: vista.avisos };
}

function aplicarPropuesta(id) {
  const p = buscarPropuesta(id);
  if (p.estado !== 'pendiente') throw new Error(`La propuesta está ${p.estado}`);
  const vista = construirVista(p.cambios, p.regla);
  if (vista.errores.length) {
    p.estado = 'invalida';
    p.errores = vista.errores;
    throw new Error(`La propuesta ya no es válida: ${vista.errores.map((e) => `${e.ruta}: ${e.mensaje}`).join('; ')}`);
  }
  const nuevos = { ...archivos };
  if (vista.configTexto !== vista.actual.texto) nuevos['config.yaml'] = alFinal(vista.configTexto);
  if (vista.equipoTexto !== vista.actual.equipo.texto) nuevos['equipo.yaml'] = alFinal(vista.equipoTexto);
  for (const [rid, r] of Object.entries(vista.nuevasRecetas)) {
    nuevos[`recetas/${rid}/receta.yaml`] = alFinal(r.recetaTexto);
    nuevos[`recetas/${rid}/instrucciones.md`] = alFinal(r.instrucciones || '');
  }
  archivos = nuevos;
  const mensaje = `${p.origen === 'chat' ? 'Chat' : p.origen === 'asistente' ? 'Asistente' : 'Interfaz'}: ${p.motivo}${p.regla?.texto ? ` (regla nueva en ${p.regla.receta})` : ''}`;
  p.estado = 'aplicada';
  p.aplicada = { fecha: new Date().toISOString(), commit: confirmar(mensaje) };
  emitirEspacio();
  return p;
}

function descartarPropuesta(id) {
  const p = buscarPropuesta(id);
  if (p.estado === 'aplicada') throw new Error('Ya está aplicada: para volver atrás usá Deshacer en el historial');
  p.estado = 'descartada';
  emitir('propuestas', listarPropuestas());
  return p;
}

// ---------- Config, módulos y equipo ----------

function guardarConfig(datos, motivo, origen = 'interfaz') {
  const actual = leerConfig();
  const propia = actual.equipo.usable ? sinHeredado(datos, actual.equipo.datos, actual.propios) : datos;
  const p = crearPropuesta({ motivo, origen, cambios: [{ tipo: 'config', yaml: YAML.stringify(propia, { lineWidth: 0 }) }] });
  if (p.estado !== 'pendiente') throw new Error(p.errores.map((e) => `${e.ruta}: ${e.mensaje}`).join('; '));
  aplicarPropuesta(p.id);
  return resumenEspacio();
}

function parsearYaml(texto) {
  try {
    return YAML.parse(texto);
  } catch (e) {
    throw new Error(`El archivo no es YAML válido: ${e.message}`);
  }
}

function importarConfig(cuerpo) {
  const texto = String(cuerpo.yaml || '');
  const datos = parsearYaml(texto);
  const v = validadores().config(datos);
  if (!v.ok) throw new Error(`La configuración no es válida: ${v.errores.map((e) => `${e.ruta}: ${e.mensaje}`).join('; ')}`);
  const p = crearPropuesta({ motivo: cuerpo.motivo || 'Configuración importada', origen: 'interfaz', cambios: [{ tipo: 'config', yaml: texto }] });
  if (p.estado !== 'pendiente') throw new Error(p.errores.map((e) => `${e.ruta}: ${e.mensaje}`).join('; '));
  aplicarPropuesta(p.id);
  return resumenEspacio();
}

function cambiarModulo(clave, cuerpo) {
  const { config, modulos } = estadoEspacio();
  const modulo = modulos.find((m) => m.clave === clave);
  if (!modulo) throw new Error('Módulo desconocido');
  if (modulo.activo_si) throw new Error('Este módulo se activa solo, según de dónde te llegan las tareas (Perfil)');
  const activo = Boolean(cuerpo.activo);
  const nueva = clonar(config);
  nueva.modulos = { ...(nueva.modulos || {}), [modulo.clave]: { ...(nueva.modulos?.[modulo.clave] || {}), activo } };
  if (modulo.tipo === 'entregable') {
    const previo = nueva.entregables?.[modulo.id];
    nueva.entregables = { ...(nueva.entregables || {}), [modulo.id]: previo ? { ...previo, activo } : { ...modulo.entregable_por_defecto, activo } };
    for (const f of modulo.entregable_por_defecto?.fuentes || []) {
      if (!nueva.fuentes?.[f]) nueva.fuentes[f] = { activo: true, via: catalogo().fuentes?.[f]?.via || 'mcp' };
    }
  }
  if (activo) {
    for (const f of modulo.fuentes || []) {
      if (!nueva.fuentes?.[f]) nueva.fuentes[f] = { activo: true, via: catalogo().fuentes?.[f]?.via || 'local' };
      else nueva.fuentes[f] = { ...nueva.fuentes[f], activo: true };
    }
  }
  return guardarConfig(nueva, `${activo ? 'Activar' : 'Apagar'} módulo: ${modulo.nombre}`);
}

const ENCABEZADO_EQUIPO = '# Perfil de equipo del orquestador de entregables.\n# Sin datos personales: cada persona lo importa en Perfil y ajusta lo suyo encima.\n';

function exportarEquipo() {
  const { config } = estadoEspacio();
  if (!config) throw new Error('Todavía no hay una configuración para exportar');
  const perfil = perfilDeEquipo(config);
  const v = validadores().equipo(perfil);
  if (!v.ok) throw new Error(`No se pudo armar el perfil de equipo: ${v.errores.map((e) => `${e.ruta}: ${e.mensaje}`).join('; ')}`);
  return { yaml: `${ENCABEZADO_EQUIPO}${YAML.stringify(perfil, { lineWidth: 0 })}`, nombre: 'equipo.yaml' };
}

function importarEquipo(cuerpo) {
  const texto = String(cuerpo.yaml || '');
  const datos = parsearYaml(texto);
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) throw new Error('El archivo está vacío o no es un perfil de equipo');
  const v = validadores().equipo(datos);
  if (!v.ok) throw new Error(`El perfil de equipo no es válido: ${v.errores.map((e) => `${e.ruta}: ${e.mensaje}`).join('; ')}`);
  const p = crearPropuesta({ motivo: cuerpo.motivo || `Usar la configuración del equipo${datos.equipo ? ` (${datos.equipo})` : ''}`, origen: 'interfaz', cambios: [{ tipo: 'equipo', yaml: texto }] });
  if (p.estado !== 'pendiente') throw new Error(p.errores.map((e) => `${e.ruta}: ${e.mensaje}`).join('; '));
  aplicarPropuesta(p.id);
  return resumenEspacio();
}

// ---------- Asistente de entregable nuevo ----------

function asistente(cuerpo) {
  const { config } = estadoEspacio();
  const generado = generarEntregable(cuerpo || {});
  if (listarRecetas()[generado.id] && !cuerpo.reemplazar) throw new Error(`Ya existe una receta "${generado.id}": cambiale el nombre`);
  const doc = YAML.parseDocument(leerConfig().texto);
  doc.setIn(['entregables', generado.id], doc.createNode(generado.entrada));
  const cat = catalogo();
  for (const fid of generado.entrada.fuentes) {
    if (config.fuentes?.[fid]) continue;
    const c = cat.fuentes?.[fid];
    const via = c?.via || 'mcp';
    doc.setIn(['fuentes', fid], doc.createNode({ activo: true, via, ...(via === 'mcp' && c?.proveedores?.[0] ? { servidor: c.proveedores[0].nombre } : {}) }));
  }
  return crearPropuesta({
    motivo: `Entregable nuevo: ${generado.receta.nombre}`,
    origen: 'asistente',
    cambios: [
      { tipo: 'config', yaml: doc.toString({ lineWidth: 0 }) },
      { tipo: 'receta', id: generado.id, receta_yaml: YAML.stringify(generado.receta, { lineWidth: 0 }), instrucciones: generado.instrucciones },
    ],
  });
}

// ---------- Corridas simuladas ----------

const corridas = {};
const canceladas = new Set();
const ESTADOS = new Set(['en_curso', 'ok', 'error', 'omitido', 'aviso']);

function estadoNodos(eventos) {
  const nodos = {};
  for (const e of eventos) {
    if (!e.nodo) continue;
    nodos[e.nodo] = { estado: e.estado, resultado: e.resultado || nodos[e.nodo]?.resultado || '', t: e.t };
  }
  return nodos;
}

function leerCorrida(id) {
  const c = corridas[id];
  if (!c) return null;
  return { meta: c.meta, eventos: c.eventos, nodos: estadoNodos(c.eventos), lecturas: c.lecturas, borrador: c.borrador, evidencia: c.evidencia, seguimiento: c.seguimiento || null };
}

function listarCorridas(limite = 30) {
  return Object.keys(corridas).sort().reverse().slice(0, limite).map((id) => corridas[id].meta);
}

function agregarEvento(id, evento) {
  const estado = ESTADOS.has(evento.estado) ? evento.estado : 'aviso';
  corridas[id].eventos.push({ t: new Date().toISOString(), ...evento, estado, resultado: evento.resultado ? String(evento.resultado).slice(0, 300) : undefined });
  emitir('corrida', leerCorrida(id));
}

function actualizarMeta(id, cambios) {
  corridas[id].meta = { ...corridas[id].meta, ...cambios };
  emitir('corrida', leerCorrida(id));
}

function normalizarRef(ref) {
  return String(ref || '').trim().toLowerCase()
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\/(pull|issues)\/(\d+).*$/, '#$2')
    .replace(/\s+/g, ' ');
}

function mismaRef(r, x) {
  if (!r || !x) return false;
  if (r === x) return true;
  if (x.endsWith(r)) {
    const antes = x[x.length - r.length - 1];
    if (r.startsWith('#') || [':', '/', ' '].includes(antes)) return true;
  }
  if (/^(claude|codex):[0-9a-f]{8}$/.test(x) && r.startsWith(x)) return true;
  const num = r.match(/^#?(\d+)$/)?.[1];
  return Boolean(num && x.endsWith(`#${num}`));
}

function coincideRef(ref, leidas) {
  const r = normalizarRef(ref);
  return Boolean(r) && leidas.some((l) => mismaRef(r, normalizarRef(l)));
}

// Control de evidencia (versión corta del de lib/corridas.mjs): cada ítem tiene que citar refs leídas.
function cerrarCorrida({ id, receta, borrador, items, descartados, faltantes }) {
  const lecturas = corridas[id].lecturas;
  const fuentesReceta = new Set((receta.fuentes || []).map((f) => f.id));
  const aceptados = [];
  const rechazados = [];
  for (const item of items) {
    const ev = Array.isArray(item.evidencia) ? item.evidencia : [];
    const valido = ev.length > 0 && ev.every((e) => e?.fuente && e?.ref && fuentesReceta.has(e.fuente) && lecturas[e.fuente] && coincideRef(e.ref, lecturas[e.fuente].refs || []));
    if (valido) aceptados.push(item);
    else rechazados.push({ texto: item.texto, motivo: 'La evidencia no aparece en lo leído', refs: ev.map((e) => e?.ref).filter(Boolean) });
  }
  const desc = descartados.map((d) => ({ texto: d.texto || '', motivo: d.motivo || '', refs: [...new Set([...(d.refs || []), ...(d.ref ? [d.ref] : [])])] }));
  const citadas = [...items.flatMap((i) => (i.evidencia || []).map((e) => e?.ref)), ...desc.flatMap((d) => d.refs)].filter(Boolean);
  const sinClasificar = Object.entries(lecturas).flatMap(([fuente, l]) => (l.refs || []).filter((r) => !citadas.some((c) => coincideRef(c, [r]))).map((ref) => ({ fuente, ref })));
  const ok = !rechazados.length && !sinClasificar.length;
  const problemas = [
    ...rechazados.map((x) => `- "${x.texto}": ${x.motivo}`),
    ...sinClasificar.map((x) => `- ${x.fuente}: ${x.ref} quedó sin clasificar`),
  ];
  const final = ok ? borrador : `> **Observaciones del control de evidencia** (revisalas antes de usar este borrador):\n${problemas.map((l) => `> ${l}`).join('\n')}\n\n${borrador}`;
  const descartadosFinal = [...desc, ...rechazados.map((x) => ({ texto: x.texto, motivo: `Sin evidencia válida: ${x.motivo}`, refs: x.refs }))];
  const nodos = estadoNodos(corridas[id].eventos);
  const lista = [...faltantes];
  const nombrados = new Set(lista.map((f) => String(f?.fuente || '').replace(/^(fuente|paso):/, '')));
  for (const f of receta.fuentes || []) {
    const n = nodos[`fuente:${f.id}`];
    if (n && ['error', 'omitido'].includes(n.estado) && !nombrados.has(f.id)) lista.push({ fuente: f.id, motivo: `Fuente ${n.estado === 'error' ? 'con error' : 'omitido'}${n.resultado ? `: ${n.resultado}` : ''}` });
  }
  const control = {
    aceptados: aceptados.length,
    rechazados: rechazados.length,
    descartados_sin_ref: 0,
    descartados_ref_invalida: 0,
    descartados_sin_leer: 0,
    sin_clasificar: sinClasificar.length,
    nodos_sin_estado: [],
    intentos: 1,
    ok,
  };
  corridas[id].borrador = final;
  corridas[id].evidencia = { items: aceptados, descartados: descartadosFinal, faltantes: lista, control };
  agregarEvento(id, {
    nodo: 'control',
    estado: ok ? 'ok' : 'error',
    resultado: `${aceptados.length} con evidencia · ${descartadosFinal.length} descartados${lista.length ? ` · ${lista.length} faltante${lista.length === 1 ? '' : 's'}` : ''}${ok ? '' : ' · guardado con observaciones'}`,
  });
  return control;
}

async function simularCorrida({ id, entregable, prep, config }) {
  // Cada pausa devuelve false si la persona cortó la prueba mientras tanto.
  const pausa = async () => {
    await esperar(PAUSA);
    return !canceladas.has(id);
  };
  const caso = fixtureCorridas[prep.receta.id] || fixtureCorridas.generico;
  const fuentes = estadoFuentes(config, fixtureConectores);
  const receta = prep.receta;
  actualizarMeta(id, { receta: receta.id, ventana: caso.ventana, demo: true });
  if (!(await pausa())) return;
  agregarEvento(id, { nodo: 'disparador', estado: 'ok', resultado: `Probar ahora · ${caso.ventana.desde} → ${caso.ventana.hasta}` });

  for (const f of receta.fuentes) {
    const nodo = `fuente:${f.id}`;
    const est = fuentes[f.id];
    // Igual que lib/demo.mjs: una fuente activa con datos de ejemplo se simula leída aunque no figure conectada.
    const simulada = Boolean(est) && est.activa !== false && Boolean(caso.fuentes?.[f.id]);
    if (!simulada && (!est?.conectada || est.activa === false)) {
      agregarEvento(id, { nodo, estado: 'error', resultado: `No conectada: ${est?.detalle || 'no está en la configuración'}` });
      continue;
    }
    agregarEvento(id, { nodo, estado: 'en_curso', resultado: 'Leyendo' });
    if (!(await pausa())) return;
    const r = caso.fuentes?.[f.id] || { resumen: 'Sin novedades en la ventana', refs: [] };
    corridas[id].lecturas[f.id] = { refs: [...new Set(r.refs || [])], resumen: r.resumen, t: new Date().toISOString() };
    agregarEvento(id, { nodo, estado: 'ok', resultado: r.resumen });
  }

  for (const p of receta.pasos) {
    const nodo = `paso:${p.id}`;
    agregarEvento(id, { nodo, estado: 'en_curso' });
    if (!(await pausa())) return;
    agregarEvento(id, { nodo, estado: 'ok', resultado: caso.pasos?.[p.id] || 'Listo' });
  }

  agregarEvento(id, { nodo: 'control', estado: 'en_curso', resultado: 'Revisando evidencia' });
  if (!(await pausa())) return;
  const leidas = Object.values(corridas[id].lecturas).flatMap((l) => l.refs || []);
  const descartados = (caso.descartados || []).filter((d) => [...(d.refs || []), ...(d.ref ? [d.ref] : [])].every((ref) => coincideRef(ref, leidas)));
  // Lo que cita una fuente que no se leyó (apagada o sin conectar) no entra: el ítem se queda con el resto de su evidencia.
  const leidasPorFuente = corridas[id].lecturas;
  const items = caso.items.map((i) => ({ ...i, evidencia: i.evidencia.filter((e) => leidasPorFuente[e.fuente]) })).filter((i) => i.evidencia.length);
  const control = cerrarCorrida({ id, receta, borrador: caso.borrador.join('\n'), items, descartados, faltantes: caso.faltantes || [] });
  agregarEvento(id, { nodo: 'destino', estado: 'ok', resultado: `Borrador listo · ${nombreDestino(config.entregables?.[entregable]?.destino)}` });
  actualizarMeta(id, { estado: 'lista', fin: new Date().toISOString(), control });
}

function prepararReceta(config, entregableId) {
  const recetas = listarRecetas();
  const modulos = listarModulos();
  const entregable = entregablesDe(config, recetas, modulos).find((e) => e.id === entregableId);
  if (!entregable) throw new Error(`No existe el entregable "${entregableId}". Disponibles: ${Object.keys(config.entregables || {}).join(', ')}`);
  const ef = recetaEfectiva(entregable, config, recetas, modulos);
  if (!ef) throw new Error(`No existe la receta "${entregable.receta}"`);
  return { entregable, ...ef, instrucciones: completar(ef.instrucciones, contextoPlantilla(config, entregable)) };
}

function correrEntregable(entregable) {
  const e = estadoEspacio();
  if (!e.validacion.ok) throw new Error(`La configuración tiene errores: ${e.validacion.errores.map((x) => `${x.ruta}: ${x.mensaje}`).join('; ')}`);
  const config = e.config;
  const prep = prepararReceta(config, entregable);
  const ahora = ahoraEn(config.zona_horaria);
  let id = `${ahora.fecha.replaceAll('-', '')}-${ahora.hora.replace(':', '')}${String(new Date().getSeconds()).padStart(2, '0')}-${entregable}`;
  let n = 1;
  while (corridas[id]) id = `${id.replace(/-[0-9]+$/, '')}-${++n}`;
  corridas[id] = { meta: { id, entregable, origen: 'interfaz', modo: 'borrador', inicio: new Date().toISOString(), estado: 'en_curso', intentos_control: 0 }, eventos: [], lecturas: {}, borrador: null, evidencia: null };
  agregarEvento(id, { nodo: 'disparador', estado: 'en_curso', resultado: 'Probar ahora' });
  simularCorrida({ id, entregable, prep, config });
  return { id };
}

function aprobarCorrida(id) {
  if (!corridas[id]?.borrador) throw new Error('La corrida no tiene un borrador para aprobar');
  actualizarMeta(id, { aprobada: new Date().toISOString() });
  return corridas[id].meta;
}

function cancelarCorrida(id) {
  if (corridas[id]?.meta.estado !== 'en_curso') return { ok: false };
  canceladas.add(id);
  agregarEvento(id, { nodo: 'destino', estado: 'error', resultado: 'Cancelada desde la interfaz' });
  actualizarMeta(id, { estado: 'cancelada', fin: new Date().toISOString() });
  return { ok: true };
}

// ---------- Chat de ejemplo ----------

let conversacion = null;
let respondiendo = false;

function nuevaConversacion() {
  conversacion = { id: `c-${hex(4)}`, sesion: crypto.randomUUID(), iniciada: false, creada: new Date().toISOString(), mensajes: [] };
  return conversacion;
}

async function escribirDeA(texto, onDelta) {
  for (const trozo of texto.match(/.{1,12}/gs) || []) {
    onDelta(trozo);
    await esperar(25);
  }
}

// Mismas respuestas que responderDemo (lib/demo.mjs): dos pedidos típicos y una guía.
async function responderDemo({ texto, pantalla, onDelta, onPropuesta }) {
  const entregable = pantalla?.entregable || 'daily';
  const c = leerConfig();
  const recetas = listarRecetas();
  const nombre = recetas[c.datos.entregables?.[entregable]?.receta || entregable]?.receta?.nombre || entregable;
  if (/jira/i.test(texto)) {
    const doc = YAML.parseDocument(c.texto);
    doc.setIn(['fuentes', 'jira', 'activo'], true);
    const actuales = doc.getIn(['entregables', entregable, 'fuentes'])?.toJSON?.() || [];
    if (!actuales.includes('jira')) doc.setIn(['entregables', entregable, 'fuentes'], [...actuales, 'jira']);
    const p = crearPropuesta({
      motivo: `Sumar los tickets de Jira a ${nombre}`,
      origen: 'chat',
      cambios: [{ tipo: 'config', yaml: doc.toString({ lineWidth: 0 }) }],
      regla: { receta: c.datos.entregables?.[entregable]?.receta || entregable, texto: 'Incluir los tickets de Jira que cambiaron de estado en la ventana, con su clave.' },
    });
    onPropuesta(p.id);
    await escribirDeA(`Te propongo prender la fuente Jira y sumarla a ${nombre}. Además dejo la regla escrita en las instrucciones para que los tickets aparezcan siempre con su clave.\n\nEn el mapa vas a ver el nodo nuevo de Jira resaltado. Hasta que conectes Atlassian en claude.ai, lo que salga de Jira va a quedar afuera del borrador. Si te cierra, tocá «Aplicar el cambio» y volvé a probar.`, onDelta);
    return;
  }
  if (/sobra|corto|largo|tono|resum/i.test(texto)) {
    const receta = c.datos.entregables?.[entregable]?.receta || entregable;
    const p = crearPropuesta({
      motivo: `Guion más corto en ${nombre}`,
      origen: 'chat',
      cambios: [],
      regla: { receta, texto: 'Máximo tres ítems por bloque; el resto va en una línea final de "También".' },
    });
    onPropuesta(p.id);
    await escribirDeA(`Listo, lo dejo como regla en las instrucciones de ${nombre}, con la fecha de hoy: máximo tres ítems por bloque y el resto en una línea final. En el mapa vas a ver el control de evidencia resaltado porque suma esa regla. Si te cierra, tocá «Aplicar el cambio» y probá de nuevo.`, onDelta);
    return;
  }
  await escribirDeA(`Estoy en modo demo, así que respondo con ejemplos. Probá pedirme "sumá los tickets de Jira" o "que el guion sea más corto" sobre ${nombre}, y vas a ver el cambio resaltado en el mapa antes de aplicarlo.`, onDelta);
}

function enviarMensaje(id, cuerpo) {
  const texto = String(cuerpo.texto || '').trim();
  if (!texto) throw new Error('El mensaje está vacío');
  if (!conversacion || conversacion.id !== id) throw new Error('Id de conversación inválido');
  if (respondiendo) throw new Error('Claude todavía está respondiendo el mensaje anterior');
  respondiendo = true;
  const pantalla = cuerpo.pantalla;
  const conv = conversacion;
  conv.mensajes.push({ rol: 'persona', texto, t: new Date().toISOString(), pantalla: pantalla ? { entregable: pantalla.entregable, nodo: pantalla.nodo } : undefined });
  const respuesta = { rol: 'claude', texto: '', t: null, propuestas: [], herramientas: [] };
  const terminar = (error) => {
    respondiendo = false;
    respuesta.t = new Date().toISOString();
    if (error && !respuesta.texto) respuesta.texto = `No pude responder: ${error}`;
    respuesta.error = error || undefined;
    conv.iniciada = true;
    conv.mensajes.push(respuesta);
    emitir('chat', { id, tipo: 'fin', mensaje: respuesta });
  };
  responderDemo({
    texto,
    pantalla,
    onDelta: (d) => {
      respuesta.texto += d;
      emitir('chat', { id, tipo: 'delta', texto: d });
    },
    onPropuesta: (pid) => respuesta.propuestas.push(pid),
  }).then(() => terminar(null)).catch((e) => terminar(e.message));
  return { ok: true };
}

// ---------- Rutinas (solo el plan) ----------

function planRutinas(entregables) {
  const windows = typeof navigator !== 'undefined' && /win/i.test(navigator.platform || '');
  const A_SCHTASKS = { lun: 'MON', mar: 'TUE', mie: 'WED', jue: 'THU', vie: 'FRI', sab: 'SAT', dom: 'SUN' };
  const A_CRON = { lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6, dom: 0 };
  const tareas = entregables.filter((e) => e.activo && e.horario && !e.horario.a_pedido).map((e) => {
    const [hh, mm] = e.horario.hora.split(':');
    const base = { id: e.id, nombre: e.nombre, dias: e.horario.dias, hora: e.horario.hora };
    if (windows) {
      const dias = e.horario.dias.map((d) => A_SCHTASKS[d]).join(',');
      const tr = `"node" "<carpeta-del-orquestador>\\scripts\\correr.mjs" ${e.id}`;
      return { ...base, args: [], comando: `schtasks /Create /F /TN "OrquestadorEntregables\\${e.id}" /SC WEEKLY /D ${dias} /ST ${e.horario.hora} /TR "${tr.replaceAll('"', '\\"')}"` };
    }
    const linea = `${Number(mm)} ${Number(hh)} * * ${e.horario.dias.map((d) => A_CRON[d]).sort().join(',')} cd '<carpeta-del-orquestador>' && node scripts/correr.mjs ${e.id}`;
    return { ...base, linea, comando: linea };
  });
  return {
    plataforma: windows ? 'win32' : 'linux',
    tareas,
    explicacion: windows
      ? `Se crean ${tareas.length} tareas en el Programador de tareas de Windows, dentro de la carpeta "OrquestadorEntregables".`
      : `Se reemplaza el bloque del orquestador en tu crontab por ${tareas.length} líneas. El resto de tu crontab no se toca.`,
    requisitos: 'La computadora tiene que estar prendida a esa hora y Claude Code tiene que tener una sesión iniciada. Cada rutina deja su borrador en la interfaz; no manda nada.',
  };
}

// ---------- Semilla ----------

const semillaTexto = (nombre) => ARCHIVOS_SEMILLA[`../../../ejemplo/demo/semilla/${nombre}`];

// El espacio de ejemplo ya armado (mismos datos que la demo del servidor): config y perfil del equipo, historial
// con fechas, reglas aprendidas, una corrida terminada por entregable, propuestas y una charla con el chat.
function sembrar() {
  const semilla = {
    config: semillaTexto('config.yaml'),
    equipo: semillaTexto('equipo.yaml'),
    reglas: JSON.parse(semillaTexto('reglas.json')),
    historial: JSON.parse(semillaTexto('historial.json')),
  };
  const base = listarRecetas();
  const armado = armarEspacio({
    semilla,
    configEjemplo,
    recetaBase: (id) => base[id] && { recetaTexto: base[id].recetaTexto, instrucciones: base[id].instrucciones },
  });
  archivos = armado.archivos;
  commits = armado.commits.map((c) => ({ ...c, sha: hex(20) }));
  propuestas.push(...propuestasAplicadas({ commits, reglas: semilla.reglas }));

  const e = estadoEspacio();
  for (const c of corridasSemilla({ plan: JSON.parse(semillaTexto('corridas.json')), casos: fixtureCorridas, config: e.config, recetas: e.recetas, modulos: e.modulos })) {
    corridas[c.id] = { meta: c.meta, eventos: c.eventos, lecturas: c.lecturas, borrador: c.borrador, evidencia: c.evidencia, seguimiento: c.seguimiento };
  }
  const pendiente = crearPropuesta(JSON.parse(semillaTexto('propuesta-pendiente.json')));
  conversacion = chatSemilla(JSON.parse(semillaTexto('chat.json')), { '@pendiente': pendiente.id });
}
sembrar();

// ---------- Rutas ----------

const RUTAS = [
  ['GET', /^\/estado$/, () => ({
    ...resumenEspacio(),
    esquemas: esquemas(),
    catalogo: catalogo(),
    corridas: listarCorridas(20),
    propuestas: listarPropuestas(),
  })],
  ['GET', /^\/conectores$/, () => {
    const r = resumenEspacio();
    emitir('espacio', r);
    return { fuentes: r.fuentes, detectado: r.detectado, auth: r.auth };
  }],
  ['POST', /^\/conectores\/mcp$/, () => { throw new Error('En la demo pública no se agregan conectores: instalá el orquestador en tu compu'); }],
  ['PUT', /^\/config$/, (_, { cuerpo }) => guardarConfig(cuerpo.config, cuerpo.motivo || 'Cambio desde la interfaz')],
  ['POST', /^\/config\/importar$/, (_, { cuerpo }) => importarConfig(cuerpo)],
  ['POST', /^\/modulos\/([^/]+)$/, ([clave], { cuerpo }) => cambiarModulo(clave, cuerpo)],
  ['GET', /^\/equipo\/exportar$/, () => exportarEquipo()],
  ['POST', /^\/equipo\/importar$/, (_, { cuerpo }) => importarEquipo(cuerpo)],
  ['GET', /^\/corridas$/, () => listarCorridas(30)],
  ['GET', /^\/corridas\/([^/]+)$/, ([id]) => leerCorrida(id)],
  ['POST', /^\/corridas$/, (_, { cuerpo }) => correrEntregable(String(cuerpo.entregable || ''))],
  ['POST', /^\/corridas\/([^/]+)\/cancelar$/, ([id]) => cancelarCorrida(id)],
  ['POST', /^\/corridas\/([^/]+)\/aprobar$/, ([id]) => aprobarCorrida(id)],
  ['GET', /^\/propuestas$/, (_, { q }) => listarPropuestas(q.get('estado') || undefined)],
  ['GET', /^\/propuestas\/([^/]+)\/vista$/, ([id]) => vistaPrevia(id)],
  ['POST', /^\/propuestas\/([^/]+)\/aplicar$/, ([id]) => aplicarPropuesta(id)],
  ['POST', /^\/propuestas\/([^/]+)\/descartar$/, ([id]) => descartarPropuesta(id)],
  ['GET', /^\/historial$/, () => log(40)],
  ['POST', /^\/historial\/([^/]+)\/deshacer$/, ([id]) => ({ sha: deshacer(id) })],
  ['POST', /^\/asistente$/, (_, { cuerpo }) => asistente(cuerpo)],
  ['GET', /^\/chat$/, () => conversacion || nuevaConversacion()],
  ['POST', /^\/chat\/nueva$/, () => nuevaConversacion()],
  ['POST', /^\/chat\/([^/]+)\/mensajes$/, ([id], { cuerpo }) => enviarMensaje(id, cuerpo)],
  ['GET', /^\/rutinas\/plan$/, () => {
    const { config, recetas, modulos } = estadoEspacio();
    return planRutinas(entregablesDe(config, recetas, modulos));
  }],
  ['POST', /^\/rutinas\/aplicar$/, () => { throw new Error('En la demo pública no se programan rutinas: instalá el orquestador en tu compu'); }],
];

// Mismo contrato que fetch contra el servidor: devuelve el JSON o lanza un Error con el mensaje.
export async function pedir(ruta, { metodo = 'GET', cuerpo } = {}) {
  const url = new URL(ruta, 'http://demo.example');
  for (const [m, re, fn] of RUTAS) {
    if (m !== metodo) continue;
    const hallado = url.pathname.match(re);
    if (hallado) return clonar(fn(hallado.slice(1).map(decodeURIComponent), { cuerpo: clonar(cuerpo) || {}, q: url.searchParams }));
  }
  const error = new Error('No existe');
  error.status = 404;
  throw error;
}
