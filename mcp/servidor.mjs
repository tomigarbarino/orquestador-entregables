#!/usr/bin/env node
// Servidor MCP del orquestador. Expone herramientas acotadas según el modo:
//   --modo corrida   lo que necesita una corrida: preparar, leer fuentes propias, reportar y guardar el borrador
//   --modo chat      leer la config y las recetas, y proponer cambios (nunca aplicarlos)
//   --modo completo  todo lo anterior más aplicar propuestas, aprobar corridas y programar rutinas
//                    (es el que se instala en Claude Code; ahí cada herramienta pide permiso)
// Ninguna herramienta ejecuta comandos libres ni toca archivos fuera del espacio de la persona.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

function argumento(nombre, defecto) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : defecto;
}

const MODO = argumento('modo', 'completo');
if (!['corrida', 'chat', 'completo'].includes(MODO)) {
  console.error(`Modo desconocido: ${MODO}`);
  process.exit(1);
}
const espacioArg = argumento('espacio', null);
if (espacioArg) process.env.ORQ_ESPACIO = espacioArg;

const { estadoEspacio, prepararReceta, listarRecetas, listarModulos, leerConfig, asegurarEspacio } = await import('../lib/espacio.mjs');
const corridas = await import('../lib/corridas.mjs');
const { detectar, estadoFuentes } = await import('../lib/conectores.mjs');
const fuentesLocales = await import('../lib/fuentes-locales.mjs');
const propuestas = await import('../lib/propuestas.mjs');
const historial = await import('../lib/historial.mjs');
const { planRutinas, aplicarRutinas } = await import('../lib/rutinas.mjs');
const { ahoraEn, calcularVentana, tocaAhora, tocaHoy, textoHorario } = await import('../lib/horario.mjs');
const { entregablesDe, nombreDestino, modulosActivos } = await import('../lib/receta-efectiva.mjs');
const { catalogo } = await import('../lib/espacio.mjs');
const { rutaEspacio } = await import('../lib/rutas.mjs');

await asegurarEspacio();

// Las herramientas de un módulo solo se ofrecen si el módulo está activo: si no, el modelo
// las ve y las intenta usar aunque la receta no las pida.
const configInicial = estadoEspacio().config || {};
const moduloActivo = (clave) => Boolean(configInicial.modulos?.[clave]?.activo);
const CORRIDA_SI = (clave) => (moduloActivo(clave) ? ['corrida', 'completo'] : ['completo']);

const servidor = new McpServer({ name: 'orquestador-entregables', version: '0.1.0' });

const ok = (datos) => ({ content: [{ type: 'text', text: typeof datos === 'string' ? datos : JSON.stringify(datos, null, 2) }] });
const falla = (mensaje) => ({ content: [{ type: 'text', text: mensaje }], isError: true });

function envolver(fn) {
  return async (args) => {
    try {
      return await fn(args || {});
    } catch (e) {
      return falla(e.message || String(e));
    }
  };
}

function registrar(nombre, modos, definicion, fn) {
  if (!modos.includes(MODO)) return;
  servidor.registerTool(nombre, definicion, envolver(fn));
}

const TODOS = ['corrida', 'chat', 'completo'];
const CORRIDA = ['corrida', 'completo'];
const CHAT = ['chat', 'completo'];
const COMPLETO = ['completo'];

function configValida() {
  const e = estadoEspacio();
  if (!e.validacion.ok) {
    throw new Error(`La configuración tiene errores:\n${e.validacion.errores.map((x) => `- ${x.ruta}: ${x.mensaje}`).join('\n')}\nCorregila desde la interfaz (npm start).`);
  }
  return e;
}

function recetaDeCorrida(id) {
  const ruta = path.join(corridas.dirCorridas(), id, 'receta.json');
  if (!fs.existsSync(ruta)) throw new Error('Esa corrida no fue preparada: llamá primero a preparar_corrida');
  return JSON.parse(fs.readFileSync(ruta, 'utf8'));
}

function ventanaDeCorrida(id) {
  return corridas.leerMeta(id)?.ventana || {};
}

const esquemaCorrida = z.string().describe('Id de la corrida que devolvió preparar_corrida');

// ---------- Estado ----------

