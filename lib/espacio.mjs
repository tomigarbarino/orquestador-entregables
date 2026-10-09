// Lectura y escritura del espacio personal: config.yaml, recetas propias y módulos.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { rutas, rutaEspacio, enEspacio, dentroDe, ID_VALIDO } from './rutas.mjs';
import { crearValidadores, coherencia } from './validar.mjs';
import { entregablesDe, recetaEfectiva } from './receta-efectiva.mjs';
import { contextoPlantilla, completar } from './plantilla.mjs';
import * as historial from './historial.mjs';

export function leerJSON(ruta) {
  return JSON.parse(fs.readFileSync(ruta, 'utf8'));
}

let cacheEsquemas;
export function esquemas() {
  cacheEsquemas ??= { config: leerJSON(rutas.esquemaConfig), receta: leerJSON(rutas.esquemaReceta) };
  return cacheEsquemas;
}

let cacheValidadores;
export function validadores() {
  cacheValidadores ??= crearValidadores(esquemas());
  return cacheValidadores;
}

export function catalogo() {
  return YAML.parse(fs.readFileSync(rutas.catalogo, 'utf8'));
}

export async function asegurarEspacio() {
  const dir = rutaEspacio();
  for (const sub of ['', 'recetas', 'corridas', '.propuestas', '.chat', '.tmp', '.cache']) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  }
  const config = path.join(dir, 'config.yaml');
  let creada = false;
  if (!fs.existsSync(config)) {
    fs.copyFileSync(rutas.configEjemplo, config);
    creada = true;
  }
  await historial.asegurarRepo(dir);
  return { dir, creada };
}

export function leerConfig() {
  const ruta = enEspacio('config.yaml');
  if (!fs.existsSync(ruta)) return { ruta, texto: '', datos: null, errorYaml: 'Todavía no hay config.yaml' };
  const texto = fs.readFileSync(ruta, 'utf8');
  try {
    return { ruta, texto, datos: YAML.parse(texto) || {}, errorYaml: null };
  } catch (e) {
    return { ruta, texto, datos: null, errorYaml: e.message };
  }
}

export function escribirConfigTexto(texto) {
  fs.writeFileSync(enEspacio('config.yaml'), texto.endsWith('\n') ? texto : `${texto}\n`);
}

export function aYaml(datos) {
  return YAML.stringify(datos, { lineWidth: 0 });
}

function leerRecetaDe(dir) {
  const archivo = path.join(dir, 'receta.yaml');
  if (!fs.existsSync(archivo)) return null;
  const texto = fs.readFileSync(archivo, 'utf8');
  const instrPath = path.join(dir, 'instrucciones.md');
  let receta = null;
  let errorYaml = null;
  try {
    receta = YAML.parse(texto);
  } catch (e) {
    errorYaml = e.message;
  }
  return {
    receta,
    recetaTexto: texto,
    instrucciones: fs.existsSync(instrPath) ? fs.readFileSync(instrPath, 'utf8') : '',
    ruta: dir,
    errorYaml,
  };
}

export function listarModulos() {
  if (!fs.existsSync(rutas.modulos)) return [];
  return fs.readdirSync(rutas.modulos, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const dir = path.join(rutas.modulos, d.name);
      const meta = YAML.parse(fs.readFileSync(path.join(dir, 'modulo.yaml'), 'utf8'));
      const instr = meta.instrucciones ? path.join(dir, meta.instrucciones) : null;
      return { ...meta, instrucciones_texto: instr && fs.existsSync(instr) ? fs.readFileSync(instr, 'utf8') : '' };
    });
}

