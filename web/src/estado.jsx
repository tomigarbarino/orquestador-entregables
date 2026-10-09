// Estado de la interfaz: lo que manda el servidor más lo que se está mirando y editando.
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { api, escucharEventos } from './api.js';
import { crearValidadores } from '@lib/validar.mjs';
import { entregableDePropuesta, nombreEntregable, plural } from './textos.js';

const Contexto = createContext(null);

export const CAMPOS_PERFIL = ['persona', 'idioma', 'zona_horaria', 'proyectos', 'personas', 'clientes', 'glosario', 'reglas_redaccion', 'marca', 'origen_tareas'];

function chatAbiertoInicial() {
  try {
    return typeof window === 'undefined' || !window.matchMedia ? true : window.matchMedia('(min-width: 901px)').matches;
  } catch {
    return true;
  }
}

const inicial = {
  cargado: false,
  errorCarga: null,
  conexion: 'ok',
  anuncio: '',
  corridas: {},
  listaCorridas: [],
  propuestas: [],
  avisos: [],
  borradores: {},
  ui: {
    pagina: 'visualizador',
    vista: 'general',
    entregable: null,
    entregableEnFoco: null,
    nodo: null,
    propuestaEnFoco: null,
    corridaPorEntregable: {},
    iniciando: {},
    chatAbierto: chatAbiertoInicial(),
  },
  chat: { conv: null, respondiendo: false, parcial: '', herramientas: [], entrada: '' },
};

// Igualdad profunda sin importar el orden de las claves.
export function iguales(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return a !== a && b !== b; // NaN
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => iguales(x, b[i]));
  }
  const ka = Object.keys(a).filter((k) => a[k] !== undefined);
  const kb = Object.keys(b).filter((k) => b[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && iguales(a[k], b[k]));
}

export function hayBorrador(s, prefijo) {
  return Object.keys(s?.borradores || {}).some((k) => k === prefijo || k.startsWith(prefijo));
}

function ultimaPorEntregable(lista) {
  const salida = {};
  for (const m of lista) if (!salida[m.entregable] || salida[m.entregable] < m.id) salida[m.entregable] = m.id;
  return salida;
}

function sinAvisosOkSueltos(avisos) {
  return avisos.filter((x) => !(x.nivel === 'ok' && !x.accion));
}

// Qué hacer cuando Claude terminó de responder con una propuesta (C7).
function enfocarPropuesta(s, id, entregable) {
  const pagina = s.ui.pagina;
  if (pagina === 'asistente') return { ...s, ui: { ...s.ui, propuestaEnFoco: id } };
  if (['visualizador', 'entregables', 'historial'].includes(pagina)) {
    return {
      ...s,
      avisos: sinAvisosOkSueltos(s.avisos),
      ui: {
        ...s.ui,
        pagina: 'visualizador',
        vista: entregable ? 'entregable' : 'general',
        entregable: entregable || s.ui.entregable,
        nodo: pagina === 'visualizador' ? s.ui.nodo : null,
        entregableEnFoco: null,
        propuestaEnFoco: id,
      },
    };
  }
  return { ...s, ui: { ...s.ui, propuestaEnFoco: id } };
}

