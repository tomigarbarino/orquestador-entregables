// Primeros pasos: tres cosas para entender la herramienta sin que nadie la explique.
// 1) probar un entregable, 2) leer el borrador, 3) pedirle un cambio al chat.
// Lo que la persona ya hizo (ver el borrador, cerrar la tarjeta) se recuerda en este navegador.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useApp, useAccion } from '../estado.jsx';
import Boton from './Boton.jsx';
import { Icono, Check, Eye, MessageSquare, Play, X } from './Iconos.jsx';
import { entregableSugerido, nombreEntregable } from '../textos.js';

const CLAVE = 'orq-primeros-pasos';
const ANCHO_COMPLETO = 720;

// Mini almacén compartido (PrimerosPasos y el chat leen lo mismo).
let memoria = null;
const oyentes = new Set();

function leer() {
  if (memoria) return memoria;
  try {
    const v = JSON.parse(window.localStorage.getItem(CLAVE) || '{}');
    memoria = v && typeof v === 'object' ? { cerrado: Boolean(v.cerrado), vioBorrador: Boolean(v.vioBorrador) } : {};
  } catch {
    memoria = {};
  }
  memoria = { cerrado: false, vioBorrador: false, ...memoria };
  return memoria;
}

function escribir(cambios) {
  memoria = { ...leer(), ...cambios };
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify(memoria));
  } catch {
    // sin almacenamiento (ventana privada, sitio bloqueado): vale para esta visita
  }
  for (const fn of oyentes) fn();
}

function suscribir(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

// Para quien necesite re-renderizar cuando cambia (por ejemplo, el chat).
export function usePrimerosPasos() {
  return useSyncExternalStore(suscribir, leer, leer);
}

export function primerosPasosVisibles(s) {
  return s?.ui?.pagina === 'visualizador' && !leer().cerrado;
}

function enfocarBorrador() {
  const hoja = document.querySelector('.borrador');
  if (!hoja) return false;
  if (!hoja.hasAttribute('tabindex')) hoja.setAttribute('tabindex', '-1');
  const reducido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  hoja.scrollIntoView({ block: 'start', behavior: reducido ? 'auto' : 'smooth' });
  hoja.focus({ preventScroll: true });
  return true;
}

// Marca "vio el borrador" cuando la hoja se ve (la mitad, o media pantalla) durante 1 segundo.
function useVerBorrador(activo) {
  useEffect(() => {
    if (!activo || typeof IntersectionObserver === 'undefined') return undefined;
    let observada = null;
    let observador = null;
    let temporizador = null;
    const conectar = () => {
      const hoja = document.querySelector('.borrador');
      if (hoja === observada) return;
      observador?.disconnect();
      clearTimeout(temporizador);
      observada = hoja;
      if (!hoja) return;
      observador = new IntersectionObserver(
        ([e]) => {
          const alto = e.rootBounds?.height || window.innerHeight;
          const visible = e.isIntersecting && (e.intersectionRatio >= 0.5 || e.intersectionRect.height >= alto * 0.5);
          clearTimeout(temporizador);
          if (visible) temporizador = setTimeout(() => escribir({ vioBorrador: true }), 1000);
        },
        { threshold: [0, 0.25, 0.5, 0.75, 1] },
      );
      observador.observe(hoja);
    };
    conectar();
    const intervalo = setInterval(conectar, 1000);
    return () => {
      clearInterval(intervalo);
      clearTimeout(temporizador);
      observador?.disconnect();
    };
  }, [activo]);
}

function useAnchoContenedor() {
  const ref = useRef(null);
  const [ancho, setAncho] = useState(null);
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setAncho(e.contentRect.width));
    ro.observe(el);
    setAncho(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, ancho];
}

