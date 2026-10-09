// Versionado local del espacio con git: cada cambio es un commit y se puede deshacer.
import fs from 'node:fs';
import path from 'node:path';
import { ejecutar } from './ejecutar.mjs';

const AUTOR = ['-c', 'user.name=Orquestador de entregables', '-c', 'user.email=orquestador@localhost', '-c', 'commit.gpgsign=false'];

function git(dir, args) {
  return ejecutar('git', ['-C', dir, ...AUTOR, ...args]);
}

const IGNORAR = ['corridas/', '.chat/', '.propuestas/', '.tmp/', '.cache/', ''].join('\n');

export async function asegurarRepo(dir) {
  if (!fs.existsSync(path.join(dir, '.gitignore'))) fs.writeFileSync(path.join(dir, '.gitignore'), IGNORAR);
  if (fs.existsSync(path.join(dir, '.git'))) return false;
  const init = await git(dir, ['init', '-q', '-b', 'main']);
  if (!init.ok) throw new Error(`No se pudo iniciar el historial con git: ${init.error || init.stderr}`);
  await commit(dir, 'Espacio creado');
  return true;
}

export async function commit(dir, mensaje) {
  await git(dir, ['add', '-A']);
  const estado = await git(dir, ['status', '--porcelain']);
  if (!estado.stdout.trim()) return null;
  const r = await git(dir, ['commit', '-q', '-m', mensaje]);
  if (!r.ok) throw new Error(`No se pudo guardar el cambio en el historial: ${r.stderr || r.error}`);
  const sha = await git(dir, ['rev-parse', 'HEAD']);
  return sha.stdout.trim();
}

export async function log(dir, limite = 40) {
  const r = await git(dir, ['log', `-n${limite}`, '--date=iso-strict', '--pretty=format:%H%x1f%ad%x1f%s']);
  if (!r.ok) return [];
  return r.stdout.split('\n').filter(Boolean).map((l) => {
    const [sha, fecha, mensaje] = l.split('\x1f');
    return { sha, corto: sha.slice(0, 7), fecha, mensaje };
  });
}

export async function archivosDe(dir, sha) {
  const r = await git(dir, ['show', '--name-status', '--pretty=format:', sha]);
  return r.stdout.split('\n').filter(Boolean);
}

export async function deshacer(dir, sha) {
  if (!/^[0-9a-f]{7,40}$/.test(sha)) throw new Error('Identificador de cambio inválido');
  const r = await git(dir, ['revert', '--no-edit', sha]);
  if (!r.ok) {
    await git(dir, ['revert', '--abort']);
    throw new Error(`No se pudo deshacer: un cambio posterior toca lo mismo. Deshacé primero los más nuevos. (${(r.stderr || '').trim().split('\n')[0]})`);
  }
  const head = await git(dir, ['rev-parse', 'HEAD']);
  return head.stdout.trim();
}
