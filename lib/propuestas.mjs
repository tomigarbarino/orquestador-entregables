// Propuestas de cambio: el chat (o el asistente) propone, la persona ve el cambio en el
// visualizador y recién ahí lo aplica. Cada cambio aplicado queda como commit en el espacio.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { createTwoFilesPatch } from 'diff';
import { enEspacio, dentroDe, rutaEspacio, ID_VALIDO } from './rutas.mjs';
import { leerConfig, listarRecetas, listarModulos, validarTodo, validadores, escribirConfigTexto, escribirEquipoTexto, escribirReceta, aYaml } from './espacio.mjs';
import { configEfectiva } from './equipo.mjs';
import { ahoraEn } from './horario.mjs';
import * as historial from './historial.mjs';

// Un " #" dentro de un texto sin comillas corta el valor: YAML toma el resto como comentario y la
// regla llega a la corrida a medias. Devuelve cada valor cortado con lo que se perdió.
export function textosCortados(texto) {
  const doc = YAML.parseDocument(String(texto || ''));
  const cortes = [];
  YAML.visit(doc, {
    Scalar(_, n) {
      if (n.comment && typeof n.value === 'string') cortes.push({ antes: n.value.slice(-40), comentario: n.comment.trim() });
    },
  });
  return cortes;
}

const dirPropuestas = () => enEspacio('.propuestas');
const ID_PROPUESTA = /^p-[0-9]{13}-[a-z0-9]{4}$/;

function rutaDe(id) {
  if (!ID_PROPUESTA.test(id || '')) throw new Error(`Id de propuesta inválido: ${id}`);
  return dentroDe(dirPropuestas(), `${id}.json`);
}

function hoy(config) {
  return ahoraEn(config?.zona_horaria).fecha;
}

