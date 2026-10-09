// Rutinas programadas a partir de la config: tareas del Programador de tareas en Windows
// y líneas de crontab en Mac y Linux. Primero se arma el plan; aplicarlo pide OK.
import path from 'node:path';
import { spawn } from 'node:child_process';
import { RAIZ, rutaEspacio } from './rutas.mjs';
import { ejecutar } from './ejecutar.mjs';

const CARPETA_TAREAS = 'OrquestadorEntregables';
const A_SCHTASKS = { lun: 'MON', mar: 'TUE', mie: 'WED', jue: 'THU', vie: 'FRI', sab: 'SAT', dom: 'SUN' };
const A_CRON = { lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6, dom: 0 };
const MARCA_INICIO = '# >>> orquestador-entregables (no editar a mano)';
const MARCA_FIN = '# <<< orquestador-entregables';

export function planRutinas(entregables, plataforma = process.platform) {
  const script = path.join(RAIZ, 'scripts', 'correr.mjs');
  const espacio = rutaEspacio();
  const tareas = entregables
    .filter((e) => e.activo && e.horario && !e.horario.a_pedido)
    .map((e) => {
      const [hh, mm] = e.horario.hora.split(':');
      const base = { id: e.id, nombre: e.nombre, dias: e.horario.dias, hora: e.horario.hora };
      if (plataforma === 'win32') {
        const tr = `"${process.execPath}" "${script}" ${e.id} --espacio "${espacio}"`;
        return {
          ...base,
          args: ['/Create', '/F', '/TN', `${CARPETA_TAREAS}\\${e.id}`, '/SC', 'WEEKLY', '/D', e.horario.dias.map((d) => A_SCHTASKS[d]).join(','), '/ST', e.horario.hora, '/TR', tr],
          comando: `schtasks /Create /F /TN "${CARPETA_TAREAS}\\${e.id}" /SC WEEKLY /D ${e.horario.dias.map((d) => A_SCHTASKS[d]).join(',')} /ST ${e.horario.hora} /TR "${tr.replaceAll('"', '\\"')}"`,
        };
      }
      const dias = e.horario.dias.map((d) => A_CRON[d]).sort().join(',');
      const linea = `${Number(mm)} ${Number(hh)} * * ${dias} cd '${RAIZ}' && '${process.execPath}' scripts/correr.mjs ${e.id} --espacio '${espacio}' >> '${path.join(espacio, 'corridas', 'rutinas.log')}' 2>&1`;
      return { ...base, linea, comando: linea };
    });
  return {
    plataforma,
    tareas,
    explicacion: plataforma === 'win32'
      ? `Se crean ${tareas.length} tareas en el Programador de tareas de Windows, dentro de la carpeta "${CARPETA_TAREAS}". Se borran las de esa carpeta que ya no estén en la config.`
      : `Se reemplaza el bloque del orquestador en tu crontab por ${tareas.length} líneas. El resto de tu crontab no se toca.`,
    requisitos: 'La computadora tiene que estar prendida a esa hora y Claude Code tiene que tener una sesión iniciada. Cada rutina deja su borrador en la interfaz; no manda nada.',
  };
}

async function tareasExistentesWindows() {
  const r = await ejecutar('schtasks', ['/Query', '/FO', 'CSV', '/NH']);
  return r.stdout.split(/\r?\n/)
    .map((l) => l.split('","')[0]?.replace(/^"/, ''))
    .filter((n) => n?.startsWith(`\\${CARPETA_TAREAS}\\`))
    .map((n) => n.split('\\').pop());
}

export async function aplicarRutinas(plan) {
  const resultados = [];
  if (plan.plataforma === 'win32') {
    const existentes = await tareasExistentesWindows();
    for (const t of plan.tareas) {
      const r = await ejecutar('schtasks', t.args);
      resultados.push({ id: t.id, ok: r.ok, detalle: (r.stdout || r.stderr || r.error).trim() });
    }
    for (const viejo of existentes.filter((n) => !plan.tareas.some((t) => t.id === n))) {
      const r = await ejecutar('schtasks', ['/Delete', '/F', '/TN', `${CARPETA_TAREAS}\\${viejo}`]);
      resultados.push({ id: viejo, ok: r.ok, detalle: `borrada: ${(r.stdout || r.stderr).trim()}` });
    }
    return resultados;
  }
  const actual = await ejecutar('crontab', ['-l']);
  const lineas = (actual.ok ? actual.stdout : '').split('\n');
  const sinBloque = [];
  let dentro = false;
  for (const l of lineas) {
    if (l.trim() === MARCA_INICIO) dentro = true;
    else if (l.trim() === MARCA_FIN) dentro = false;
    else if (!dentro) sinBloque.push(l);
  }
  const nuevo = [...sinBloque.filter((l, i, a) => l.trim() || i < a.length - 1), MARCA_INICIO, ...plan.tareas.map((t) => t.linea), MARCA_FIN, ''].join('\n');
  await new Promise((resolve, reject) => {
    const p = spawn('crontab', ['-'], { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(err || `crontab terminó con ${c}`))));
    p.stdin.end(nuevo);
  });
  return plan.tareas.map((t) => ({ id: t.id, ok: true, detalle: 'línea agregada al crontab' }));
}
