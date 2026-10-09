// Semilla de la demo (ejemplo/demo/semilla/): el espacio de Ana Ejemplo ya armado, con su historial,
// corridas terminadas, reglas aprendidas y una charla con el chat. La usan los dos modos demo
// (servidor/index.mjs --demo y la demo estática). Sin dependencias de Node: solo arma datos.
import YAML from 'yaml';
import { createTwoFilesPatch } from 'diff';
import { entregablesDe, recetaEfectiva, nombreDestino } from './receta-efectiva.mjs';

const ZONA = '-03:00'; // America/Argentina/Buenos_Aires: las fechas de la semilla se escriben en hora local

// "2026-10-09 09:00" o "2026-10-09 09:00:04" (hora de Buenos Aires) a ISO.
export function aIso(local) {
  const t = String(local).trim().replace(' ', 'T');
  return new Date(`${t.length === 16 ? `${t}:00` : t}${ZONA}`).toISOString();
}

const clonar = (x) => JSON.parse(JSON.stringify(x));

// ---------- Archivos del espacio e historial ----------

function aplicarAntes(estado, ops = []) {
  const salida = { ...estado };
  for (const op of ops) {
    if (op.borrar_archivo) {
      delete salida[op.archivo];
      continue;
    }
    const doc = YAML.parseDocument(salida[op.archivo] || '');
    if (op.borrar) doc.deleteIn(op.borrar);
    if (op.poner) doc.setIn(op.poner.ruta, op.poner.valor);
    salida[op.archivo] = doc.toString({ lineWidth: 0 });
  }
  return salida;
}

// semilla: { config, equipo, reglas, historial } (textos y objetos tal como están en ejemplo/demo/semilla).
// recetaBase(id) devuelve { recetaTexto, instrucciones } de la receta del repo.
// Devuelve el estado final de los archivos y los commits (del más viejo al más nuevo), cada uno con el
// estado completo de los archivos después del cambio. El estado de cada commit se deduce hacia atrás
// desde el final, así que el último es siempre exactamente lo que ve la persona.
export function armarEspacio({ semilla, configEjemplo, recetaBase }) {
  const final = { 'config.yaml': semilla.config, 'equipo.yaml': semilla.equipo };
  for (const [id, reglas] of Object.entries(semilla.reglas || {})) {
    const base = recetaBase(id);
    if (!base) continue;
    const doc = YAML.parseDocument(base.recetaTexto);
    doc.set('reglas', doc.createNode(reglas));
    final[`recetas/${id}/receta.yaml`] = doc.toString({ lineWidth: 0 });
    final[`recetas/${id}/instrucciones.md`] = base.instrucciones;
  }
  const historial = semilla.historial;
  const estados = new Array(historial.length);
  estados[historial.length - 1] = final;
  for (let i = historial.length - 1; i >= 2; i--) estados[i - 1] = aplicarAntes(estados[i], historial[i].antes);
  estados[0] = { 'config.yaml': configEjemplo };
  const commits = historial.map((h, i) => {
    const antes = i === 0 ? {} : estados[i - 1];
    const despues = estados[i];
    const cambiados = [...new Set([...Object.keys(antes), ...Object.keys(despues)])].filter((k) => antes[k] !== despues[k]);
    return { fecha: aIso(h.fecha), mensaje: h.mensaje, antes, despues, cambiados, propuesta: h.propuesta || null };
  });
  return { archivos: final, commits };
}

// Las propuestas del chat que ya se aplicaron (una por commit que la trae). commits: los de armarEspacio
// con su `sha` ya asignado.
export function propuestasAplicadas({ commits, reglas }) {
  const salida = [];
  for (const c of commits) {
    if (!c.propuesta) continue;
    const { id, origen, motivo, regla } = c.propuesta;
    const cambios = [];
    const diffs = [];
    for (const archivo of c.cambiados) {
      diffs.push({ archivo, parche: createTwoFilesPatch(archivo, archivo, c.antes[archivo] || '', c.despues[archivo] || '', 'actual', 'propuesto') });
      if (archivo === 'config.yaml') cambios.push({ tipo: 'config', yaml: c.despues[archivo] });
    }
    salida.push({
      id,
      fecha: new Date(Date.parse(c.fecha) - 90_000).toISOString(),
      origen,
      motivo,
      cambios,
      regla: regla ? { receta: regla, texto: reglas[regla][0].texto } : null,
      estado: 'aplicada',
      errores: [],
      avisos: [],
      diffs,
      aplicada: { fecha: c.fecha, commit: c.sha },
    });
  }
  return salida;
}

// ---------- Corridas terminadas ----------

const ORIGENES = { interfaz: 'Probar ahora', rutina: 'Rutina programada' };

