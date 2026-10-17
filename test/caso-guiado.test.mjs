import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { controlarSeleccion, salidaConFallo } from '../lib/caso-guiado.mjs';

const bytes = fs.readFileSync(new URL('../ejemplo/caso-publico/fuentes.json', import.meta.url));
const paquete = JSON.parse(bytes);
const corrida = JSON.parse(fs.readFileSync(new URL('../ejemplo/caso-publico/corrida.json', import.meta.url)));
const seleccion = JSON.parse(corrida.raw.response);

test('la corrida registrada corresponde a los bytes del snapshot y produce un borrador con sus enlaces', () => {
  assert.equal(corrida.fuente_sha256, createHash('sha256').update(bytes).digest('hex'));
  const control = controlarSeleccion(paquete, corrida.raw.response);
  assert.equal(control.ok, true);
  assert.equal(control.registros.length, 3);
  for (const f of paquete.fuentes) assert.ok(control.borrador.includes(f.url));
  assert.match(control.borrador, /producción no fue verificado/);
  assert.ok(corrida.raw.eval_count > 0);
});

for (const [nombre, salida] of [
  ['JSON incompleto', '{'], ['sin selección', {}], ['selección vacía', { items: [] }], ['null', null],
  ['referencia inventada', { items: [{ id: 'C99', estado: 'en_main' }] }],
  ['duplicado', { items: [seleccion.items[0], seleccion.items[0]] }],
  ['texto libre aunque cite una fuente válida', { items: [{ ...seleccion.items[0], texto: 'Ya está en producción' }] }],
  ['campo extra en raíz', { ...seleccion, mensaje: 'enviado' }],
  ['mezcla válida e inválida', { items: [seleccion.items[0], { id: 'C99', estado: 'en_main' }] }],
  ['escalamiento a producción', salidaConFallo(corrida.raw.response)],
]) test(`bloquea ${nombre} sin filtrar un borrador parcial`, () => {
  const control = controlarSeleccion(paquete, salida);
  assert.equal(control.ok, false);
  assert.equal(control.borrador, null);
  assert.deepEqual(control.registros, []);
  assert.ok(control.errores.length > 0);
});

test('no muta la grabación al inyectar el fallo', () => {
  const antes = JSON.stringify(seleccion);
  salidaConFallo(corrida.raw.response);
  assert.equal(JSON.stringify(seleccion), antes);
});

test('el estado debe coincidir también con el snapshot', () => {
  const otro = structuredClone(paquete);
  otro.fuentes[0].estado = 'desconocido';
  assert.equal(controlarSeleccion(otro, seleccion).borrador, null);
});