function reductor(s, a) {
  switch (a.tipo) {
    case 'cargar': {
      const { corridas: lista, ...resto } = a.datos;
      const entregables = Object.keys(resto.config?.entregables || {});
      return {
        ...s,
        ...resto,
        cargado: true,
        errorCarga: null,
        listaCorridas: lista,
        ui: { ...s.ui, entregable: s.ui.entregable || entregables[0] || null, corridaPorEntregable: ultimaPorEntregable(lista) },
      };
    }
    case 'errorCarga':
      return { ...s, errorCarga: a.mensaje };
    case 'reintentarCarga':
      return { ...s, errorCarga: null };
    case 'conexion':
      return s.conexion === a.valor ? s : { ...s, conexion: a.valor };
    case 'anuncio':
      return { ...s, anuncio: a.texto === s.anuncio ? `${a.texto} ` : a.texto };
    case 'espacio':
      return { ...s, ...a.datos };
    case 'corrida': {
      const c = a.datos;
      if (!c?.meta) return s;
      const lista = [c.meta, ...s.listaCorridas.filter((m) => m.id !== c.meta.id)].sort((x, y) => y.id.localeCompare(x.id));
      return {
        ...s,
        corridas: { ...s.corridas, [c.meta.id]: c },
        listaCorridas: lista,
        ui: { ...s.ui, corridaPorEntregable: ultimaPorEntregable(lista) },
      };
    }
    case 'propuestas':
      return { ...s, propuestas: a.datos };
    case 'ui':
      return { ...s, ui: { ...s.ui, ...a.datos } };
    case 'ir':
      return {
        ...s,
        avisos: sinAvisosOkSueltos(s.avisos),
        ui: { ...s.ui, nodo: null, entregableEnFoco: null, ...a.datos },
      };
    case 'iniciando': {
      const iniciando = { ...s.ui.iniciando };
      if (a.valor) iniciando[a.id] = true;
      else delete iniciando[a.id];
      return { ...s, ui: { ...s.ui, iniciando } };
    }
    case 'borrador': {
      const borradores = { ...s.borradores };
      const previo = borradores[a.clave];
      const valorPrevio = previo ? previo.valor : a.original;
      const valor = typeof a.valor === 'function' ? a.valor(valorPrevio) : a.valor;
      if (valor === null || valor === undefined || (a.original !== undefined && iguales(valor, a.original))) delete borradores[a.clave];
      else borradores[a.clave] = { valor, base: previo ? previo.base : a.base !== undefined ? a.base : a.original };
      return { ...s, borradores };
    }
    case 'chat':
      return { ...s, chat: { ...s.chat, ...a.datos } };
    case 'escribirChat': {
      const actual = s.chat.entrada || '';
      let entrada = actual;
      if (a.reemplazar) entrada = a.texto;
      else if (a.texto) entrada = actual.trim() ? `${actual.replace(/\s+$/, '')}\n${a.texto}` : a.texto;
      return { ...s, chat: { ...s.chat, entrada }, ui: { ...s.ui, chatAbierto: true } };
    }
    case 'chatEvento': {
      const e = a.datos;
      if (!s.chat.conv || e.id !== s.chat.conv.id) return s;
      if (e.tipo === 'delta') return { ...s, chat: { ...s.chat, parcial: s.chat.parcial + e.texto } };
      if (e.tipo === 'herramienta') return { ...s, chat: { ...s.chat, herramientas: [...s.chat.herramientas, e.nombre] } };
      if (e.tipo === 'fin') {
        return {
          ...s,
          chat: { ...s.chat, respondiendo: false, parcial: '', herramientas: [], conv: { ...s.chat.conv, mensajes: [...s.chat.conv.mensajes, e.mensaje] } },
        };
      }
      return s;
    }
    case 'propuestaRecibida':
      return enfocarPropuesta(s, a.id, a.entregable);
    case 'aviso':
      return { ...s, avisos: [...s.avisos, a.datos].slice(-4) };
    case 'cerrarAviso':
      return { ...s, avisos: s.avisos.filter((x) => x.id !== a.id) };
    default:
      return s;
  }
}

function enfocarTitulo() {
  // Después del render: el h1 de la página recibe el foco, sin mover el scroll.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const h1 = document.querySelector('.principal h1');
      if (!h1) {
        document.querySelector('.principal')?.focus({ preventScroll: true });
        return;
      }
      if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1');
      h1.focus({ preventScroll: true });
    });
  });
}

function enfocarEntradaChat() {
  setTimeout(() => {
    const t = document.getElementById('entrada-chat');
    if (!t) return;
    t.focus();
    try {
      const fin = t.value.length;
      t.setSelectionRange(fin, fin);
    } catch {
      // algunos navegadores no dejan mover el cursor
    }
  }, 60);
}