// plan: ejemplo/demo/semilla/corridas.json. casos: ejemplo/demo/corridas.json (los mismos datos que usa
// "Probar ahora" en la demo). Devuelve, por corrida, todo lo que se guarda en su carpeta.
export function corridasSemilla({ plan, casos, config, recetas, modulos }) {
  const entregables = entregablesDe(config, recetas, modulos);
  const salida = [];
  for (const p of plan) {
    const entregable = entregables.find((e) => e.id === p.entregable);
    const caso = casos[p.caso];
    if (!entregable || !caso) continue;
    const receta = recetaEfectiva(entregable, config, recetas, modulos).receta;
    const inicio = Date.parse(aIso(p.inicio));
    const id = `${p.inicio.slice(0, 10).replaceAll('-', '')}-${p.inicio.slice(11).replaceAll(':', '').padEnd(6, '0')}-${p.entregable}`;

    // Nodos en orden: disparador, fuentes, pasos, control y destino; cada uno con su hora, repartidas en la duración.
    const lecturas = {};
    const pasos = [{ nodo: 'disparador', resultado: `${ORIGENES[p.origen] || p.origen} · ${caso.ventana.desde} → ${caso.ventana.hasta}` }];
    for (const f of receta.fuentes) {
      const r = caso.fuentes?.[f.id] || { resumen: 'Sin novedades en la ventana', refs: [] };
      pasos.push({ nodo: `fuente:${f.id}`, leyendo: true, resultado: r.resumen });
      lecturas[f.id] = { refs: [...(r.refs || [])], resumen: r.resumen };
    }
    for (const paso of receta.pasos) pasos.push({ nodo: `paso:${paso.id}`, resultado: caso.pasos?.[paso.id] || 'Listo' });

    const leidas = new Set(Object.values(lecturas).flatMap((l) => l.refs));
    // Lo que cita una fuente que no se leyó (apagada o sin conectar) no entra: el ítem se queda con el resto de su evidencia.
    const items = (caso.items || []).map((i) => ({ ...i, evidencia: i.evidencia.filter((e) => lecturas[e.fuente]) })).filter((i) => i.evidencia.length);
    const descartados = (caso.descartados || [])
      .map((d) => ({ texto: d.texto, motivo: d.motivo, refs: [...new Set([...(d.refs || []), ...(d.ref ? [d.ref] : [])])] }))
      .filter((d) => d.refs.length && d.refs.every((r) => leidas.has(r)));
    const faltantes = caso.faltantes || [];
    const control = { aceptados: items.length, rechazados: 0, descartados_sin_ref: 0, descartados_ref_invalida: 0, descartados_sin_leer: 0, sin_clasificar: 0, nodos_sin_estado: [], intentos: 1, ok: true };
    pasos.push({ nodo: 'control', resultado: `${items.length} con evidencia · ${descartados.length} descartados${faltantes.length ? ` · ${faltantes.length} faltante${faltantes.length === 1 ? '' : 's'}` : ''}` });
    pasos.push({ nodo: 'destino', resultado: `Borrador listo · ${nombreDestino(entregable.destino)}` });

    const total = pasos.reduce((n, x) => n + (x.leyendo ? 2 : 1), 0);
    const paso = (p.segundos * 1000) / total;
    let k = 0;
    const eventos = [];
    for (const x of pasos) {
      if (x.leyendo) eventos.push({ t: new Date(inicio + paso * k++).toISOString(), nodo: x.nodo, estado: 'en_curso', resultado: 'Leyendo' });
      else if (x.nodo.startsWith('paso:')) eventos.push({ t: new Date(inicio + paso * k++).toISOString(), nodo: x.nodo, estado: 'en_curso' });
      eventos.push({ t: new Date(inicio + paso * k++).toISOString(), nodo: x.nodo, estado: 'ok', resultado: x.resultado });
    }
    for (const nodo of Object.keys(lecturas)) lecturas[nodo].t = eventos.find((e) => e.nodo === `fuente:${nodo}` && e.estado === 'ok').t;

    const fin = new Date(inicio + p.segundos * 1000).toISOString();
    salida.push({
      id,
      meta: {
        id,
        entregable: p.entregable,
        origen: p.origen,
        modo: 'borrador',
        inicio: new Date(inicio).toISOString(),
        estado: 'lista',
        intentos_control: 1,
        receta: receta.id,
        ventana: caso.ventana,
        demo: true,
        fin,
        control,
        ...(p.aprobada ? { aprobada: aIso(p.aprobada) } : {}),
      },
      eventos,
      lecturas,
      receta,
      borrador: caso.borrador.join('\n'),
      evidencia: { items: clonar(items), descartados, faltantes: clonar(faltantes), control },
      seguimiento: caso.seguimiento ? clonar(caso.seguimiento) : null,
    });
  }
  return salida;
}

// ---------- Chat ----------

// chat: ejemplo/demo/semilla/chat.json. ids: { '@pendiente': 'p-...' } para las propuestas que se crean al arrancar.
export function chatSemilla(chat, ids = {}) {
  return {
    id: chat.id,
    sesion: chat.sesion,
    iniciada: chat.iniciada,
    creada: aIso(chat.creada),
    mensajes: chat.mensajes.map((m) => ({
      ...m,
      t: aIso(m.t),
      ...(m.propuestas ? { propuestas: m.propuestas.map((p) => ids[p] || p) } : {}),
    })),
  };
}

// Próximos pasos comerciales que quedaron en el seguimiento al aprobar la corrida de la reunión comercial.
export function seguimientoSemilla(corridas) {
  const salida = [];
  for (const c of corridas) {
    if (!c.seguimiento || !c.meta.aprobada) continue;
    for (const p of c.seguimiento.pasos) {
      salida.push({ cliente: c.seguimiento.cliente, fecha_reunion: c.seguimiento.fecha_reunion, ...p, estado: 'pendiente', corrida: c.id });
    }
  }
  return salida;
}