registrar('estado', TODOS, {
  description: 'Resumen del orquestador: si la config es válida, entregables (cuándo corre cada uno y si toca ahora), fuentes conectadas y módulos activos.',
  inputSchema: { refrescar: z.boolean().optional().describe('Volver a revisar los conectores en lugar de usar lo último detectado') },
}, async ({ refrescar }) => {
  const e = estadoEspacio();
  if (!e.config) return falla(`No se pudo leer la configuración: ${e.validacion.errores.map((x) => x.mensaje).join('; ')}`);
  const ahora = ahoraEn(e.config.zona_horaria);
  const entregables = entregablesDe(e.config, e.recetas, e.modulos);
  const detectado = await detectar({ forzar: Boolean(refrescar) });
  const fuentes = estadoFuentes(e.config, detectado);
  return ok({
    persona: e.config.persona?.nombre,
    ahora,
    config_valida: e.validacion.ok,
    errores: e.validacion.errores,
    avisos: e.validacion.avisos,
    entregables: entregables.map((x) => ({ id: x.id, nombre: x.nombre, activo: x.activo, horario: textoHorario(x.horario), destino: nombreDestino(x.destino), fuentes: x.fuentes })),
    toca_ahora: tocaAhora(entregables, ahora),
    toca_hoy: tocaHoy(entregables, ahora),
    fuentes: Object.fromEntries(Object.entries(fuentes).map(([id, f]) => [id, { activa: f.activa, conectada: f.conectada, detalle: f.detalle, como_conectar: f.conectada ? undefined : f.como_conectar }])),
    modulos_activos: modulosActivos(e.config, e.modulos).map((m) => m.nombre),
  });
});

// ---------- Corridas ----------

registrar('preparar_corrida', CORRIDA, {
  description: 'Prepara una corrida de un entregable: receta efectiva, instrucciones completas con la config, ventana de fechas y estado de cada fuente con la herramienta que hay que usar para leerla.',
  inputSchema: {
    entregable: z.string().describe('Id del entregable, por ejemplo "daily"'),
    corrida: z.string().optional().describe('Id de corrida ya creada (lo pasa la interfaz). Si falta, se crea una.'),
  },
}, async ({ entregable, corrida }) => {
  const { config } = configValida();
  const prep = prepararReceta(config, entregable);
  const id = corrida || corridas.nuevaCorrida({ entregable, origen: 'claude-code', zona: config.zona_horaria });
  if (!corridas.leerMeta(id)) throw new Error(`No existe la corrida ${id}`);
  const ahora = ahoraEn(config.zona_horaria);
  const ultima = corridas.ultimaCorridaDe(entregable, { aprobada: true });
  const ventana = calcularVentana(prep.receta.disparador?.ventana, ahora, ultima?.inicio ? ahoraEn(config.zona_horaria, new Date(ultima.inicio)).fecha : null);
  fs.writeFileSync(path.join(corridas.dirCorridas(), id, 'receta.json'), JSON.stringify(prep.receta, null, 2));
  corridas.actualizarMeta(id, { receta: prep.receta.id, ventana });
  const detectado = await detectar();
  const estado = estadoFuentes(config, detectado);
  const fuentes = prep.receta.fuentes.map((f) => {
    const e = estado[f.id];
    const conectada = Boolean(e?.activa !== false && e?.conectada);
    return {
      id: f.id,
      para: f.para,
      requerida: Boolean(f.requerida),
      conectada,
      detalle: e?.detalle || 'No está definida en la configuración',
      leer_con: conectada ? e.herramientas : [],
      como_conectar: conectada ? undefined : e?.como_conectar,
    };
  });
  const meta = corridas.leerMeta(id);
  const origen = meta.origen === 'interfaz' ? 'Probar ahora' : meta.origen === 'rutina' ? 'Rutina programada' : 'Pedido desde Claude Code';
  corridas.agregarEvento(id, { nodo: 'disparador', estado: 'ok', resultado: `${origen} · ${ventana.desde} → ${ventana.hasta}` });
  for (const f of fuentes.filter((x) => !x.conectada)) {
    corridas.agregarEvento(id, { nodo: `fuente:${f.id}`, estado: 'error', resultado: `No conectada: ${f.detalle}` });
  }
  return ok({
    corrida: id,
    entregable: { id: prep.entregable.id, nombre: prep.entregable.nombre },
    ahora,
    ventana,
    fuentes,
    faltan: fuentes.filter((f) => !f.conectada).map((f) => `${f.id}${f.requerida ? ' (requerida)' : ''}: ${f.como_conectar || f.detalle}`),
    pasos: prep.receta.pasos.map((p) => ({ nodo: `paso:${p.id}`, nombre: p.nombre, detalle: p.detalle, usa: p.usa })),
    control: prep.receta.control,
    reglas_aprendidas: prep.receta.reglas || [],
    destino: { ...prep.destino, nombre_visible: nombreDestino(prep.destino), formato: prep.receta.destino?.formato },
    modulos: prep.modulos,
    instrucciones: prep.instrucciones,
  });
});

