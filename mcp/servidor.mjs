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
// Las lecturas grandes van en JSON compacto y por páginas: el cliente MCP corta las salidas
// largas (las manda a un archivo) y lo que no se ve termina descartado sin leer.
const okCompacto = (datos) => ({ content: [{ type: 'text', text: JSON.stringify(datos) }] });
const MAX_PAGINA = 40_000;

function paginaDe(paginas, pagina, herramienta) {
  const n = pagina || 1;
  if (n > paginas.length) throw new Error(`Hay ${paginas.length} página(s); pediste la ${n}.`);
  return {
    n,
    total: paginas.length,
    siguiente: n < paginas.length ? `Hay más: llamá de nuevo a ${herramienta} con las mismas fechas y pagina ${n + 1} (son ${paginas.length}). Solo lo devuelto queda registrado como leído.` : undefined,
  };
}

// Una lectura por corrida y argumentos: pedir la página 2 no vuelve a llamar a gh ni a releer sesiones.
const cacheLecturas = new Map();
function enCache(clave, fn) {
  if (!cacheLecturas.has(clave)) {
    const promesa = fn();
    cacheLecturas.set(clave, promesa);
    promesa.catch(() => cacheLecturas.delete(clave));
    if (cacheLecturas.size > 50) cacheLecturas.delete(cacheLecturas.keys().next().value);
  }
  return cacheLecturas.get(clave);
}

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
  description: 'Prepara una corrida de un entregable: receta efectiva, instrucciones completas con la config, ventana de fechas, días especiales y estado de cada fuente con la herramienta que hay que usar para leerla. Las fuentes que se leen con conectores (calendario, mail, slack, teams, jira) se registran después con registrar_lectura.',
  inputSchema: {
    entregable: z.string().describe('Id del entregable, por ejemplo "daily"'),
    corrida: z.string().optional().describe('Id de corrida ya creada (lo pasa la interfaz). Si falta, se crea una.'),
    desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD, solo si la persona nombró un día o un período en el pedido. Reemplaza la ventana de la receta.'),
    hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD; por defecto, igual a "desde"'),
  },
}, async ({ entregable, corrida, desde, hasta }) => {
  const { config } = configValida();
  const prep = prepararReceta(config, entregable);
  const id = corrida || corridas.nuevaCorrida({ entregable, origen: 'claude-code', zona: config.zona_horaria });
  if (!corridas.leerMeta(id)) throw new Error(`No existe la corrida ${id}`);
  const ahora = ahoraEn(config.zona_horaria);
  let ventana;
  if (desde) {
    const fin = hasta || desde;
    if (fin < desde) throw new Error('"hasta" no puede ser anterior a "desde"');
    ventana = { tipo: 'pedido', desde, hasta: fin, descripcion: fin === desde ? `el día que pidió la persona (${desde})` : `del ${desde} al ${fin}, según el pedido` };
  } else {
    const ultima = corridas.ultimaCorridaDe(entregable, { aprobada: true });
    const ultimaCorrida = ultima?.inicio ? ahoraEn(config.zona_horaria, new Date(ultima.inicio)).fecha : null;
    const ultimaEntrega = config.entregables?.[entregable]?.opciones?.ultima_entrega || null;
    ventana = calcularVentana(prep.receta.disparador?.ventana, ahora, ultimaCorrida, ultimaEntrega);
  }
  // Un registro del día que corre antes de su hora de cierre cubre solo parte del día: se avisa.
  const horario = prep.horario;
  if (ventana.hasta === ahora.fecha && ventana.desde === ahora.fecha && horario?.hora && !horario.a_pedido && ahora.hora < horario.hora) {
    ventana.parcial = { hasta: ahora.hora, cierre: horario.hora };
    ventana.aviso = [ventana.aviso, `La corrida es antes de la hora de cierre (${horario.hora}): el día está cortado. Avisalo en la primera línea del borrador ("registro parcial hasta las ${ahora.hora}") y, de cada sesión en curso, usá su último hito antes de esta hora.`].filter(Boolean).join(' ');
  }
  fs.writeFileSync(path.join(corridas.dirCorridas(), id, 'receta.json'), JSON.stringify(prep.receta, null, 2));
  corridas.actualizarMeta(id, { receta: prep.receta.id, ventana });
  const detectado = await detectar();
  const estado = estadoFuentes(config, detectado);
  const fuentes = prep.receta.fuentes.map((f) => {
    const e = estado[f.id];
    const conectada = Boolean(e?.activa !== false && e?.conectada);
    const porConector = e?.via === 'mcp';
    return {
      id: f.id,
      para: f.para,
      requerida: Boolean(f.requerida),
      conectada,
      detalle: e?.detalle || 'No está definida en la configuración',
      leer_con: conectada ? e.herramientas : [],
      despues: conectada && porConector
        ? `Llamá a registrar_lectura (fuente "${f.id}") con las refs de todo lo que leíste${e.como_referenciar ? ` (${e.como_referenciar})` : ''} y un resumen de una línea. Sin eso, sus refs no pasan el control.`
        : undefined,
      como_conectar: conectada ? undefined : e?.como_conectar,
    };
  });
  const diasEspeciales = (config.dias_especiales || []).map((d) => ({ ...d, en_ventana: d.fecha >= ventana.desde && d.fecha <= ventana.hasta }));
  const meta = corridas.leerMeta(id);
  const origen = meta.origen === 'interfaz' ? 'Probar ahora' : meta.origen === 'rutina' ? 'Rutina programada' : 'Pedido desde Claude Code';
  corridas.agregarEvento(id, { nodo: 'disparador', estado: 'ok', resultado: `${origen} · ${ventana.desde} → ${ventana.hasta}` });
  for (const f of fuentes.filter((x) => !x.conectada)) {
    corridas.agregarEvento(id, { nodo: `fuente:${f.id}`, estado: 'error', resultado: `No conectada: ${f.detalle}` });
  }
  // El paso que define la ventana o el período queda hecho acá, antes de leer las fuentes.
  for (const p of prep.receta.pasos.filter((x) => ['ventana', 'periodo'].includes(x.id))) {
    corridas.agregarEvento(id, { nodo: `paso:${p.id}`, estado: 'ok', resultado: `${ventana.descripcion}${ventana.parcial ? ` · parcial hasta las ${ventana.parcial.hasta}` : ''}` });
  }
  const porConector = fuentes.filter((f) => f.conectada && f.despues).map((f) => f.id);
  return ok({
    corrida: id,
    entregable: { id: prep.entregable.id, nombre: prep.entregable.nombre },
    ahora,
    ventana,
    dias_especiales: diasEspeciales,
    fuentes,
    faltan: fuentes.filter((f) => !f.conectada).map((f) => `${f.id}${f.requerida ? ' (requerida)' : ''}: ${f.como_conectar || f.detalle}`),
    recordatorios: [
      ...(porConector.length ? [`Fuentes por conector (${porConector.join(', ')}): después de leerlas, llamá a registrar_lectura con sus refs. Una fuente sin lectura registrada no puede respaldar ningún ítem.`] : []),
      'Reportá cada fuente y cada paso con reportar_paso cuando empieza y cuando termina. Todos tienen que terminar en ok, omitido o error antes de guardar_borrador.',
      'Toda ref leída termina en un ítem o en descartados (con refs y motivo). guardar_borrador rechaza si queda alguna sin clasificar.',
      ...(ventana.aviso ? [ventana.aviso] : []),
    ],
    pasos: prep.receta.pasos.map((p) => ({ nodo: `paso:${p.id}`, nombre: p.nombre, detalle: p.detalle, usa: p.usa })),
    control: prep.receta.control,
    reglas_aprendidas: prep.receta.reglas || [],
    destino: { ...prep.destino, nombre_visible: nombreDestino(prep.destino), formato: prep.receta.destino?.formato },
    modulos: prep.modulos,
    instrucciones: prep.instrucciones,
  });
});

