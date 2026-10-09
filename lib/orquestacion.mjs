// Corre un entregable en modo borrador con `claude -p`, desde la interfaz o una rutina.
// La corrida solo tiene permitidas las herramientas del orquestador y las de solo lectura
// de los conectores de la persona: no puede mandar ni cargar nada en otro sistema.
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ, rutas, rutaEspacio, enEspacio } from './rutas.mjs';
import { estadoEspacio, prepararReceta } from './espacio.mjs';
import { correrClaude } from './claude.mjs';
import { detectar, estadoFuentes } from './conectores.mjs';
import * as corridas from './corridas.mjs';
import { ahoraEn } from './horario.mjs';
import { sistemaCorrida, promptCorrida } from './prompts.mjs';
import { simularCorrida } from './demo.mjs';

const activas = new Map();

export function mcpConfig(nombre, modo) {
  const archivo = enEspacio('.tmp', `mcp-${modo}.json`);
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  fs.writeFileSync(archivo, JSON.stringify({
    mcpServers: {
      [nombre]: { type: 'stdio', command: process.execPath, args: [rutas.mcp, '--modo', modo, '--espacio', rutaEspacio()], env: {} },
    },
  }, null, 2));
  return archivo;
}

export async function correrEntregable({ entregable, origen = 'interfaz', demo = false, alTerminar }) {
  const e = estadoEspacio();
  if (!e.validacion.ok) throw new Error(`La configuración tiene errores: ${e.validacion.errores.map((x) => `${x.ruta}: ${x.mensaje}`).join('; ')}`);
  const config = e.config;
  const prep = prepararReceta(config, entregable);
  const id = corridas.nuevaCorrida({ entregable, origen, zona: config.zona_horaria });

  if (demo) {
    simularCorrida({ id, entregable, prep, config }).then((r) => alTerminar?.(r));
    return { id };
  }

  const detectado = await detectar();
  const fuentes = estadoFuentes(config, detectado);
  const lectura = new Set();
  for (const f of prep.receta.fuentes) {
    const est = fuentes[f.id];
    if (est?.conectada && est.activa !== false) for (const h of est.herramientas || []) if (h.startsWith('mcp__')) lectura.add(h);
  }
  const permitidas = ['mcp__orq_interfaz', ...lectura];
  const ahora = ahoraEn(config.zona_horaria);
  const modelo = config.modelos?.corridas || 'sonnet';
  corridas.actualizarMeta(id, { modelo, herramientas_lectura: [...lectura] });

  const log = fs.createWriteStream(path.join(corridas.dirCorridas(), id, 'salida.log'), { flags: 'a' });
  const { proceso, promesa } = correrClaude({
    cwd: rutaEspacio(),
    prompt: promptCorrida({ entregable, corrida: id, ahora }),
    args: [
      '--model', modelo,
      '--tools', '',
      '--mcp-config', mcpConfig('orq_interfaz', 'corrida'),
      '--permission-mode', 'dontAsk',
      '--allowedTools', permitidas.join(','),
      '--append-system-prompt', sistemaCorrida(),
      '--no-session-persistence',
    ],
    eventos: {
      onHerramienta: (b) => log.write(`→ ${b.name} ${JSON.stringify(b.input).slice(0, 400)}\n`),
      onResultadoHerramienta: (b) => log.write(`← ${b.is_error ? 'ERROR ' : ''}${JSON.stringify(b.content).slice(0, 400)}\n`),
      onTexto: (t) => log.write(t),
    },
  });
  activas.set(id, proceso);

  promesa.then((r) => {
    activas.delete(id);
    log.end(`\n\n[fin] ok=${r.ok} costo=${r.costo ?? '-'} ${r.error || ''}\n`);
    const c = corridas.leerCorrida(id);
    if (!c.borrador) {
      const motivo = r.ok ? 'La corrida terminó sin guardar el borrador' : `La corrida falló: ${r.error}`;
      corridas.agregarEvento(id, { nodo: 'destino', estado: 'error', resultado: motivo.slice(0, 280) });
      if (r.resultado) fs.writeFileSync(path.join(corridas.dirCorridas(), id, 'respuesta.md'), String(r.resultado));
      corridas.actualizarMeta(id, { estado: 'error', fin: new Date().toISOString(), error: motivo, costo: r.costo });
    } else {
      corridas.actualizarMeta(id, { fin: new Date().toISOString(), costo: r.costo, resumen_final: String(r.resultado || '').slice(0, 500) });
    }
    alTerminar?.(r);
  });
  return { id };
}

export function cancelarCorrida(id) {
  const p = activas.get(id);
  if (!p) return false;
  p.kill();
  corridas.agregarEvento(id, { nodo: 'destino', estado: 'error', resultado: 'Cancelada desde la interfaz' });
  corridas.actualizarMeta(id, { estado: 'cancelada', fin: new Date().toISOString() });
  return true;
}

export function corridaActiva(id) {
  return activas.has(id);
}

export { RAIZ };