registrar('reportar_paso', CORRIDA, {
  description: 'Reporta el avance de un nodo de la corrida para que el visualizador lo muestre en vivo.',
  inputSchema: {
    corrida: esquemaCorrida,
    nodo: z.string().describe('fuente:<id>, paso:<id>, control o destino'),
    estado: z.enum(['en_curso', 'ok', 'error', 'omitido']),
    resultado: z.string().optional().describe('Una línea: lo que se encontró ("3 PRs, 2 reuniones") o por qué falló'),
  },
}, async ({ corrida, nodo, estado, resultado }) => {
  const receta = recetaDeCorrida(corrida);
  const normalizado = corridas.normalizarNodo(nodo, receta);
  const validos = ['disparador', ...receta.fuentes.map((f) => `fuente:${f.id}`), ...receta.pasos.map((p) => `paso:${p.id}`), 'control', 'destino'];
  if (!validos.includes(normalizado)) {
    return falla(`"${nodo}" no es un nodo de esta receta. Nodos válidos: ${validos.join(', ')}`);
  }
  corridas.agregarEvento(corrida, { nodo: normalizado, estado, resultado });
  return ok('Registrado');
});

registrar('leer_github', CORRIDA, {
  description: 'Lee los PRs de la persona en los repos de sus proyectos dentro de la ventana de la corrida (con el GitHub CLI). Devuelve estado exacto, rama de destino y fechas locales.',
  inputSchema: {
    corrida: esquemaCorrida,
    desde: z.string().optional().describe('YYYY-MM-DD; por defecto, el inicio de la ventana'),
    hasta: z.string().optional().describe('YYYY-MM-DD; por defecto, el fin de la ventana'),
    repos: z.array(z.string()).optional().describe('Limitar a estos repos (dueño/repo)'),
  },
}, async ({ corrida, desde, hasta, repos }) => {
  const { config } = configValida();
  const v = ventanaDeCorrida(corrida);
  corridas.agregarEvento(corrida, { nodo: 'fuente:github', estado: 'en_curso', resultado: 'Leyendo PRs' });
  const r = await fuentesLocales.leerGithub({ config, desde: desde || v.desde, hasta: hasta || v.hasta, repos });
  corridas.registrarLectura(corrida, 'github', r);
  const todosFallaron = r.repos.length && r.repos.every((x) => !x.ok);
  corridas.agregarEvento(corrida, { nodo: 'fuente:github', estado: todosFallaron ? 'error' : 'ok', resultado: todosFallaron ? `Sin acceso: ${r.repos[0].error}` : r.resumen });
  return ok(r);
});

registrar('leer_sesiones', CORRIDA, {
  description: 'Lee los pedidos y cierres de las sesiones de Claude Code y Codex de la persona dentro de la ventana. No devuelve transcripts enteros.',
  inputSchema: { corrida: esquemaCorrida, desde: z.string().optional(), hasta: z.string().optional() },
}, async ({ corrida, desde, hasta }) => {
  const { config } = configValida();
  const v = ventanaDeCorrida(corrida);
  corridas.agregarEvento(corrida, { nodo: 'fuente:sesiones_ia', estado: 'en_curso', resultado: 'Leyendo sesiones' });
  const r = await fuentesLocales.leerSesiones({ config, desde: desde || v.desde, hasta: hasta || v.hasta, catalogo: catalogo() });
  corridas.registrarLectura(corrida, 'sesiones_ia', r);
  corridas.agregarEvento(corrida, { nodo: 'fuente:sesiones_ia', estado: 'ok', resultado: r.resumen });
  return ok(r);
});

