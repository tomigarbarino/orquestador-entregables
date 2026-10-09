#!/usr/bin/env node
// Escaneo antes de publicar: busca mails, teléfonos, tokens, URLs y nombres propios en los
// archivos que se subirían al repo (lo que git no ignora). Sale con código 1 si encuentra algo.
//   node scripts/escanear.mjs
//   node scripts/escanear.mjs --nombres ruta/lista.txt   suma nombres a buscar (uno por línea)
// Además de esa lista, busca los nombres que aparecen en tu config real (mi-espacio/config.yaml):
// tu nombre, tu empresa, personas, clientes, proyectos y repos.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { RAIZ, enEspacio } from '../lib/rutas.mjs';
import { ejecutar } from '../lib/ejecutar.mjs';

const args = process.argv.slice(2);

const HOSTS_PERMITIDOS = [
  'github.com/tomigarbarino/orquestador-entregables',
  'claude.ai', 'claude.com', 'anthropic.com', 'docs.anthropic.com', 'code.claude.com',
  'nodejs.org', 'git-scm.com', 'cli.github.com', 'ollama.com', 'reactflow.dev', 'json-schema.org',
  'registry.npmjs.org', 'www.w3.org', 'localhost', '127.0.0.1', 'orquestador-entregables.local',
  'fathom.ai', 'developers.fathom.ai', // documentación pública del conector de Fathom
  'github.com/acme-ejemplo', // organización ficticia de los ejemplos y los tests
  'orquestador-entregables.vercel.app', // demo pública de este repo
];
const DOMINIOS_EJEMPLO = /(^|\.)example(\.com|\.org)?$|\.example$|\.invalid$|\.test$/;
const PALABRAS_GENERICAS = new Set(['producto', 'equipo', 'desarrollo', 'investigación', 'comercial', 'daily', 'main', 'develop', 'jira', 'slack', 'github', 'ejemplo', 'datos', 'proyecto', 'agentes']);