registrar('registrar_lectura', CORRIDA, {
  description: 'Registra lo que leíste de una fuente por conector (calendario, mail, chat, jira): las refs de cada evento, mail, mensaje o ticket y un resumen. Sin esta lectura registrada, esas refs no pasan el control de evidencia. Registrá TODOS los ids que devolvió cada búsqueda, no una selección (lo que no sirve va a descartados), y pasá la consulta y cuántos resultados trajo. Se puede llamar varias veces por fuente: las refs se suman sin duplicados.',
  inputSchema: {
    corrida: esquemaCorrida,
    fuente: z.string().describe('Id de la fuente de la receta, por ejemplo "calendario"'),
    refs: z.array(z.string().min(1)).describe('Una ref por cosa leída: id del evento, del mail, del mensaje o clave del ticket. Vacía si la búsqueda no trajo nada.'),
    resumen: z.string().min(1).describe('Una línea con lo leído, contado igual que las refs ("23 eventos del 2 al 9"), sin clasificar todavía; o qué búsqueda no trajo nada'),
    consulta: z.string().optional().describe('La búsqueda tal como se hizo (término, remitente, fechas). Las búsquedas que el borrador cita como hechas tienen que estar registradas.'),
    total: z.number().int().min(0).optional().describe('Cuántos resultados devolvió la búsqueda. Si registrás menos refs que este total, se rechaza.'),
  },
}, async ({ corrida, fuente, refs, resumen, consulta, total }) => {
  const receta = recetaDeCorrida(corrida);
  const id = String(fuente || '').replace(/^fuente:/, '');
  if (!receta.fuentes.some((f) => f.id === id)) {
    return falla(`"${fuente}" no es una fuente de esta receta. Fuentes: ${receta.fuentes.map((f) => f.id).join(', ')}`);
  }
  if (corridas.LECTORES_PROPIOS[id]) {
    return falla(`${id} se lee con ${corridas.LECTORES_PROPIOS[id]}, que ya registra la lectura sola.`);
  }
  const unicas = new Set(refs.map((r) => String(r).trim()).filter(Boolean));
  if (Number.isInteger(total) && unicas.size < total) {
    return falla(`La búsqueda devolvió ${total} resultados y pasaste ${unicas.size} refs distintas. Registrá todos los ids que devolvió (los que no sirven van a descartados con su motivo).`);
  }
  const l = corridas.registrarLectura(corrida, id, { refs, resumen, consulta });
  const busquedas = l.consultas?.length || 0;
  corridas.agregarEvento(corrida, { nodo: `fuente:${id}`, estado: 'ok', resultado: `${resumen} · ${l.refs.length} refs en total${busquedas ? ` en ${busquedas} búsqueda${busquedas === 1 ? '' : 's'}` : ''}` });
  return ok({ fuente: id, refs_registradas: l.refs.length, consultas: l.consultas, aviso: 'Cada una de estas refs tiene que terminar en un ítem o en descartados.' });
});