registrar('leer_registros', CORRIDA, {
  description: 'Lee los registros de trabajo fechados de la carpeta configurada, dentro de la ventana.',
  inputSchema: { corrida: esquemaCorrida, desde: z.string().optional(), hasta: z.string().optional() },
}, async ({ corrida, desde, hasta }) => {
  const { config } = configValida();
  const v = ventanaDeCorrida(corrida);
  const r = await fuentesLocales.leerRegistros({ config, desde: desde || v.desde, hasta: hasta || v.hasta });
  corridas.registrarLectura(corrida, 'registros', r);
  corridas.agregarEvento(corrida, { nodo: 'fuente:registros', estado: 'ok', resultado: r.resumen });
  return ok(r);
});

registrar('resumir_local', CORRIDA_SI('resumen_local'), {
  description: 'Resume un texto largo con el modelo local (Ollama), sin que salga de la máquina. Solo si el módulo de resumen local está activo.',
  inputSchema: { corrida: esquemaCorrida.optional(), texto: z.string().min(1), instruccion: z.string().optional() },
}, async ({ corrida, texto, instruccion }) => {
  const { config } = configValida();
  if (!config.modulos?.resumen_local?.activo) return falla('El módulo de resumen local está apagado');
  if (corrida) corridas.agregarEvento(corrida, { nodo: 'paso:resumen-local', estado: 'en_curso', resultado: `Resumiendo ${texto.split(/\s+/).length} palabras` });
  const r = await fuentesLocales.resumirLocal({ config, texto, instruccion });
  if (corrida) corridas.agregarEvento(corrida, { nodo: 'fuente:ollama', estado: r.ok ? 'ok' : 'error', resultado: r.ok ? `${r.modelo}: ${r.palabras_entrada} → ${r.resumen.split(/\s+/).length} palabras` : r.error });
  return r.ok ? ok(r) : falla(r.error);
});

registrar('seguimiento_listar', CORRIDA_SI('seguimiento_comercial'), {
  description: 'Lista los próximos pasos comerciales pendientes que vencen hasta una fecha (módulo de seguimiento comercial).',
  inputSchema: { hasta: z.string().optional().describe('YYYY-MM-DD; por defecto, hoy') },
}, async ({ hasta }) => {
  const { config } = configValida();
  if (!config.modulos?.seguimiento_comercial?.activo) return falla('El módulo de seguimiento comercial está apagado');
  const limite = hasta || ahoraEn(config.zona_horaria).fecha;
  const pasos = corridas.leerSeguimiento().filter((p) => p.estado === 'pendiente' && (!p.fecha_limite || p.fecha_limite <= limite));
  return ok({ hasta: limite, pasos });
});

registrar('seguimiento_guardar', CORRIDA_SI('seguimiento_comercial'), {
  description: 'Propone los próximos pasos de una reunión comercial (responsable y fecha). Quedan pendientes hasta que la persona aprueba la corrida.',
  inputSchema: {
    corrida: esquemaCorrida,
    cliente: z.string(),
    fecha_reunion: z.string(),
    pasos: z.array(z.object({
      paso: z.string(),
      responsable: z.string(),
      fecha_limite: z.string().optional(),
      fecha_estimada: z.boolean().optional(),
    })).min(1),
  },
}, async ({ corrida, cliente, fecha_reunion, pasos }) => {
  const { config } = configValida();
  if (!config.modulos?.seguimiento_comercial?.activo) return falla('El módulo de seguimiento comercial está apagado');
  corridas.guardarSeguimientoPropuesto(corrida, { cliente, fecha_reunion, pasos });
  corridas.agregarEvento(corrida, { nodo: 'paso:proximos-pasos', estado: 'ok', resultado: `${pasos.length} próximos pasos con responsable` });
  return ok('Seguimiento propuesto: se guarda cuando la persona aprueba la corrida.');
});

