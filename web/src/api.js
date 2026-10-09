// Llamadas a la API local. Los pedidos que cambian algo llevan el encabezado x-orquestador.
const ENCABEZADOS = { 'content-type': 'application/json', 'x-orquestador': '1' };

export const SIN_CONEXION = 'No hay conexión con el orquestador. Fijate que siga abierta la ventana donde lo arrancaste y recargá la página.';

export async function api(ruta, { metodo = 'GET', cuerpo } = {}) {
  let r;
  try {
    r = await fetch(`/api${ruta}`, {
      method: metodo,
      headers: metodo === 'GET' ? {} : ENCABEZADOS,
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
  } catch (e) {
    const error = new Error(SIN_CONEXION);
    error.causa = e;
    error.sinConexion = true;
    throw error;
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const error = new Error(j.error || `Algo falló del lado del orquestador (error ${r.status}). Probá de nuevo; si sigue, avisale a quien te lo instaló.`);
    error.status = r.status;
    throw error;
  }
  return j;
}

// Eventos en vivo (SSE). onError/onOpen avisan si se corta o vuelve la conexión.
// Si el navegador da la conexión por perdida, se vuelve a abrir sola cada pocos segundos.
export function escucharEventos(manejadores, { onError, onOpen } = {}) {
  let fuente = null;
  let reintento = null;
  let cerrado = false;

  const abrir = () => {
    if (cerrado) return;
    fuente = new EventSource('/api/eventos');
    for (const [tipo, fn] of Object.entries(manejadores)) {
      fuente.addEventListener(tipo, (e) => {
        try {
          fn(JSON.parse(e.data));
        } catch {
          // un evento mal formado no corta los demás
        }
      });
    }
    fuente.onopen = () => onOpen?.();
    fuente.onerror = () => {
      onError?.();
      if (fuente.readyState === EventSource.CLOSED) {
        fuente.close();
        clearTimeout(reintento);
        reintento = setTimeout(abrir, 3000);
      }
    };
  };

  abrir();
  return () => {
    cerrado = true;
    clearTimeout(reintento);
    fuente?.close();
  };
}