export function ProveedorEstado({ children }) {
  const [s, d] = useReducer(reductor, inicial);
  const sRef = useRef(s);
  sRef.current = s;
  const accionesRef = useRef(null);
  const iniciandoRef = useRef(new Set());

  const anunciar = useCallback((texto) => d({ tipo: 'anuncio', texto }), []);

  const avisar = useCallback((texto, nivel = 'error', opciones = {}) => {
    const accion = opciones?.accion || null;
    const ultimo = sRef.current.avisos.at(-1);
    if (ultimo && ultimo.texto === texto && ultimo.nivel === nivel) return;
    const id = Date.now() + Math.random();
    d({ tipo: 'aviso', datos: { id, texto, nivel, accion } });
    if (nivel === 'ok' && !accion) setTimeout(() => d({ tipo: 'cerrarAviso', id }), 5000);
  }, []);

  const cargar = useCallback(async () => {
    try {
      d({ tipo: 'cargar', datos: await api('/estado') });
      return true;
    } catch (e) {
      if (!sRef.current.cargado) d({ tipo: 'errorCarga', mensaje: e.message });
      return false;
    }
  }, []);

  // Una propuesta que llegó del chat: se ubica en el mapa sin mover el foco.
  const recibirPropuesta = useCallback(async (id) => {
    let p = sRef.current.propuestas.find((x) => x.id === id);
    if (!p) {
      try {
        const lista = await api('/propuestas');
        d({ tipo: 'propuestas', datos: lista });
        p = lista.find((x) => x.id === id);
      } catch {
        // si falla, se muestra igual en la vista general
      }
    }
    const actual = sRef.current;
    const entregable = entregableDePropuesta(p, actual);
    d({ tipo: 'propuestaRecibida', id, entregable });
    if (!['visualizador', 'entregables', 'historial', 'asistente'].includes(actual.ui.pagina)) {
      avisar('Claude te propone un cambio. Revisalo en el mapa antes de aplicarlo.', 'propuesta', {
        accion: {
          texto: 'Ver en el flujo',
          alHacer: () => accionesRef.current?.ir('visualizador', { vista: entregable ? 'entregable' : 'general', ...(entregable ? { entregable } : {}), propuestaEnFoco: id }, { foco: false }),
        },
      });
    }
  }, [avisar]);

  useEffect(() => {
    let cortada = false;
    cargar();
    api('/chat').then((conv) => d({ tipo: 'chat', datos: { conv } })).catch(() => {});
    return escucharEventos(
      {
        espacio: (datos) => d({ tipo: 'espacio', datos }),
        corrida: (datos) => d({ tipo: 'corrida', datos }),
        propuestas: (datos) => d({ tipo: 'propuestas', datos }),
        chat: (datos) => {
          d({ tipo: 'chatEvento', datos });
          const conv = sRef.current.chat.conv;
          if (datos.tipo !== 'fin' || !conv || datos.id !== conv.id) return;
          const nueva = datos.mensaje?.propuestas?.at(-1);
          // La respuesta la lee la región de registro del chat; acá solo se avisa si hay propuesta.
          if (nueva) anunciar('Claude propone un cambio. Revisalo en el mapa antes de aplicarlo.');
          if (nueva) recibirPropuesta(nueva);
        },
      },
      {
        onError: () => {
          cortada = true;
          d({ tipo: 'conexion', valor: 'cortada' });
        },
        onOpen: () => {
          if (!cortada) return;
          cortada = false;
          cargar().then(() => d({ tipo: 'conexion', valor: 'ok' }));
          api('/propuestas').then((datos) => d({ tipo: 'propuestas', datos })).catch(() => {});
        },
      },
    );
  }, [cargar, anunciar, recibirPropuesta]);

  // Anuncios de las pruebas: uno al arrancar y uno al terminar. Nunca el texto que llega de a poco.
  const estadosVistos = useRef(null);
  useEffect(() => {
    if (!s.cargado) return;
    if (!estadosVistos.current) {
      estadosVistos.current = new Map(s.listaCorridas.map((m) => [m.id, m.estado]));
      return;
    }
    for (const m of s.listaCorridas) {
      const antes = estadosVistos.current.get(m.id);
      if (antes === m.estado) continue;
      estadosVistos.current.set(m.id, m.estado);
      const nombre = nombreEntregable(s, m.entregable);
      if (m.estado === 'en_curso' && antes === undefined) anunciar(`Probando ${nombre} en modo borrador`);
      else if (m.estado === 'lista') {
        const c = s.corridas[m.id];
        const n = m.control?.aceptados ?? c?.evidencia?.items?.length ?? 0;
        const mm = c?.evidencia?.descartados?.length ?? m.control?.rechazados ?? 0;
        anunciar(`Borrador listo: ${n} ${plural(n, 'afirmación', 'afirmaciones')} con respaldo, ${mm} ${plural(mm, 'quedó afuera', 'quedaron afuera')}. No se mandó nada.`);
      } else if (m.estado === 'error') anunciar(`La prueba falló: ${m.error || 'revisá el detalle en el borrador.'}`);
    }
  }, [s.listaCorridas, s.cargado]); // eslint-disable-line react-hooks/exhaustive-deps

  // Si hay cambios sin guardar (y no es la demo), el navegador pregunta antes de cerrar.
  const hayCambios = Object.keys(s.borradores).length > 0;
  useEffect(() => {
    if (!hayCambios || s.demo) return undefined;
    const alSalir = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', alSalir);
    return () => window.removeEventListener('beforeunload', alSalir);
  }, [hayCambios, s.demo]);

  const acciones = useMemo(() => {
    const a = {
      ir(pagina, extra = {}, { foco = true } = {}) {
        d({ tipo: 'ir', datos: { pagina, ...extra } });
        if (foco) enfocarTitulo();
      },
      ui(datos) {
        d({ tipo: 'ui', datos });
      },
      // Cambia Inicio a la vista Por entregable (desde el mapa general o La semana). El nodo o el
      // botón que se tocó desaparece, así que el foco va al h1 (que pasa a ser el nombre).
      verEntregable(entregable) {
        d({ tipo: 'ui', datos: { vista: 'entregable', entregable, nodo: null } });
        document.querySelector('.principal')?.scrollTo({ top: 0 });
        enfocarTitulo();
      },
      // Después de una acción que hace desaparecer el control que tenía el foco.
      enfocarTitulo() {
        enfocarTitulo();
      },
      recargar: cargar,
      reintentarCarga() {
        d({ tipo: 'reintentarCarga' });
        return cargar();
      },
      async probar(entregable) {
        // Sin reentrada: un doble clic crea una sola prueba.
        if (!entregable || iniciandoRef.current.has(entregable)) return false;
        iniciandoRef.current.add(entregable);
        d({ tipo: 'iniciando', id: entregable, valor: true });
        try {
          const { id } = await api('/corridas', { metodo: 'POST', cuerpo: { entregable } });
          d({ tipo: 'ir', datos: { pagina: 'visualizador', vista: 'entregable', entregable, propuestaEnFoco: null } });
          const c = await api(`/corridas/${id}`);
          d({ tipo: 'corrida', datos: c });
          return true;
        } catch (e) {
          avisar(e.message);
          return false;
        } finally {
          iniciandoRef.current.delete(entregable);
          d({ tipo: 'iniciando', id: entregable, valor: false });
        }
      },
      async cancelarCorrida(id) {
        if (!window.confirm('¿Cortar esta prueba? El borrador no se va a generar.')) return false;
        try {
          await api(`/corridas/${id}/cancelar`, { metodo: 'POST' });
          return true;
        } catch (e) {
          avisar(e.message);
          return false;
        }
      },
      async cargarCorrida(id) {
        try {
          d({ tipo: 'corrida', datos: await api(`/corridas/${id}`) });
        } catch (e) {
          avisar(e.message);
        }
      },
      async guardarConfig(config, motivo) {
        try {
          const r = await api('/config', { metodo: 'PUT', cuerpo: { config, motivo } });
          d({ tipo: 'espacio', datos: r });
          avisar('Guardado. Quedó en el historial.', 'ok');
          return true;
        } catch (e) {
          avisar(e.message);
          return false;
        }
      },
      async importarConfig(yaml) {
        try {
          const r = await api('/config/importar', { metodo: 'POST', cuerpo: { yaml } });
          d({ tipo: 'espacio', datos: r });
          avisar('Configuración importada.', 'ok');
          return true;
        } catch (e) {
          avisar(e.message);
          return false;
        }
      },
      async exportarEquipo() {
        try {
          return await api('/equipo/exportar');
        } catch (e) {
          avisar(e.message);
          return null;
        }
      },
      async importarEquipo(yaml) {
        try {
          const r = await api('/equipo/importar', { metodo: 'POST', cuerpo: { yaml } });
          d({ tipo: 'espacio', datos: r });
          avisar('Ahora usás la configuración de tu equipo. Quedó en el historial.', 'ok');
          return true;
        } catch (e) {
          avisar(e.message);
          return false;
        }
      },
      async refrescarConectores() {
        try {
          await api('/conectores?refrescar=1');
          avisar('Conectores revisados.', 'ok');
        } catch (e) {
          avisar(e.message);
        }
      },
      async modulo(clave, activo) {
        try {
          d({ tipo: 'espacio', datos: await api(`/modulos/${clave}`, { metodo: 'POST', cuerpo: { activo } }) });
        } catch (e) {
          avisar(e.message);
        }
      },
      async aplicarPropuesta(id) {
        try {
          await api(`/propuestas/${id}/aplicar`, { metodo: 'POST' });
          d({ tipo: 'propuestas', datos: await api('/propuestas') });
          d({ tipo: 'ui', datos: { propuestaEnFoco: null } });
          avisar('Cambio aplicado. Podés deshacerlo desde el historial.', 'ok');
          return true;
        } catch (e) {
          avisar(e.message);
          return false;
        }
      },
      async descartarPropuesta(id, { confirmar = true } = {}) {
        if (confirmar && !window.confirm('¿Descartar esta propuesta? No se puede recuperar.')) return false;
        try {
          await api(`/propuestas/${id}/descartar`, { metodo: 'POST' });
          d({ tipo: 'propuestas', datos: await api('/propuestas') });
          if (sRef.current.ui.propuestaEnFoco === id) d({ tipo: 'ui', datos: { propuestaEnFoco: null } });
          return true;
        } catch (e) {
          avisar(e.message);
          return false;
        }
      },
      escribirEnChat(texto = '', { reemplazar = false } = {}) {
        d({ tipo: 'escribirChat', texto, reemplazar });
        enfocarEntradaChat();
      },
      async nuevoChat() {
        try {
          d({ tipo: 'chat', datos: { conv: await api('/chat/nueva', { metodo: 'POST' }), parcial: '', herramientas: [], respondiendo: false } });
          return true;
        } catch (e) {
          avisar(e.message);
          return false;
        }
      },
      cerrarAviso(id) {
        d({ tipo: 'cerrarAviso', id });
      },
      avisar,
      anunciar,
    };
    return a;
  }, [avisar, anunciar, cargar]);
  accionesRef.current = acciones;

  const validadores = useMemo(() => (s.esquemas ? crearValidadores(s.esquemas) : null), [s.esquemas]);

  return <Contexto.Provider value={{ s, d, acciones, validadores }}>{children}</Contexto.Provider>;
}