registrar('guardar_borrador', CORRIDA, {
  description: 'Guarda el borrador final después del control de evidencia. Cada ítem necesita evidencia de una fuente de la receta; los de GitHub, sesiones y registros tienen que aparecer en lo que se leyó en esta corrida. Si hay ítems sin evidencia, la herramienta los rechaza y hay que corregir.',
  inputSchema: {
    corrida: esquemaCorrida,
    borrador: z.string().min(1).describe('El entregable en el formato de la receta (Markdown)'),
    items: z.array(z.object({
      texto: z.string().describe('La afirmación del borrador, en una línea'),
      evidencia: z.array(z.object({
        fuente: z.string().describe('Id de la fuente: github, sesiones_ia, calendario, ...'),
        ref: z.string().describe('Referencia: dueño/repo#123, claude:abcd1234, id de evento o mail'),
      })),
    })).describe('Cada afirmación del borrador con su evidencia'),
    descartados: z.array(z.object({ texto: z.string(), motivo: z.string() })).optional(),
    faltantes: z.array(z.object({ fuente: z.string(), motivo: z.string() })).optional(),
  },
}, async ({ corrida, borrador, items, descartados = [], faltantes = [] }) => {
  const receta = recetaDeCorrida(corrida);
  const meta = corridas.leerMeta(corrida);
  const { aceptados, rechazados } = corridas.controlarEvidencia({ id: corrida, receta, items });
  const intentos = (meta.intentos_control || 0) + 1;
  corridas.actualizarMeta(corrida, { intentos_control: intentos });
  if (rechazados.length && intentos < 3) {
    corridas.agregarEvento(corrida, { nodo: 'control', estado: 'en_curso', resultado: `${rechazados.length} ítem${rechazados.length === 1 ? '' : 's'} sin evidencia válida: corrigiendo` });
    return falla(`Control de evidencia: ${rechazados.length} ítem(s) no pasan.\n${rechazados.map((r) => `- "${r.texto}": ${r.motivo}`).join('\n')}\nSacalos del borrador (o sumales evidencia real que esté en lo leído) y volvé a llamar a guardar_borrador. No inventes referencias.`);
  }
  let final = borrador;
  if (rechazados.length) {
    final = `> **Control de evidencia:** ${rechazados.length} afirmación(es) no tienen evidencia y habría que sacarlas antes de usar este borrador:\n${rechazados.map((r) => `> - ${r.texto} (${r.motivo})`).join('\n')}\n\n${borrador}`;
  }
  const control = { aceptados: aceptados.length, rechazados: rechazados.length, intentos };
  corridas.guardarBorrador({ id: corrida, borrador: final, items: aceptados, descartados: [...descartados, ...rechazados], faltantes, control });
  corridas.agregarEvento(corrida, {
    nodo: 'control',
    estado: rechazados.length ? 'error' : 'ok',
    resultado: `${aceptados.length} con evidencia · ${descartados.length + rechazados.length} descartados${faltantes.length ? ` · ${faltantes.length} fuentes sin leer` : ''}`,
  });
  const { config } = estadoEspacio();
  const destino = config?.entregables?.[meta.entregable]?.destino;
  corridas.agregarEvento(corrida, { nodo: 'destino', estado: 'ok', resultado: `Borrador listo · ${nombreDestino(destino)}` });
  corridas.actualizarMeta(corrida, { estado: 'lista', fin: new Date().toISOString(), control });
  return ok(`Borrador guardado (${aceptados.length} ítems con evidencia${rechazados.length ? `, ${rechazados.length} marcados para sacar` : ''}). Nada se mandó: queda esperando el OK de la persona.`);
});

// ---------- Config y recetas (chat) ----------

registrar('ver_config', CHAT, {
  description: 'Devuelve la configuración actual de la persona (config.yaml) y su validación.',
  inputSchema: {},
}, async () => {
  const c = leerConfig();
  const e = estadoEspacio();
  return ok({ config_yaml: c.texto, valida: e.validacion.ok, errores: e.validacion.errores, avisos: e.validacion.avisos });
});

registrar('listar_recetas', CHAT, {
  description: 'Lista las recetas disponibles (del repo, de módulos y propias) y los módulos opcionales.',
  inputSchema: {},
}, async () => {
  const recetas = listarRecetas();
  const modulos = listarModulos();
  return ok({
    recetas: Object.values(recetas).map((r) => ({ id: r.id, nombre: r.receta?.nombre, origen: r.origen, descripcion: r.receta?.descripcion })),
    modulos: modulos.map((m) => ({ clave: m.clave, nombre: m.nombre, tipo: m.tipo, descripcion: m.descripcion })),
  });
});

registrar('ver_receta', CHAT, {
  description: 'Devuelve una receta completa: receta.yaml (estructura) e instrucciones.md.',
  inputSchema: { id: z.string() },
}, async ({ id }) => {
  const r = listarRecetas()[id];
  if (!r) return falla(`No existe la receta "${id}"`);
  return ok({ id, origen: r.origen, receta_yaml: r.recetaTexto, instrucciones: r.instrucciones });
});

