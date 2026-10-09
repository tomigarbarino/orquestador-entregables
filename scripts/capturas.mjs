#!/usr/bin/env node
// Saca las capturas del README con el modo demo (datos ficticios), usando el Chrome o el
// Edge que ya tenés instalado. Las guarda en docs/capturas/.
//   node scripts/capturas.mjs
// Variables opcionales (útiles para revisar la interfaz):
//   ORQ_CAPTURAS_SALIDA=carpeta  ORQ_CAPTURAS_PUERTO=4320  ORQ_CAPTURAS_ANCHO=390
//   ORQ_CAPTURAS_ALTO=844  ORQ_CAPTURAS_TEMA=dark
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { RAIZ } from '../lib/rutas.mjs';

const PUERTO = Number(process.env.ORQ_CAPTURAS_PUERTO || 4319);
const URL_BASE = `http://127.0.0.1:${PUERTO}`;
const SALIDA = path.resolve(process.env.ORQ_CAPTURAS_SALIDA || path.join(RAIZ, 'docs', 'capturas'));
const ANCHO = Number(process.env.ORQ_CAPTURAS_ANCHO || 1480);
const ALTO = Number(process.env.ORQ_CAPTURAS_ALTO || 900);
const TEMA = process.env.ORQ_CAPTURAS_TEMA === 'dark' ? 'dark' : 'light';
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function navegador() {
  const candidatos = [
    process.env.ORQ_NAVEGADOR,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  const encontrado = candidatos.find((c) => fs.existsSync(c));
  if (!encontrado) throw new Error('No encontré Chrome ni Edge. Indicá la ruta con la variable ORQ_NAVEGADOR.');
  return encontrado;
}

async function levantarDemo() {
  const espacio = path.join(os.tmpdir(), `orquestador-capturas-${PUERTO}-${Date.now()}`);
  const proceso = spawn(process.execPath, [path.join(RAIZ, 'servidor', 'index.mjs'), '--demo', '--no-abrir', '--puerto', String(PUERTO)], {
    env: { ...process.env, ORQ_ESPACIO: espacio, ORQ_DEMO_PAUSA: '650' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${URL_BASE}/api/estado`);
      if (r.ok) return { proceso, espacio };
    } catch {
      // todavía no levantó
    }
    await esperar(500);
  }
  proceso.kill();
  throw new Error('La interfaz demo no levantó');
}

async function clic(pagina, texto) {
  await pagina.locator(`::-p-text(${texto})`).click();
}

async function captura(pagina, nombre) {
  await esperar(400);
  await pagina.screenshot({ path: path.join(SALIDA, `${nombre}.png`) });
  console.log(`  ${nombre}.png`);
}

fs.mkdirSync(SALIDA, { recursive: true });
const { proceso, espacio } = await levantarDemo();
const browser = await puppeteer.launch({
  executablePath: navegador(),
  headless: true,
  defaultViewport: { width: ANCHO, height: ALTO, deviceScaleFactor: 1 },
  args: ['--no-first-run', '--no-default-browser-check'],
});
try {
  const pagina = await browser.newPage();
  await pagina.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: TEMA }]);
  await pagina.goto(URL_BASE, { waitUntil: 'domcontentloaded' });
  await pagina.waitForSelector('.react-flow__node', { timeout: 60_000 });
  await esperar(1500);
  console.log(`Capturas en ${SALIDA}:`);
  await captura(pagina, '01-visualizador-general');

  await clic(pagina, 'Por entregable');
  await pagina.waitForSelector('.nodo-control');
  await clic(pagina, 'Probar ahora');
  await esperar(4200);
  await captura(pagina, '02-visualizador-corriendo');
  await pagina.waitForFunction(() => document.body.innerText.includes('Borrador listo'), { timeout: 60_000 });
  await captura(pagina, '03-visualizador-resultado');
  await pagina.evaluate(() => document.querySelector('.principal').scrollTo(0, 10_000));
  await captura(pagina, '04-borrador');
  await pagina.evaluate(() => document.querySelector('.principal').scrollTo(0, 0));

  await pagina.click('#entrada-chat');
  await pagina.type('#entrada-chat', 'Sumá los tickets de Jira a la daily');
  await pagina.keyboard.press('Enter');
  await pagina.waitForSelector('.banner-propuesta', { timeout: 30_000 });
  await esperar(800);
  await captura(pagina, '05-cambio-propuesto');

  await clic(pagina, 'Nuevo entregable');
  await pagina.waitForSelector('.pasos-asistente');
  await pagina.type('input[placeholder="Resumen semanal para clientes"]', 'Resumen semanal para clientes');
  await pagina.type('input[placeholder^="Un mail de los viernes"]', 'Un mail de los viernes para cada cliente con lo que avanzó su proyecto');
  await clic(pagina, 'Siguiente');
  await pagina.evaluate(() => {
    for (const nombre of ['GitHub', 'Calendario']) {
      const etiqueta = [...document.querySelectorAll('.fuente-opcion label')].find((l) => l.innerText.includes(nombre));
      etiqueta?.querySelector('input')?.click();
    }
  });
  await esperar(300);
  const entradas = await pagina.$$('.fuente-opcion.elegida input.ancho');
  if (entradas[0]) await entradas[0].type('PRs mergeados a main en la semana');
  if (entradas[1]) await entradas[1].type('Reuniones con cada cliente');
  await captura(pagina, '06-asistente');

  await clic(pagina, 'Conectores');
  await pagina.waitForSelector('.tabla');
  await captura(pagina, '07-conectores');

  await clic(pagina, 'Entregables');
  await pagina.waitForSelector('.tarjeta');
  await captura(pagina, '08-entregables');
} finally {
  await browser.close();
  proceso.kill();
  fs.rmSync(espacio, { recursive: true, force: true });
}