export default function PrimerosPasos({ compacto = false }) {
  const { s, acciones } = useApp();
  const guardado = usePrimerosPasos();
  const [ref, ancho] = useAnchoContenedor();
  const sugerido = entregableSugerido(s);
  const nombre = sugerido ? nombreEntregable(s, sugerido) : 'un entregable';
  const [probar, probando] = useAccion(async () => {
    if (sugerido) await acciones.probar(sugerido);
  });

  const pidioCambio = Boolean(s.chat?.conv?.mensajes?.some((m) => m.rol === 'persona'));
  // Los pasos se cumplen en orden: si ya le pidió un cambio al chat, el borrador cuenta como leído.
  const hechos = [
    (s.listaCorridas?.length || 0) > 0,
    guardado.vioBorrador || pidioCambio,
    pidioCambio,
  ];
  const actual = hechos.findIndex((h) => !h);
  const visible = primerosPasosVisibles(s);
  useVerBorrador(visible && !guardado.vioBorrador);

  const verBorrador = useCallback(() => {
    escribir({ vioBorrador: true });
    if (enfocarBorrador()) return;
    const ultima = s.listaCorridas?.[0]?.entregable;
    if (!ultima) return;
    acciones.ui({ vista: 'entregable', entregable: ultima });
    let intentos = 0;
    const buscar = () => {
      if (enfocarBorrador() || intentos++ > 20) return;
      setTimeout(buscar, 100);
    };
    setTimeout(buscar, 50);
  }, [s.listaCorridas, acciones]);

  const escribirle = () => acciones.escribirEnChat('Que el guion sea más corto', { reemplazar: true });

  if (!visible) return <span ref={ref} hidden />;

  const cerrar = (
    <Boton soloIcono chico icono={X} variante="texto" className="pp-cerrar" onClick={() => escribir({ cerrado: true })}>
      Ocultar primeros pasos
    </Boton>
  );
  const iniciando = Boolean(sugerido && s.ui.iniciando?.[sugerido]) || probando;
  const esCompacto = compacto || (ancho !== null && ancho < ANCHO_COMPLETO);

  if (actual === -1) {
    return (
      <section ref={ref} className="primeros-pasos primeros-pasos-compacto" aria-label="Primeros pasos">
        <span className="pp-linea primeros-pasos-listo">
          <Icono de={Check} />
          <b>Listo: ya sabés lo básico.</b>
        </span>
        {cerrar}
      </section>
    );
  }

  if (esCompacto) {
    // En la vista por entregable el botón para probar está en la cabecera; en Inicio, no.
    const frases = [
      compacto ? 'probá el entregable con el botón de arriba; sale como borrador y no se manda nada.' : `probá ${nombre}: sale como borrador y no se manda nada.`,
      'leé el borrador y fijate qué quedó afuera por falta de evidencia.',
      'pedile un cambio al chat, por ejemplo «que el guion sea más corto».',
    ];
    const accion = [
      compacto || !sugerido ? null : (
        <Boton key="probar" variante="texto" chico icono={Play} enCurso={iniciando} textoEnCurso="Iniciando…" onClick={probar}>
          {`Probar ${nombre}`}
        </Boton>
      ),
      <Boton key="ver" variante="texto" chico icono={Eye} onClick={verBorrador}>Ver el borrador</Boton>,
      <Boton key="chat" variante="texto" chico icono={MessageSquare} onClick={escribirle}>Escribirle al chat</Boton>,
    ][actual];
    const linea = `Primeros pasos · Paso ${actual + 1} de 3: ${frases[actual]}`;
    return (
      <section ref={ref} className="primeros-pasos primeros-pasos-compacto" aria-label="Primeros pasos">
        <span className="pp-linea" title={linea}>
          <b>Primeros pasos · Paso {actual + 1} de 3:</b> {frases[actual]}
        </span>
        {accion}
        {cerrar}
      </section>
    );
  }

  const pasos = [
    {
      titulo: 'Probá un entregable',
      texto: `Probá ${nombre}: sale como borrador y no se manda nada.`,
      accion: (
        <Boton variante="primario" chico icono={Play} enCurso={iniciando} textoEnCurso="Iniciando…" onClick={probar}>
          {`Probar ${nombre} ahora`}
        </Boton>
      ),
    },
    {
      titulo: 'Leé el borrador',
      texto: 'Leé el borrador y fijate qué quedó afuera por falta de evidencia.',
      accion: <Boton variante="primario" chico icono={Eye} onClick={verBorrador}>Ver el borrador</Boton>,
    },
    {
      titulo: 'Pedile un cambio',
      texto: 'Pedile un cambio al chat, por ejemplo «que el guion sea más corto». Antes de aplicarlo vas a ver qué cambia en el mapa.',
      accion: <Boton variante="primario" chico icono={MessageSquare} onClick={escribirle}>Escribirle al chat</Boton>,
    },
  ];

  return (
    <section ref={ref} className="primeros-pasos primeros-pasos-completo" aria-labelledby="pp-titulo">
      <h2 id="pp-titulo">Empezá por acá</h2>
      {cerrar}
      <ol className="primeros-pasos-lista">
        {pasos.map((p, i) => {
          const hecho = hechos[i];
          const esActual = i === actual;
          return (
            <li key={p.titulo} className={`paso-inicial ${hecho ? 'hecho' : ''} ${esActual ? 'actual' : ''}`} aria-current={esActual ? 'step' : undefined}>
              <p className="paso-inicial-texto">
                <span className="paso-numero" aria-hidden="true">{hecho ? <Icono de={Check} tam={12} /> : i + 1}</span>
                <span>{esActual ? p.texto : p.titulo}</span>
              </p>
              {hecho && (
                <span className="paso-hecho">
                  <Icono de={Check} />
                  Hecho
                </span>
              )}
              {esActual && p.accion}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
