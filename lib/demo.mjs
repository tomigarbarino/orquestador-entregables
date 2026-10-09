// Modo demo (npm run demo): corridas y chat simulados con datos ficticios, sin gastar
// tokens ni tocar cuentas reales. Sirve para mostrar la herramienta y para las capturas.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { rutas } from './rutas.mjs';
import * as corridas from './corridas.mjs';
import { leerConfig, listarRecetas } from './espacio.mjs';
import { crearPropuesta } from './propuestas.mjs';
import { estadoFuentes, leerDemo } from './conectores.mjs';
import { nombreDestino } from './receta-efectiva.mjs';

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const PAUSA = Number(process.env.ORQ_DEMO_PAUSA || 700);

function fixture(nombre) {
  return JSON.parse(fs.readFileSync(path.join(rutas.demo, nombre), 'utf8'));
}

export async function simularCorrida({ id, entregable, prep, config }) {
  const datos = fixture('corridas.json');
  const caso = datos[prep.receta.id] || datos.generico;
  const fuentes = estadoFuentes(config, leerDemo());
  const receta = prep.receta;
  fs.writeFileSync(path.join(corridas.dirCorridas(), id, 'receta.json'), JSON.stringify(receta, null, 2));
  corridas.actualizarMeta(id, { receta: receta.id, ventana: caso.ventana, demo: true });
  await esperar(PAUSA);
  corridas.agregarEvento(id, { nodo: 'disparador', estado: 'ok', resultado: `Probar ahora · ${caso.ventana.desde} → ${caso.ventana.hasta}` });

  for (const f of receta.fuentes) {
    const nodo = `fuente:${f.id}`;
    const est = fuentes[f.id];
    // En la demo, una fuente activa con datos de ejemplo se simula leída aunque su conector
    // no figure conectado (por ejemplo Jira en el digest). Sin datos de ejemplo, queda en rojo.
    const simulada = Boolean(est) && est.activa !== false && Boolean(caso.fuentes?.[f.id]);
    if (!simulada && (!est?.conectada || est.activa === false)) {
      corridas.agregarEvento(id, { nodo, estado: 'error', resultado: `No conectada: ${est?.detalle || 'no está en la configuración'}` });
      continue;
    }
    corridas.agregarEvento(id, { nodo, estado: 'en_curso', resultado: 'Leyendo' });
    await esperar(PAUSA);
    const r = caso.fuentes?.[f.id] || { resumen: 'Sin novedades en la ventana', refs: [] };
    corridas.registrarLectura(id, f.id, r);
    corridas.agregarEvento(id, { nodo, estado: 'ok', resultado: r.resumen });
  }

  for (const p of receta.pasos) {
    const nodo = `paso:${p.id}`;
    corridas.agregarEvento(id, { nodo, estado: 'en_curso' });
    await esperar(PAUSA);
    corridas.agregarEvento(id, { nodo, estado: 'ok', resultado: caso.pasos?.[p.id] || 'Listo' });
  }

  corridas.agregarEvento(id, { nodo: 'control', estado: 'en_curso', resultado: 'Revisando evidencia' });
  await esperar(PAUSA);
  const borrador = caso.borrador.join('\n');
  // El mismo control que una corrida real, en un solo intento: si los datos de ejemplo no lo
  // pasan, el borrador queda guardado con observaciones (y el test de la demo lo detecta).
  // El caso genérico sirve para varias recetas: sus descartados de fuentes que esta receta no lee no aplican.
  const leidas = Object.values(corridas.leerLecturas(id)).flatMap((l) => l.refs || []);
  const descartados = (caso.descartados || []).filter((d) => [...(d.refs || []), ...(d.ref ? [d.ref] : [])].every((ref) => corridas.coincideRef(ref, leidas)));
  const r = corridas.cerrarCorrida({ id, receta, borrador, items: caso.items, descartados, faltantes: caso.faltantes || [], maxIntentos: 1 });
  const destino = config.entregables?.[entregable]?.destino;
  corridas.agregarEvento(id, { nodo: 'destino', estado: 'ok', resultado: `Borrador listo · ${nombreDestino(destino)}` });
  corridas.actualizarMeta(id, { estado: 'lista', fin: new Date().toISOString(), control: r.resumen });
  return { ok: true, control: r.resumen };
}

async function escribirDeA(texto, onDelta) {
  for (const trozo of texto.match(/.{1,12}/gs) || []) {
    onDelta(trozo);
    await esperar(25);
  }
}

// Respuestas de ejemplo del chat: reconocen dos pedidos típicos y proponen el cambio.
export async function responderDemo({ texto, pantalla, onDelta, onPropuesta }) {
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
