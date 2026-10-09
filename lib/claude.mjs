// Cómo llamar al CLI de Claude Code: dónde está, con qué entorno y cómo leer su salida.
// La autorización queda en manos de Claude Code: acá no se guarda ningún token.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ejecutar } from './ejecutar.mjs';

export function resolverClaude() {
  if (process.env.ORQ_CLAUDE) return { comando: process.env.ORQ_CLAUDE, previos: [] };
  if (process.platform !== 'win32') return { comando: 'claude', previos: [] };
  // En Windows se busca el ejecutable real: el .cmd de npm pasa por cmd.exe y rompe argumentos largos.
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    if (fs.existsSync(path.join(dir, 'claude.cmd'))) {
      const bin = path.join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
      if (fs.existsSync(bin)) return { comando: bin, previos: [] };
      const cli = path.join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
      if (fs.existsSync(cli)) return { comando: process.execPath, previos: [cli] };
    }
    const exe = path.join(dir, 'claude.exe');
    if (fs.existsSync(exe)) return { comando: exe, previos: [] };
  }
  return { comando: 'claude.exe', previos: [] };
}

// Si la interfaz se levantó desde adentro de una sesión de Claude Code, se limpian las
// variables de esa sesión para que el CLI arranque como una sesión propia.
export function entornoLimpio() {
  const env = { ...process.env };
  if (env.CLAUDECODE || env.CLAUDE_CODE_ENTRYPOINT) {
    for (const k of Object.keys(env)) {
      if (k.startsWith('CLAUDE') && k !== 'CLAUDE_CONFIG_DIR') delete env[k];
    }
    if (process.env.CLAUDE_CODE_DESKTOP_APP_VERSION || process.env.CLAUDE_CODE_MESSAGING_SOCKET) delete env.ANTHROPIC_BASE_URL;
  }
  return env;
}

export async function claudeCli(args, opciones = {}) {
  const { comando, previos } = resolverClaude();
  return ejecutar(comando, [...previos, ...args], { env: entornoLimpio(), ...opciones });
}

export async function estadoAuth() {
  const r = await claudeCli(['auth', 'status'], { timeout: 20_000 });
  if (!r.ok && !r.stdout) return { instalado: false, logueado: false, detalle: r.error || r.stderr };
  try {
    const j = JSON.parse(r.stdout);
    return { instalado: true, logueado: Boolean(j.loggedIn), metodo: j.authMethod, detalle: j.loggedIn ? `Sesión iniciada (${j.authMethod})` : 'Claude Code no tiene una sesión iniciada' };
  } catch {
    return { instalado: true, logueado: /logged in/i.test(r.stdout), detalle: r.stdout.trim().split('\n')[0] };
  }
}

// Corre `claude -p` con salida stream-json. El prompt va por stdin.
// eventos: onInicio(init), onTexto(delta), onHerramienta(uso), onResultadoHerramienta(res), onFin(result)
export function correrClaude({ prompt, args, cwd, eventos = {} }) {
  const { comando, previos } = resolverClaude();
  const todos = [...previos, '-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', ...args];
  const proceso = spawn(comando, todos, { cwd, env: entornoLimpio(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let resto = '';
  let stderr = '';
  let final = null;
  const textoCompleto = [];

  const procesarLinea = (linea) => {
    if (!linea.trim()) return;
    let j;
    try {
      j = JSON.parse(linea);
    } catch {
      return;
    }
    if (j.type === 'system' && j.subtype === 'init') eventos.onInicio?.(j);
    else if (j.type === 'stream_event' && j.event?.type === 'content_block_delta' && j.event.delta?.type === 'text_delta') {
      textoCompleto.push(j.event.delta.text);
      eventos.onTexto?.(j.event.delta.text);
    } else if (j.type === 'assistant') {
      for (const b of j.message?.content || []) if (b.type === 'tool_use') eventos.onHerramienta?.(b);
    } else if (j.type === 'user') {
      for (const b of j.message?.content || []) if (b.type === 'tool_result') eventos.onResultadoHerramienta?.(b);
    } else if (j.type === 'result') {
      final = j;
    }
    eventos.onLinea?.(j);
  };

  proceso.stdout.on('data', (d) => {
    resto += d.toString('utf8');
    const lineas = resto.split('\n');
    resto = lineas.pop();
    lineas.forEach(procesarLinea);
  });
  proceso.stderr.on('data', (d) => {
    stderr += d.toString('utf8');
  });

  const promesa = new Promise((resolve) => {
    proceso.on('error', (e) => resolve({ ok: false, error: e.code === 'ENOENT' ? 'No se encontró el CLI de Claude Code' : e.message, stderr }));
    proceso.on('close', (codigo) => {
      if (resto) procesarLinea(resto);
      const ok = codigo === 0 && final && !final.is_error;
      const resultado = {
        ok: Boolean(ok),
        codigo,
        resultado: final?.result ?? textoCompleto.join(''),
        sesion: final?.session_id,
        costo: final?.total_cost_usd,
        error: ok ? null : (final?.result || stderr.trim().split('\n').slice(-3).join(' ') || `El CLI terminó con código ${codigo}`),
        stderr,
      };
      eventos.onFin?.(resultado);
      resolve(resultado);
    });
  });

  proceso.stdin.write(prompt);
  proceso.stdin.end();
  return { proceso, promesa };
}
