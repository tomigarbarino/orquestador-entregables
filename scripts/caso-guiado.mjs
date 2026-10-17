// Sin argumentos: replay sin red. --local: UNA inferencia explícita en localhost.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { controlarSeleccion, esquemaSeleccion, salidaConFallo } from '../lib/caso-guiado.mjs';

const ruta = (nombre) => fileURLToPath(new URL(`../ejemplo/caso-publico/${nombre}`, import.meta.url));
const bytes = fs.readFileSync(ruta('fuentes.json'));
const paquete = JSON.parse(bytes);
const hash = createHash('sha256').update(bytes).digest('hex');
const args = process.argv.slice(2);
if (args.some((a) => a !== '--local') || args.length > 1) throw new Error('Uso: npm run caso [-- --local]');
let registro;
if (args.includes('--local')) {
  const prompt = `Seleccioná los tres registros del snapshot para un avance. Conservá cada ID y el estado en_main. No afirmes despliegues. Respondé solo el objeto JSON del esquema.\n${bytes.toString('utf8')}`;
  const request = { model: 'qwen3.5:4b', prompt, format: esquemaSeleccion, stream: false, think: false, options: { temperature: 0, num_predict: 512 } };
  const inicio = performance.now();
  const respuesta = await fetch('http://127.0.0.1:11434/api/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(90000),
  });
  if (!respuesta.ok) throw new Error(`Ollama respondió HTTP ${respuesta.status}`);
  const raw = await respuesta.json();
  registro = { capturado_en: new Date().toISOString(), fuente_sha256: hash, proveedor: 'Ollama local', request, raw,
    mediciones: { pared_ms: Math.round(performance.now() - inicio), cargo_proveedor_usd: 0, electricidad_usd: null, hardware_usd: null, edicion_humana_min: null, ahorro_tiempo_min: null },
  };
  // Registrar también las salidas rechazadas: no se corrigen a mano.
  fs.writeFileSync(ruta('corrida.json'), `${JSON.stringify(registro, null, 2)}\n`);
} else registro = JSON.parse(fs.readFileSync(ruta('corrida.json'), 'utf8'));
if (registro.fuente_sha256 !== hash) throw new Error('El snapshot cambió respecto de la corrida registrada.');
const control = controlarSeleccion(paquete, registro.raw.response);
if (!control.ok) throw new Error(`Corrida rechazada: ${control.errores.join(' ')}`);
const fallo = controlarSeleccion(paquete, salidaConFallo(registro.raw.response));
if (fallo.ok || fallo.borrador !== null) throw new Error('El fallo no fue bloqueado.');
console.log(JSON.stringify({ modo: args.length ? 'inferencia local registrada' : 'replay sin red', control: 'aceptado como borrador', registros: control.registros.length, fallo: 'bloqueado', pared_ms_original: registro.mediciones.pared_ms, tokens_entrada: registro.raw.prompt_eval_count, tokens_salida: registro.raw.eval_count }, null, 2));
console.log(control.borrador);