const PATRONES = [
  { tipo: 'token', re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}/g },
  { tipo: 'token', re: /\bsk-ant-[A-Za-z0-9_-]{20,}|\bsk-[A-Za-z0-9]{32,}\b/g },
  { tipo: 'token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { tipo: 'token', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { tipo: 'token', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { tipo: 'token', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { tipo: 'token', re: /\b(api[_-]?key|secret|password|contraseña|token)\b\s*[:=]\s*["'][^"'\s]{12,}["']/gi },
  { tipo: 'mail', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { tipo: 'teléfono', re: /(?:\+\d{1,3}[\s-]?)?\(?\b\d{2,4}\)?[\s-]\d{3,4}[\s-]\d{4}\b|\+\d{10,13}\b/g },
  { tipo: 'url', re: /https?:\/\/[^\s)"'`<>\]]+/g },
];

function nombresDeConfig() {
  const ruta = enEspacio('config.yaml');
  if (!fs.existsSync(ruta)) return [];
  let c;
  try {
    c = YAML.parse(fs.readFileSync(ruta, 'utf8'));
  } catch {
    return [];
  }
  const ejemplo = YAML.parse(fs.readFileSync(path.join(RAIZ, 'config.example.yaml'), 'utf8'));
  if (JSON.stringify(c.persona) === JSON.stringify(ejemplo.persona)) return [];
  const nombres = [];
  const sumar = (x) => x && nombres.push(String(x));
  sumar(c.persona?.nombre);
  for (const parte of String(c.persona?.nombre || '').split(/\s+/)) sumar(parte);
  sumar(c.persona?.empresa);
  sumar(c.persona?.github_usuario);
  for (const p of c.personas || []) {
    sumar(p.nombre);
    sumar(p.alias);
    for (const parte of String(p.nombre).split(/\s+/)) sumar(parte);
  }
  for (const x of c.clientes || []) sumar(x.nombre);
  for (const p of c.proyectos || []) {
    sumar(p.nombre);
    for (const r of p.repos || []) {
      const [dueno, repo] = r.split('/');
      sumar(dueno);
      sumar(repo);
    }
  }
  for (const g of c.glosario || []) sumar(g.termino);
  return nombres;
}

function nombresExtra() {
  const i = args.indexOf('--nombres');
  if (i < 0 || !args[i + 1]) return [];
  return fs.readFileSync(args[i + 1], 'utf8').split(/\r?\n/).map((x) => x.trim()).filter((x) => x && !x.startsWith('#'));
}

const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function urlPermitida(url) {
  // Plantillas (${…}) y textos de ejemplo (https://…) no son direcciones reales.
  if (url.includes('${') || /^https?:\/\/…/.test(url)) return true;
  let u;
  try {
    u = new URL(url.replace(/[.,;:]+$/, ''));
  } catch {
    return false;
  }
  if (DOMINIOS_EJEMPLO.test(u.hostname)) return true;
  const sinProtocolo = `${u.hostname}${u.pathname}`;
  return HOSTS_PERMITIDOS.some((h) => sinProtocolo.startsWith(h) || u.hostname === h || u.hostname.endsWith(`.${h}`));
}

function mailPermitido(mail) {
  const dominio = mail.split('@')[1].toLowerCase();
  return DOMINIOS_EJEMPLO.test(dominio) || dominio === 'localhost';
}

const listado = await ejecutar('git', ['-C', RAIZ, 'ls-files', '--cached', '--others', '--exclude-standard']);
if (!listado.ok) {
  console.log('No se pudo listar los archivos con git:', listado.error || listado.stderr);
  process.exit(2);
}
const archivos = listado.stdout.split('\n').map((x) => x.trim()).filter(Boolean);
const nombres = [...new Set([...nombresDeConfig(), ...nombresExtra()])]
  .filter((n) => n.length >= 3 && !PALABRAS_GENERICAS.has(n.toLowerCase()));
const reNombres = nombres.length
  ? new RegExp(`(?<![\\p{L}\\p{N}_-])(${nombres.map(escapar).join('|')})(?![\\p{L}\\p{N}_])`, 'giu')
  : null;

const hallazgos = [];
const binarios = [];
for (const rel of archivos) {
  const ruta = path.join(RAIZ, rel);
  if (!fs.existsSync(ruta)) continue;
  const buffer = fs.readFileSync(ruta);
  if (buffer.includes(0)) {
    binarios.push(rel);
    continue;
  }
  const lineas = buffer.toString('utf8').split(/\r?\n/);
  lineas.forEach((linea, n) => {
    for (const { tipo, re } of PATRONES) {
      for (const m of linea.matchAll(re)) {
        const valor = m[0];
        if (tipo === 'url' && urlPermitida(valor)) continue;
        // El lockfile lo genera npm: sus links son de los paquetes (financiamiento, registro).
        if (tipo === 'url' && rel === 'package-lock.json') continue;
        if (tipo === 'mail' && mailPermitido(valor)) continue;
        if (tipo === 'mail' && /^[^@]+@[\d.]+$/.test(valor)) continue;
        if (tipo === 'teléfono' && /\d{4}-\d{2}-\d{2}/.test(linea.slice(Math.max(0, m.index - 2), m.index + valor.length + 2))) continue;
        hallazgos.push({ archivo: rel, linea: n + 1, tipo, valor: valor.slice(0, 120) });
      }
    }
    if (reNombres) {
      for (const m of linea.matchAll(reNombres)) hallazgos.push({ archivo: rel, linea: n + 1, tipo: 'nombre', valor: m[0] });
    }
  });
}

console.log(`Archivos revisados: ${archivos.length - binarios.length} de texto, ${binarios.length} binarios (${binarios.join(', ') || 'ninguno'}).`);
console.log(`Nombres buscados: ${nombres.length}${nombres.length ? ' (de tu config real y de la lista extra)' : ''}.`);
if (!hallazgos.length) {
  console.log('\n✓ Sin hallazgos: no aparecen mails, teléfonos, tokens, URLs internas ni nombres de la lista.');
  process.exit(0);
}
console.log(`\n✗ ${hallazgos.length} hallazgo(s):`);
for (const h of hallazgos) console.log(`  ${h.archivo}:${h.linea}  [${h.tipo}]  ${h.valor}`);
process.exit(1);