registrar('reportar_paso', CORRIDA, {
  description: 'Reporta el avance de una fuente o un paso de la corrida para que el visualizador lo muestre en vivo. Una vez por estado y en el momento en que pasa. Los nodos control y destino los cierra guardar_borrador.',
  inputSchema: {
    corrida: esquemaCorrida,
    nodo: z.string().describe('fuente:<id> o paso:<id>'),
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
  // control y destino tienen un solo estado final, el que deja guardar_borrador.
  if (['control', 'destino'].includes(normalizado)) {
    return falla(`${normalizado} lo reporta guardar_borrador; no hace falta reportarlo.`);
  }
  corridas.agregarEvento(corrida, { nodo: normalizado, estado, resultado });
  return ok('Registrado');
});

registrar('leer_github', CORRIDA, {
  description: 'Lee los PRs de la persona en los repos de sus proyectos dentro de la ventana de la corrida (con el GitHub CLI). Devuelve estado exacto, rama de destino, fechas locales, cuerpo, motivo de cierre, lo que incluye cada release y si ya llegó a producción. Si la salida es grande viene por páginas: pedí todas (pagina 2, 3...) con las mismas fechas; solo lo devuelto queda registrado como leído.',
  inputSchema: {
    corrida: esquemaCorrida,
    desde: z.string().optional().describe('YYYY-MM-DD; por defecto, el inicio de la ventana'),
    hasta: z.string().optional().describe('YYYY-MM-DD; por defecto, el fin de la ventana'),
    repos: z.array(z.string()).optional().describe('Limitar a estos repos (dueño/repo)'),
    pagina: z.number().int().min(1).optional().describe('Página a devolver (por defecto 1)'),
  },
}, async ({ corrida, desde, hasta, repos, pagina }) => {
  const { config } = configValida();
  const v = ventanaDeCorrida(corrida);
  const args = { desde: desde || v.desde, hasta: hasta || v.hasta, repos };
  if (!pagina || pagina === 1) corridas.agregarEvento(corrida, { nodo: 'fuente:github', estado: 'en_curso', resultado: 'Leyendo PRs' });
  const r = await enCache(`github|${corrida}|${JSON.stringify(args)}`, () => fuentesLocales.leerGithub({ config, ...args }));
  const paginas = fuentesLocales.paginarPorTamano(r.repos.flatMap((x) => x.prs), MAX_PAGINA);
  const p = paginaDe(paginas, pagina, 'leer_github');
  const prsPagina = new Set(paginas[p.n - 1]);
  const reposPagina = r.repos.map((x) => ({ ...x, prs: x.prs.filter((pr) => prsPagina.has(pr)) }));
  const refs = [...prsPagina].map((pr) => pr.ref);
  const l = corridas.registrarLectura(corrida, 'github', { refs, resumen: p.n === 1 ? r.resumen : undefined });
  const todosFallaron = r.repos.length && r.repos.every((x) => !x.ok);
  corridas.agregarEvento(corrida, {
    nodo: 'fuente:github',
    estado: todosFallaron ? 'error' : p.siguiente ? 'en_curso' : 'ok',
    resultado: todosFallaron ? `Sin acceso: ${r.repos[0].error}` : `${r.resumen}${p.total > 1 ? ` · página ${p.n} de ${p.total}` : ''} · ${l.refs.length} PRs distintos leídos en la corrida`,
  });
  return okCompacto({ ...r, repos: reposPagina, refs, pagina: p.n, paginas: p.total, siguiente: p.siguiente });
});

registrar('leer_sesiones', CORRIDA, {
  description: 'Lee los hitos (pedido y cierre, partidos por fecha local), pendientes, primer pedido y cierre de las sesiones de Claude Code y Codex de la persona dentro de la ventana. No devuelve transcripts enteros. Si la salida es grande viene por páginas: pedí todas (pagina 2, 3...) con las mismas fechas; solo lo devuelto queda registrado como leído.',
  inputSchema: {
    corrida: esquemaCorrida,
    desde: z.string().optional(),
    hasta: z.string().optional(),
    pagina: z.number().int().min(1).optional().describe('Página a devolver (por defecto 1)'),
  },
}, async ({ corrida, desde, hasta, pagina }) => {
  const { config } = configValida();
  const v = ventanaDeCorrida(corrida);
  const args = { desde: desde || v.desde, hasta: hasta || v.hasta };
  if (!pagina || pagina === 1) corridas.agregarEvento(corrida, { nodo: 'fuente:sesiones_ia', estado: 'en_curso', resultado: 'Leyendo sesiones' });
  // Sin recorte total: la salida se reparte en páginas en lugar de perder hitos.
  const r = await enCache(`sesiones|${corrida}|${JSON.stringify(args)}`, () => fuentesLocales.leerSesiones({ config, ...args, catalogo: catalogo(), max: Infinity }));
  const paginas = fuentesLocales.paginarPorTamano(r.sesiones, MAX_PAGINA);
  const p = paginaDe(paginas, pagina, 'leer_sesiones');
  const sesiones = paginas[p.n - 1];
  const refs = sesiones.map((s) => s.ref);
  const l = corridas.registrarLectura(corrida, 'sesiones_ia', { refs, resumen: p.n === 1 ? r.resumen : undefined });
  corridas.agregarEvento(corrida, {
    nodo: 'fuente:sesiones_ia',
    estado: p.siguiente ? 'en_curso' : 'ok',
    resultado: `${r.resumen}${p.total > 1 ? ` · página ${p.n} de ${p.total}` : ''} · ${l.refs.length} sesiones distintas leídas en la corrida`,
  });
  return okCompacto({ ...r, sesiones, refs, pagina: p.n, paginas: p.total, siguiente: p.siguiente });
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
  if (corrida) corridas.agregarEvento(corrida, { nodo: 'paso:resumen-local', estado: r.ok ? 'ok' : 'error', resultado: r.ok ? 'Resumen local listo' : r.error });
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
  description: 'Guarda el borrador final después del control de evidencia. Rechaza (y hay que corregir) si: algún ítem tiene una ref que no está en lo leído de esta corrida (TODAS sus refs tienen que ser válidas; las fuentes por conector necesitan registrar_lectura), algún descartado no tiene refs o cita refs que no están en lo leído, algún descartado dice que no se leyó (eso va a faltantes), quedan refs leídas sin clasificar (cada una va a un ítem o a descartados) o algún nodo fuente:* o paso:* no tiene estado final (ok, omitido o error). Al tercer intento guarda con observaciones.',
  inputSchema: {
    corrida: esquemaCorrida,
    borrador: z.string().min(1).describe('El entregable en el formato de la receta (Markdown)'),
    items: z.array(z.object({
      texto: z.string().describe('La afirmación del borrador, en una línea'),
      evidencia: z.array(z.object({
        fuente: z.string().describe('Id de la fuente: github, sesiones_ia, calendario, ...'),
        ref: z.string().describe('Referencia: dueño/repo#123, claude:abcd1234, id de evento o mail (tal como quedó en lo leído)'),
      })),
    })).describe('Cada afirmación del borrador con su evidencia'),
    descartados: z.array(z.object({
      texto: z.string().describe('Lo que quedó afuera, en una línea'),
      motivo: z.string().describe('Por qué, citando lo que dice la fuente'),
      refs: z.array(z.string()).optional().describe('Las refs leídas que cubre este descarte (al menos una)'),
      ref: z.string().optional().describe('Compatibilidad: una sola ref. Preferí "refs".'),
    })).optional().describe('Lo leído que no va al borrador. Cada descartado lleva al menos una ref.'),
    faltantes: z.array(z.object({ fuente: z.string(), motivo: z.string() })).optional(),
  },
}, async ({ corrida, borrador, items, descartados = [], faltantes = [] }) => {
  const receta = recetaDeCorrida(corrida);
  const meta = corridas.leerMeta(corrida);
  const r = corridas.cerrarCorrida({ id: corrida, receta, borrador, items, descartados, faltantes });
  if (!r.guardado) return falla(r.mensaje);
  const { config } = estadoEspacio();
  const destino = config?.entregables?.[meta.entregable]?.destino;
  corridas.agregarEvento(corrida, { nodo: 'destino', estado: 'ok', resultado: `Borrador listo · ${nombreDestino(destino)}` });
  corridas.actualizarMeta(corrida, { estado: 'lista', fin: new Date().toISOString(), control: r.resumen });
  const c = r.resumen;
  return ok(`Borrador guardado (${c.aceptados} ítems con evidencia${c.ok ? '' : `; con observaciones del control: ${c.rechazados} sin evidencia, ${c.sin_clasificar} refs sin clasificar, ${c.descartados_sin_ref} descartados sin refs, ${c.descartados_ref_invalida} descartados con refs no leídas, ${c.descartados_sin_leer} descartados sin leer, ${c.nodos_sin_estado.length} nodos sin estado`}). Nada se mandó: queda esperando el OK de la persona.`);
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
  description: 'Marca un borrador como aprobado por la persona y, si corresponde, guarda el seguimiento comercial. No guarda nada más ni manda nada a otros sistemas.',
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
