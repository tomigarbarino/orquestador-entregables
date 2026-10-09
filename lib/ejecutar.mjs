// Ejecuta un programa con argumentos fijos (sin shell) y devuelve su salida.
import { execFile } from 'node:child_process';

export function ejecutar(comando, args, opciones = {}) {
  return new Promise((resolve) => {
    execFile(comando, args, { windowsHide: true, maxBuffer: 20 * 1024 * 1024, timeout: 60_000, ...opciones }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        codigo: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
        error: error ? (error.code === 'ENOENT' ? `No se encontró "${comando}"` : error.message) : null,
      });
    });
  });
}
