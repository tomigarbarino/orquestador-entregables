// Rutas del repo y del espacio personal. Solo Node.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const rutas = {
  esquemaConfig: path.join(RAIZ, 'esquema', 'config.schema.json'),
  esquemaEquipo: path.join(RAIZ, 'esquema', 'equipo.schema.json'),
  esquemaReceta: path.join(RAIZ, 'esquema', 'receta.schema.json'),
  recetasBase: path.join(RAIZ, 'recetas'),
  modulos: path.join(RAIZ, 'modulos'),
  catalogo: path.join(RAIZ, 'conectores', 'catalogo.yaml'),
  configEjemplo: path.join(RAIZ, 'config.example.yaml'),
  skills: path.join(RAIZ, 'skills'),
  mcp: path.join(RAIZ, 'mcp', 'servidor.mjs'),
  demo: path.join(RAIZ, 'ejemplo', 'demo'),
};

export function expandirHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(2));
  return p;
}

// El espacio es la carpeta personal: config.yaml, recetas propias, corridas, chat e historial.
export function rutaEspacio() {
  return path.resolve(expandirHome(process.env.ORQ_ESPACIO || path.join(RAIZ, 'mi-espacio')));
}

export function enEspacio(...partes) {
  return path.join(rutaEspacio(), ...partes);
}

// Devuelve la ruta solo si queda dentro de la carpeta base; si no, lanza un error.
export function dentroDe(base, ...partes) {
  const destino = path.resolve(base, ...partes);
  const rel = path.relative(path.resolve(base), destino);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Ruta fuera de ${base}: ${destino}`);
  }
  return destino;
}

// Para mostrar rutas sin el nombre de usuario de la máquina: la carpeta personal pasa a ser ~.
export function rutaVisible(p) {
  if (!p) return p;
  let ruta = p;
  try {
    ruta = fs.realpathSync.native(p);
  } catch {
    // si no existe, se muestra como vino
  }
  const home = os.homedir();
  if (ruta.toLowerCase().startsWith(home.toLowerCase())) return `~${ruta.slice(home.length).replaceAll(path.sep, '/')}`;
  return ruta;
}

export const ID_VALIDO = /^[a-z][a-z0-9-]{0,63}$/;