// Arma el estado propuesto (config y recetas) aplicando los cambios sobre el actual.
function construirVista(cambios, regla) {
  const actual = leerConfig();
  let configTexto = actual.texto;
  let equipoTexto = actual.equipo.texto;
  const recetas = listarRecetas();
  const nuevasRecetas = {};
  const errores = [];

  for (const c of cambios) {
    if (c.tipo === 'config') {
      if (typeof c.yaml !== 'string' || !c.yaml.trim()) {
        errores.push({ ruta: 'config', mensaje: 'el cambio de config viene vacío' });
        continue;
      }
      configTexto = c.yaml;
    } else if (c.tipo === 'equipo') {
      if (typeof c.yaml !== 'string' || !c.yaml.trim()) {
        errores.push({ ruta: 'equipo.yaml', mensaje: 'el perfil de equipo viene vacío' });
        continue;
      }
      equipoTexto = c.yaml;
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

  // Un equipo.yaml roto que esta propuesta no toca no la frena: ya se avisa aparte.
  let equipoDatos = null;
  const erroresEquipo = [];
  if (equipoTexto.trim()) {
    try {
      equipoDatos = YAML.parse(equipoTexto) || {};
      const ve = validadores().equipo(equipoDatos);
      for (const e of ve.errores) erroresEquipo.push({ ruta: `equipo.yaml${e.ruta}`, mensaje: e.mensaje });
    } catch (e) {
      erroresEquipo.push({ ruta: 'equipo.yaml', mensaje: `YAML inválido: ${e.message}` });
    }
  }
  if (equipoTexto !== actual.equipo.texto) errores.push(...erroresEquipo);
  const equipoValido = erroresEquipo.length === 0;

  // Lo que se valida y se previsualiza es la config efectiva: el equipo como base y la persona encima.
  let configDatos = null;
  try {
    const propios = YAML.parse(configTexto);
    configDatos = propios && equipoValido ? configEfectiva(equipoDatos, propios) : propios;
  } catch (e) {
    errores.push({ ruta: 'config.yaml', mensaje: `YAML inválido: ${e.message}` });
  }

  if (regla?.texto && regla?.receta) {
    const id = regla.receta;
    const fuente = nuevasRecetas[id] || recetas[id];
    if (!fuente) errores.push({ ruta: `regla`, mensaje: `no existe la receta "${id}"` });
    else {
      const receta = JSON.parse(JSON.stringify(fuente.receta));
      receta.reglas = [...(receta.reglas || []), { fecha: hoy(configDatos), texto: regla.texto.trim(), origen: 'chat' }];
      nuevasRecetas[id] = {
        recetaTexto: aYaml(receta),
        instrucciones: fuente.instrucciones,
        receta,
        nueva: fuente.nueva || false,
      };
    }
  }

  const recetasVista = { ...recetas };
  for (const [id, r] of Object.entries(nuevasRecetas)) recetasVista[id] = { ...recetas[id], id, origen: 'propia', ...r };
  const modulos = listarModulos();
  const validacion = configDatos ? validarTodo(configDatos, recetasVista, modulos) : { ok: false, errores: [], avisos: [] };
  return {
    actual,
    configTexto,
    equipoTexto,
    configDatos,
    nuevasRecetas,
    recetasVista,
    errores: [...errores, ...validacion.errores],
    avisos: validacion.avisos || [],
  };
}

function diffs(vista, recetasActuales) {
  const salida = [];
  if (vista.configTexto !== vista.actual.texto) {
    salida.push({ archivo: 'config.yaml', parche: createTwoFilesPatch('config.yaml', 'config.yaml', vista.actual.texto, vista.configTexto, 'actual', 'propuesto') });
  }
  if (vista.equipoTexto !== vista.actual.equipo.texto) {
    salida.push({ archivo: 'equipo.yaml', parche: createTwoFilesPatch('equipo.yaml', 'equipo.yaml', vista.actual.equipo.texto, vista.equipoTexto, 'actual', 'propuesto') });
  }
  for (const [id, r] of Object.entries(vista.nuevasRecetas)) {
    const previa = recetasActuales[id];
    if ((previa?.recetaTexto || '') !== r.recetaTexto) {
      salida.push({ archivo: `recetas/${id}/receta.yaml`, parche: createTwoFilesPatch(`${id}/receta.yaml`, `${id}/receta.yaml`, previa?.recetaTexto || '', r.recetaTexto, 'actual', 'propuesto') });
    }
    if ((previa?.instrucciones || '') !== (r.instrucciones || '')) {
      salida.push({ archivo: `recetas/${id}/instrucciones.md`, parche: createTwoFilesPatch(`${id}/instrucciones.md`, `${id}/instrucciones.md`, previa?.instrucciones || '', r.instrucciones || '', 'actual', 'propuesto') });
    }
  }
  return salida;
}

export function crearPropuesta({ motivo, origen = 'chat', cambios = [], regla = null }) {
  if (!motivo || typeof motivo !== 'string') throw new Error('Toda propuesta necesita un motivo');
  if (!cambios.length && !regla) throw new Error('La propuesta no trae cambios');
  const recetasActuales = listarRecetas();
  const vista = construirVista(cambios, regla);
  const id = `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const propuesta = {
    id,
    fecha: new Date().toISOString(),
    origen,
    motivo: motivo.trim().slice(0, 300),
    cambios,
    regla,
    estado: vista.errores.length ? 'invalida' : 'pendiente',
    errores: vista.errores,
    avisos: vista.avisos,
    diffs: diffs(vista, recetasActuales),
  };
  fs.mkdirSync(dirPropuestas(), { recursive: true });
  fs.writeFileSync(rutaDe(id), JSON.stringify(propuesta, null, 2));
  return propuesta;
}

export function leerPropuesta(id) {
  return JSON.parse(fs.readFileSync(rutaDe(id), 'utf8'));
}

// Vista previa completa para el visualizador: config y recetas tal como quedarían.
export function vistaPrevia(id) {
  const p = leerPropuesta(id);
  const vista = construirVista(p.cambios, p.regla);
  const recetas = {};
  for (const [rid, r] of Object.entries(vista.recetasVista)) recetas[rid] = { id: rid, origen: r.origen, receta: r.receta, instrucciones: r.instrucciones };
  return { propuesta: p, config: vista.configDatos, recetas, errores: vista.errores, avisos: vista.avisos };
}

export function listarPropuestas({ estado } = {}) {
  const dir = dirPropuestas();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .map((n) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter((p) => p && (!estado || p.estado === estado))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export async function aplicarPropuesta(id) {
  const p = leerPropuesta(id);
  if (p.estado !== 'pendiente') throw new Error(`La propuesta está ${p.estado}`);
  const vista = construirVista(p.cambios, p.regla);
  if (vista.errores.length) {
    p.estado = 'invalida';
    p.errores = vista.errores;
    fs.writeFileSync(rutaDe(id), JSON.stringify(p, null, 2));
    throw new Error(`La propuesta ya no es válida: ${vista.errores.map((e) => `${e.ruta}: ${e.mensaje}`).join('; ')}`);
  }
  if (vista.configTexto !== vista.actual.texto) escribirConfigTexto(vista.configTexto);
  if (vista.equipoTexto !== vista.actual.equipo.texto) escribirEquipoTexto(vista.equipoTexto);
  for (const [rid, r] of Object.entries(vista.nuevasRecetas)) escribirReceta(rid, { recetaTexto: r.recetaTexto, instrucciones: r.instrucciones });
  const mensaje = `${p.origen === 'chat' ? 'Chat' : p.origen === 'asistente' ? 'Asistente' : 'Interfaz'}: ${p.motivo}${p.regla?.texto ? ` (regla nueva en ${p.regla.receta})` : ''}`;
  const sha = await historial.commit(rutaEspacio(), mensaje);
  p.estado = 'aplicada';
  p.aplicada = { fecha: new Date().toISOString(), commit: sha };
  fs.writeFileSync(rutaDe(id), JSON.stringify(p, null, 2));
  return p;
}

export function descartarPropuesta(id) {
  const p = leerPropuesta(id);
  if (p.estado === 'aplicada') throw new Error('Ya está aplicada: para volver atrás usá Deshacer en el historial');
  p.estado = 'descartada';
  fs.writeFileSync(rutaDe(id), JSON.stringify(p, null, 2));
  return p;
}