registrar('proponer_cambio', CHAT, {
  description: 'Propone un cambio a la config y/o a recetas. No aplica nada: la persona lo ve en el visualizador y lo aplica. Para una corrección del borrador, sumá "regla" para que quede escrita con la fecha de hoy.',
  inputSchema: {
    motivo: z.string().describe('Qué cambia y por qué, en una línea'),
    config_yaml: z.string().optional().describe('config.yaml completo con el cambio aplicado'),
    recetas: z.array(z.object({
      id: z.string(),
      receta_yaml: z.string().optional().describe('receta.yaml completo (obligatorio si la receta es nueva)'),
      instrucciones: z.string().optional().describe('instrucciones.md completo'),
    })).optional(),
    regla: z.object({ receta: z.string(), texto: z.string() }).optional().describe('Corrección a guardar como regla de la receta, con la fecha de hoy'),
  },
}, async ({ motivo, config_yaml, recetas = [], regla }) => {
  const cambios = [];
  if (config_yaml) cambios.push({ tipo: 'config', yaml: config_yaml });
  for (const r of recetas) cambios.push({ tipo: 'receta', id: r.id, receta_yaml: r.receta_yaml, instrucciones: r.instrucciones });
  const p = propuestas.crearPropuesta({ motivo, origen: MODO === 'chat' ? 'chat' : 'claude-code', cambios, regla });
  if (p.estado === 'invalida') {
    return falla(`La propuesta no es válida, corregila y volvé a proponer:\n${p.errores.map((e) => `- ${e.ruta}: ${e.mensaje}`).join('\n')}`);
  }
  return ok({
    propuesta: p.id,
    estado: p.estado,
    archivos: p.diffs.map((d) => d.archivo),
    avisos: p.avisos,
    siguiente: MODO === 'chat' ? 'La persona la ve en el visualizador y la aplica con un botón.' : 'Mostrale el cambio y aplicalo con aplicar_propuesta solo con su OK.',
  });
});

// ---------- Solo en Claude Code (cada una pide permiso) ----------

registrar('aplicar_propuesta', COMPLETO, {
  description: 'Aplica una propuesta de cambio (después del OK de la persona). Queda versionada y se puede deshacer.',
  inputSchema: { id: z.string() },
}, async ({ id }) => {
  const p = await propuestas.aplicarPropuesta(id);
  return ok(`Aplicada (${p.aplicada.commit?.slice(0, 7) || 'sin cambios'}): ${p.motivo}`);
});

registrar('aprobar_corrida', COMPLETO, {
  description: 'Marca un borrador como aprobado por la persona: guarda el recibo y, si corresponde, el seguimiento comercial. No manda nada a otros sistemas.',
  inputSchema: { corrida: esquemaCorrida },
}, async ({ corrida }) => {
  const meta = corridas.aprobarCorrida(corrida);
  return ok(`Corrida ${meta.id} aprobada. Ahora sí podés entregarla en su destino, con las herramientas de la persona.`);
});

registrar('historial', COMPLETO, {
  description: 'Lista los últimos cambios de la config y las recetas.',
  inputSchema: {},
}, async () => ok(await historial.log(rutaEspacio(), 20)));

registrar('deshacer', COMPLETO, {
  description: 'Deshace un cambio del historial (crea un cambio nuevo que lo revierte).',
  inputSchema: { sha: z.string() },
}, async ({ sha }) => ok(`Deshecho. Nuevo cambio: ${(await historial.deshacer(rutaEspacio(), sha)).slice(0, 7)}`));

registrar('plan_rutinas', COMPLETO, {
  description: 'Muestra qué rutinas programadas se crearían en el sistema a partir de la config (no crea nada).',
  inputSchema: {},
}, async () => {
  const { config, recetas, modulos } = configValida();
  return ok(planRutinas(entregablesDe(config, recetas, modulos)));
});

registrar('programar_rutinas', COMPLETO, {
  description: 'Crea o actualiza las rutinas programadas en el sistema según la config. Solo con el OK explícito de la persona.',
  inputSchema: { confirmado: z.literal(true).describe('true solo si la persona dio el OK en esta conversación') },
}, async () => {
  const { config, recetas, modulos } = configValida();
  const plan = planRutinas(entregablesDe(config, recetas, modulos));
  return ok(await aplicarRutinas(plan));
});

const transporte = new StdioServerTransport();
await servidor.connect(transporte);
console.error(`orquestador-entregables MCP listo (modo ${MODO}, espacio ${rutaEspacio()})`);
