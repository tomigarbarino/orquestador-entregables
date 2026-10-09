// Estado de la interfaz: lo que manda el servidor más lo que se está mirando.
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import { api, escucharEventos } from './api.js';
import { crearValidadores } from '@lib/validar.mjs';

const Contexto = createContext(null);

const inicial = {
  cargado: false,
  errorCarga: null,
  corridas: {},
  listaCorridas: [],
  propuestas: [],
  avisos: [],
  ui: {
    pagina: 'visualizador',
    vista: 'general',
    entregable: null,
    nodo: null,
    propuestaEnFoco: null,
    corridaPorEntregable: {},
    chatAbierto: true,
  },
  chat: { conv: null, respondiendo: false, parcial: '', herramientas: [], entrada: '' },
};

function ultimaPorEntregable(lista) {
  const salida = {};
  for (const m of lista) if (!salida[m.entregable] || salida[m.entregable] < m.id) salida[m.entregable] = m.id;
  return salida;
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
        listaCorridas: lista,
        ui: { ...s.ui, entregable: s.ui.entregable || entregables[0] || null, corridaPorEntregable: ultimaPorEntregable(lista) },
      };
    }
    case 'errorCarga':
      return { ...s, errorCarga: a.mensaje };
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
    case 'chat':
      return { ...s, chat: { ...s.chat, ...a.datos } };
    case 'chatEvento': {
      const e = a.datos;
      if (!s.chat.conv || e.id !== s.chat.conv.id) return s;
      if (e.tipo === 'delta') return { ...s, chat: { ...s.chat, parcial: s.chat.parcial + e.texto } };
      if (e.tipo === 'herramienta') return { ...s, chat: { ...s.chat, herramientas: [...s.chat.herramientas, e.nombre] } };
      if (e.tipo === 'fin') {
        // Si Claude propuso un cambio, el visualizador lo muestra enseguida, antes de aplicarlo.
        const nueva = e.mensaje.propuestas?.at(-1);
        return {
          ...s,
          ui: nueva ? { ...s.ui, pagina: s.ui.pagina === 'asistente' ? 'asistente' : 'visualizador', propuestaEnFoco: nueva } : s.ui,
          chat: { ...s.chat, respondiendo: false, parcial: '', herramientas: [], conv: { ...s.chat.conv, mensajes: [...s.chat.conv.mensajes, e.mensaje] } },
        };
      }
      return s;
    }
    case 'aviso':
      return { ...s, avisos: [...s.avisos, { id: Date.now() + Math.random(), ...a.datos }].slice(-4) };
    case 'cerrarAviso':
      return { ...s, avisos: s.avisos.filter((x) => x.id !== a.id) };
    default:
      return s;
  }
}

export function ProveedorEstado({ children }) {
  const [s, d] = useReducer(reductor, inicial);

  useEffect(() => {
    api('/estado').then((datos) => d({ tipo: 'cargar', datos })).catch((e) => d({ tipo: 'errorCarga', mensaje: e.message }));
    api('/chat').then((conv) => d({ tipo: 'chat', datos: { conv } })).catch(() => {});
    return escucharEventos({
      espacio: (datos) => d({ tipo: 'espacio', datos }),
      corrida: (datos) => d({ tipo: 'corrida', datos }),
      propuestas: (datos) => d({ tipo: 'propuestas', datos }),
      chat: (datos) => d({ tipo: 'chatEvento', datos }),
    });
  }, []);

  const avisar = useCallback((texto, nivel = 'error') => {
    const aviso = { texto, nivel };
    d({ tipo: 'aviso', datos: aviso });
  }, []);

  const acciones = useMemo(() => ({
    ir(pagina, extra = {}) {
      d({ tipo: 'ui', datos: { pagina, ...extra } });
    },
    ui(datos) {
      d({ tipo: 'ui', datos });
    },
    async probar(entregable) {
      try {
        const { id } = await api('/corridas', { metodo: 'POST', cuerpo: { entregable } });
        d({ tipo: 'ui', datos: { pagina: 'visualizador', vista: 'entregable', entregable, propuestaEnFoco: null } });
        const c = await api(`/corridas/${id}`);
        d({ tipo: 'corrida', datos: c });
      } catch (e) {
        avisar(e.message);
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
    async descartarPropuesta(id) {
      try {
        await api(`/propuestas/${id}/descartar`, { metodo: 'POST' });
        d({ tipo: 'propuestas', datos: await api('/propuestas') });
        d({ tipo: 'ui', datos: { propuestaEnFoco: null } });
      } catch (e) {
        avisar(e.message);
      }
    },
    escribirEnChat(texto) {
      d({ tipo: 'chat', datos: { entrada: texto } });
      d({ tipo: 'ui', datos: { chatAbierto: true } });
      setTimeout(() => document.getElementById('entrada-chat')?.focus(), 50);
    },
    async nuevoChat() {
      d({ tipo: 'chat', datos: { conv: await api('/chat/nueva', { metodo: 'POST' }), parcial: '', herramientas: [], respondiendo: false } });
    },
    avisar,
  }), [avisar]);

  const validadores = useMemo(() => (s.esquemas ? crearValidadores(s.esquemas) : null), [s.esquemas]);

  return <Contexto.Provider value={{ s, d, acciones, validadores }}>{children}</Contexto.Provider>;
}

export function useApp() {
  return useContext(Contexto);
}

// Estado del chat que hace falta para mandar un mensaje con contexto de pantalla.
export function pantallaActual(s) {
  const entregable = s.ui.vista === 'entregable' || s.ui.pagina !== 'visualizador' ? s.ui.entregable : null;
  const idCorrida = entregable ? s.ui.corridaPorEntregable[entregable] : null;
  const corrida = idCorrida ? s.corridas[idCorrida] : null;
  return {
    entregable,
    nodo: s.ui.nodo?.id,
    nodoTitulo: s.ui.nodo?.data?.titulo,
    modo: s.ui.pagina === 'asistente' ? 'asistente de entregable nuevo' : undefined,
    borrador: corrida?.borrador || undefined,
  };
}
