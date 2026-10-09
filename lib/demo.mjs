// Modo demo (npm run demo): corridas y chat simulados con datos ficticios, sin gastar
// tokens ni tocar cuentas reales. Sirve para mostrar la herramienta y para las capturas.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { rutas, rutaEspacio } from './rutas.mjs';
import * as corridas from './corridas.mjs';
import { leerConfig, listarRecetas, listarModulos } from './espacio.mjs';
import * as historial from './historial.mjs';
import { armarEspacio, propuestasAplicadas, corridasSemilla, chatSemilla, seguimientoSemilla } from './semilla.mjs';
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
  // Lo que cita una fuente que no se leyó (apagada o sin conectar) no entra: el ítem se queda con el resto de su evidencia.
  const leidasPorFuente = corridas.leerLecturas(id);
  const items = (caso.items || []).map((i) => ({ ...i, evidencia: i.evidencia.filter((e) => leidasPorFuente[e.fuente]) })).filter((i) => i.evidencia.length);
  const r = corridas.cerrarCorrida({ id, receta, borrador, items, descartados, faltantes: caso.faltantes || [], maxIntentos: 1 });
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
    // Las fuentes que hoy usa el entregable: las propias, las del perfil de equipo o las de la receta.
    const receta = recetas[c.datos.entregables?.[entregable]?.receta || entregable]?.receta;
    const actuales = c.datos.entregables?.[entregable]?.fuentes || receta?.fuentes?.map((x) => x.id) || [];
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

// ---------- Espacio de la demo ----------

const dirSemilla = () => path.join(rutas.demo, 'semilla');
const leerSemilla = (nombre) => fs.readFileSync(path.join(dirSemilla(), nombre), 'utf8');
const escribirJSON = (ruta, datos) => {
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, JSON.stringify(datos, null, 2));
};

// Arma el espacio de la demo con la semilla (ejemplo/demo/semilla): la config de Ana Ejemplo, el perfil
// del equipo, el historial con fechas, las reglas aprendidas, una corrida terminada por entregable, las
// propuestas y una charla con el chat. Si el espacio ya tiene config.yaml no toca nada.
export async function sembrarDemo() {
  const dir = rutaEspacio();
  if (fs.existsSync(path.join(dir, 'config.yaml'))) return false;
  const semilla = {
    config: leerSemilla('config.yaml'),
    equipo: leerSemilla('equipo.yaml'),
    reglas: JSON.parse(leerSemilla('reglas.json')),
    historial: JSON.parse(leerSemilla('historial.json')),
  };
  const base = listarRecetas();
  const { archivos, commits } = armarEspacio({
    semilla,
    configEjemplo: fs.readFileSync(rutas.configEjemplo, 'utf8'),
    recetaBase: (id) => base[id] && { recetaTexto: base[id].recetaTexto, instrucciones: base[id].instrucciones },
  });

  // Historial: un commit por cambio, con su fecha, dejando en disco los archivos de cada momento.
  fs.mkdirSync(dir, { recursive: true });
  let previos = {};
  for (const [i, c] of commits.entries()) {
    for (const archivo of Object.keys(previos)) if (!(archivo in c.despues)) fs.rmSync(path.join(dir, archivo), { force: true });
    for (const [archivo, texto] of Object.entries(c.despues)) {
      fs.mkdirSync(path.dirname(path.join(dir, archivo)), { recursive: true });
      fs.writeFileSync(path.join(dir, archivo), texto);
    }
    previos = c.despues;
    if (i === 0) {
      await historial.asegurarRepo(dir, { fecha: c.fecha });
      c.sha = (await historial.log(dir, 1))[0].sha;
    } else {
      c.sha = await historial.commit(dir, c.mensaje, { fecha: c.fecha });
    }
  }
  for (const sub of ['recetas', 'corridas', '.propuestas', '.chat', '.tmp', '.cache']) fs.mkdirSync(path.join(dir, sub), { recursive: true });

  // Corridas terminadas.
  const config = leerConfig().datos;
  const hechas = corridasSemilla({ plan: JSON.parse(leerSemilla('corridas.json')), casos: fixture('corridas.json'), config, recetas: listarRecetas(), modulos: listarModulos() });
  for (const c of hechas) {
    const d = path.join(dir, 'corridas', c.id);
    fs.mkdirSync(d, { recursive: true });
    escribirJSON(path.join(d, 'meta.json'), c.meta);
    fs.writeFileSync(path.join(d, 'eventos.jsonl'), `${c.eventos.map((e) => JSON.stringify(e)).join('\n')}\n`);
    escribirJSON(path.join(d, 'lecturas.json'), c.lecturas);
    escribirJSON(path.join(d, 'receta.json'), c.receta);
    fs.writeFileSync(path.join(d, 'borrador.md'), c.borrador);
    escribirJSON(path.join(d, 'evidencia.json'), c.evidencia);
    if (c.seguimiento) escribirJSON(path.join(d, 'seguimiento-propuesto.json'), c.seguimiento);
  }
  const pasos = seguimientoSemilla(hechas);
  if (pasos.length) corridas.escribirSeguimiento(pasos);

  // Propuestas: las aplicadas (una por cambio hecho desde el chat) y una pendiente, lista para ver en el mapa.
  for (const p of propuestasAplicadas({ commits, reglas: semilla.reglas })) escribirJSON(path.join(dir, '.propuestas', `${p.id}.json`), p);
  const pendiente = crearPropuesta(JSON.parse(leerSemilla('propuesta-pendiente.json')));
  const chat = chatSemilla(JSON.parse(leerSemilla('chat.json')), { '@pendiente': pendiente.id });
  escribirJSON(path.join(dir, '.chat', `${chat.id}.json`), chat);
  return true;
}