// Todas las recetas: las del repo, las de los módulos de tipo entregable y las propias
// (las propias pisan a las del repo con el mismo id).
export function listarRecetas() {
  const recetas = {};
  const agregar = (dir, origen) => {
    const r = leerRecetaDe(dir);
    if (!r?.receta?.id) return;
    const previa = recetas[r.receta.id];
    recetas[r.receta.id] = { id: r.receta.id, origen, ...r, sobrescribe: Boolean(previa) };
  };
  for (const d of fs.readdirSync(rutas.recetasBase, { withFileTypes: true })) {
    if (d.isDirectory()) agregar(path.join(rutas.recetasBase, d.name), 'base');
  }
  for (const d of fs.readdirSync(rutas.modulos, { withFileTypes: true })) {
    if (d.isDirectory()) agregar(path.join(rutas.modulos, d.name), 'modulo');
  }
  const propias = enEspacio('recetas');
  if (fs.existsSync(propias)) {
    for (const d of fs.readdirSync(propias, { withFileTypes: true })) {
      if (d.isDirectory() && ID_VALIDO.test(d.name)) agregar(path.join(propias, d.name), 'propia');
    }
  }
  return recetas;
}

export function escribirReceta(id, { recetaTexto, instrucciones }) {
  if (!ID_VALIDO.test(id)) throw new Error(`Id de receta inválido: ${id}`);
  const base = enEspacio('recetas');
  const dir = dentroDe(base, id);
  fs.mkdirSync(dir, { recursive: true });
  if (recetaTexto != null) fs.writeFileSync(path.join(dir, 'receta.yaml'), recetaTexto.endsWith('\n') ? recetaTexto : `${recetaTexto}\n`);
  if (instrucciones != null) fs.writeFileSync(path.join(dir, 'instrucciones.md'), instrucciones.endsWith('\n') ? instrucciones : `${instrucciones}\n`);
  return dir;
}

// Validación completa: esquema de la config, esquema de cada receta y coherencia entre ellas.
export function validarTodo(config, recetas, modulos) {
  const v = validadores();
  const resultadoConfig = config ? v.config(config) : { ok: false, errores: [{ ruta: '/', mensaje: 'config vacía' }] };
  const erroresRecetas = [];
  for (const [id, r] of Object.entries(recetas)) {
    if (r.errorYaml) {
      erroresRecetas.push({ ruta: `receta ${id}`, mensaje: `YAML inválido: ${r.errorYaml}` });
      continue;
    }
    const vr = v.receta(r.receta);
    for (const e of vr.errores) erroresRecetas.push({ ruta: `receta ${id}${e.ruta}`, mensaje: e.mensaje });
  }
  const coh = resultadoConfig.ok ? coherencia(config, recetas, modulos, catalogo()) : { errores: [], avisos: [] };
  const errores = [...resultadoConfig.errores, ...coh.errores, ...erroresRecetas];
  return { ok: errores.length === 0, errores, avisos: coh.avisos };
}

export function estadoEspacio() {
  const c = leerConfig();
  const recetas = listarRecetas();
  const modulos = listarModulos();
  const validacion = c.errorYaml
    ? { ok: false, errores: [{ ruta: 'config.yaml', mensaje: `YAML inválido: ${c.errorYaml}` }], avisos: [] }
    : validarTodo(c.datos, recetas, modulos);
  return { espacio: rutaEspacio(), config: c.datos, configTexto: c.texto, validacion, recetas, modulos };
}

// Todo lo que necesita una corrida: receta efectiva e instrucciones completas con la config.
export function prepararReceta(config, entregableId) {
  const recetas = listarRecetas();
  const modulos = listarModulos();
  const entregable = entregablesDe(config, recetas, modulos).find((e) => e.id === entregableId);
  if (!entregable) throw new Error(`No existe el entregable "${entregableId}". Disponibles: ${Object.keys(config.entregables || {}).join(', ')}`);
  const ef = recetaEfectiva(entregable, config, recetas, modulos);
  if (!ef) throw new Error(`No existe la receta "${entregable.receta}"`);
  const contexto = contextoPlantilla(config, entregable);
  return { entregable, ...ef, instrucciones: completar(ef.instrucciones, contexto), recetas, modulos };
}
