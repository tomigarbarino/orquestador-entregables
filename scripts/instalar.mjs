#!/usr/bin/env node
// Instalador: revisa las herramientas, enlaza las skills en ~/.claude/skills, registra el
// servidor MCP del orquestador en Claude Code, crea tu espacio y levanta la interfaz.
//   node scripts/instalar.mjs                 instala y abre la interfaz
//   node scripts/instalar.mjs --sin-interfaz  instala sin abrir la interfaz
//   node scripts/instalar.mjs --revisar       solo muestra qué haría
//   node scripts/instalar.mjs --desinstalar   saca los enlaces y el servidor MCP
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { RAIZ, rutas } from '../lib/rutas.mjs';
import { ejecutar } from '../lib/ejecutar.mjs';
import { claudeCli } from '../lib/claude.mjs';

const args = process.argv.slice(2);
const REVISAR = args.includes('--revisar');
const DESINSTALAR = args.includes('--desinstalar');
const SIN_INTERFAZ = args.includes('--sin-interfaz') || REVISAR || DESINSTALAR;
const NOMBRE_MCP = 'orquestador';
const dirSkills = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'skills');

const ok = (t) => console.log(`  ✓ ${t}`);
const aviso = (t) => console.log(`  ! ${t}`);
const falla = (t) => console.log(`  ✗ ${t}`);

async function revisarHerramientas() {
  console.log('\n1. Herramientas');
  const [mayor] = process.versions.node.split('.').map(Number);
  if (mayor < 20) {
    falla(`Node ${process.versions.node}: hace falta Node 20 o más nuevo (nodejs.org)`);
    process.exit(1);
  }
  ok(`Node ${process.versions.node}`);
  const git = await ejecutar('git', ['--version']);
  if (git.ok) ok(git.stdout.trim());
  else falla('git no está instalado: hace falta para el historial (git-scm.com)');
  const claude = await claudeCli(['--version'], { timeout: 30_000 });
  if (claude.ok) ok(`Claude Code ${claude.stdout.trim()}`);
  else {
    falla('Claude Code no está instalado. Instalalo con: npm install -g @anthropic-ai/claude-code');
    process.exit(1);
  }
  const auth = await claudeCli(['auth', 'status'], { timeout: 30_000 });
  try {
    if (JSON.parse(auth.stdout).loggedIn) ok('Claude Code tiene una sesión iniciada');
    else aviso('Claude Code no tiene una sesión iniciada: corré "claude auth login" antes de probar un entregable');
  } catch {
    aviso('No se pudo revisar la sesión de Claude Code');
  }
  const gh = await ejecutar('gh', ['auth', 'status']);
  if (gh.error?.startsWith('No se encontró')) aviso('El GitHub CLI (gh) no está instalado: lo necesitás solo si querés leer PRs (cli.github.com)');
  else if (/Logged in/i.test(`${gh.stdout}${gh.stderr}`)) ok('GitHub CLI con sesión');
  else aviso('El GitHub CLI no tiene sesión: corré "gh auth login" si querés leer PRs');
}

function mismaRuta(a, b) {
  try {
    return fs.realpathSync(a).toLowerCase() === fs.realpathSync(b).toLowerCase();
  } catch {
    return false;
  }
}

function enlazarSkills() {
  console.log(`\n2. Skills en ${dirSkills}`);
  if (!REVISAR) fs.mkdirSync(dirSkills, { recursive: true });
  for (const nombre of fs.readdirSync(rutas.skills)) {
    const origen = path.join(rutas.skills, nombre);
    const destino = path.join(dirSkills, nombre);
    let existe = false;
    try {
      fs.lstatSync(destino);
      existe = true;
    } catch {
      existe = false;
    }
    if (DESINSTALAR) {
      if (existe && mismaRuta(destino, origen)) {
        fs.rmSync(destino, { recursive: false, force: true });
        ok(`${nombre}: enlace quitado`);
      }
      continue;
    }
    if (existe && mismaRuta(destino, origen)) {
      ok(`${nombre}: ya estaba enlazada`);
    } else if (existe) {
      aviso(`${nombre}: ya hay otra skill con ese nombre; no la toco`);
    } else if (REVISAR) {
      ok(`${nombre}: se enlazaría`);
    } else {
      fs.symlinkSync(origen, destino, process.platform === 'win32' ? 'junction' : 'dir');
      ok(`${nombre}: enlazada`);
    }
  }
}

async function registrarMcp() {
  console.log('\n3. Servidor MCP del orquestador en Claude Code');
  const existente = await claudeCli(['mcp', 'get', NOMBRE_MCP], { timeout: 60_000 });
  const yaEsta = existente.ok && existente.stdout.includes('servidor.mjs');
  if (DESINSTALAR) {
    if (yaEsta) {
      await claudeCli(['mcp', 'remove', NOMBRE_MCP, '--scope', 'user']);
      ok('servidor quitado');
    }
    return;
  }
  if (yaEsta && existente.stdout.includes(RAIZ)) {
    ok(`"${NOMBRE_MCP}" ya estaba registrado`);
    return;
  }
  const comando = ['mcp', 'add', '--scope', 'user', NOMBRE_MCP, '--', process.execPath, rutas.mcp, '--modo', 'completo'];
  if (REVISAR) {
    ok(`se correría: claude ${comando.join(' ')}`);
    return;
  }
  if (yaEsta) await claudeCli(['mcp', 'remove', NOMBRE_MCP, '--scope', 'user']);
  else if (existente.ok) {
    aviso(`ya hay otro servidor MCP llamado "${NOMBRE_MCP}"; no lo toco`);
    return;
  }
  const r = await claudeCli(comando, { timeout: 60_000 });
  if (r.ok) ok(`registrado como "${NOMBRE_MCP}" (en Claude Code sus herramientas se llaman mcp__${NOMBRE_MCP}__…)`);
  else falla(`no se pudo registrar: ${(r.stderr || r.stdout || r.error).trim()}`);
}

async function crearEspacio() {
  console.log('\n4. Tu espacio');
  if (DESINSTALAR) {
    ok('no se toca: tu configuración y tus recetas quedan donde están');
    return;
  }
  if (REVISAR) {
    ok('se crea mi-espacio/ a partir de config.example.yaml (si no existe)');
    return;
  }
  const { asegurarEspacio } = await import('../lib/espacio.mjs');
  const { dir, creada } = await asegurarEspacio();
  ok(creada ? `creado en ${dir}, con la config de ejemplo para que la edites desde la interfaz` : `ya existía: ${dir}`);
}

console.log(`Orquestador de entregables — ${DESINSTALAR ? 'desinstalación' : REVISAR ? 'revisión (no cambia nada)' : 'instalación'}`);
console.log(`Repo: ${RAIZ}`);
await revisarHerramientas();
enlazarSkills();
await registrarMcp();
await crearEspacio();

if (DESINSTALAR) {
  console.log('\nListo. Tu espacio (mi-espacio/) no se borró.');
} else if (SIN_INTERFAZ) {
  console.log('\nListo. Levantá la interfaz con: npm start');
} else {
  console.log('\nListo. Abriendo la interfaz… (cortala con Ctrl+C)\n');
  spawn(process.execPath, [path.join(RAIZ, 'servidor', 'index.mjs')], { stdio: 'inherit' });
}