export function useApp() {
  return useContext(Contexto);
}

// Acción asincrónica sin reentrada: [correr, enCurso].
export function useAccion(fn) {
  const [enCurso, setEnCurso] = useState(false);
  const corriendo = useRef(false);
  const montado = useRef(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);
  const correr = useCallback(async (...args) => {
    if (corriendo.current) return undefined;
    corriendo.current = true;
    setEnCurso(true);
    try {
      return await fnRef.current?.(...args);
    } finally {
      corriendo.current = false;
      if (montado.current) setEnCurso(false);
    }
  }, []);
  return [correr, enCurso];
}

function esObjeto(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

// Borrador de un formulario que sobrevive a cambiar de página y se mezcla con lo que cambió
// mientras tanto (por ejemplo, un cambio del chat aplicado). `original` tiene que llegar memoizado.
export function useBorrador(clave, original) {
  const { s, d } = useApp();
  const b = s.borradores[clave];
  const valor = b ? b.valor : original;

  const originalRef = useRef(original);
  originalRef.current = original;

  const setValor = useCallback((v) => {
    d({ tipo: 'borrador', clave, valor: v, original: originalRef.current });
  }, [d, clave]);

  // Si lo que hay guardado quedó igual a lo editado, el borrador se va solo.
  useEffect(() => {
    if (b && iguales(b.valor, original)) d({ tipo: 'borrador', clave, valor: null });
  }, [b, original, clave, d]);

  const info = useMemo(() => {
    const base = b ? b.base : original;
    const desactualizado = Boolean(b) && !iguales(base, original);
    let conflictos = [];
    if (b && desactualizado && esObjeto(b.valor) && esObjeto(base) && esObjeto(original)) {
      const claves = new Set([...Object.keys(b.valor), ...Object.keys(base), ...Object.keys(original)]);
      conflictos = [...claves].filter(
        (k) => !iguales(b.valor[k], base[k]) && !iguales(original[k], base[k]) && !iguales(b.valor[k], original[k]),
      );
    }
    const paraGuardar = () => {
      if (!b) return original;
      if (!esObjeto(b.valor) || !esObjeto(base)) return b.valor;
      const actual = esObjeto(original) ? original : {};
      const salida = {};
      const claves = new Set([...Object.keys(b.valor), ...Object.keys(base), ...Object.keys(actual)]);
      for (const k of claves) {
        const v = !iguales(b.valor[k], base[k]) ? b.valor[k] : actual[k];
        if (v !== undefined) salida[k] = v;
      }
      return salida;
    };
    const descartar = () => d({ tipo: 'borrador', clave, valor: null });
    return { cambiado: Boolean(b), desactualizado, conflictos, paraGuardar, descartar };
  }, [b, original, clave, d]);

  return [valor, setValor, info];
}

// Estado del chat que hace falta para mandar un mensaje con contexto de pantalla.
export function pantallaActual(s) {
  const entregable = s.ui.vista === 'entregable' || s.ui.pagina !== 'visualizador' ? s.ui.entregable : null;
  const idCorrida = entregable ? s.ui.corridaPorEntregable[entregable] : null;
  const corrida = idCorrida ? s.corridas[idCorrida] : null;
  const enMapa = s.ui.pagina === 'visualizador';
  return {
    entregable,
    nodo: enMapa ? s.ui.nodo?.id : undefined,
    nodoTitulo: enMapa ? s.ui.nodo?.data?.titulo : undefined,
    modo: s.ui.pagina === 'asistente' ? 'asistente de entregable nuevo' : undefined,
    borrador: corrida?.borrador || undefined,
  };
}
