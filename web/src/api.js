// Llamadas a la API local. Los pedidos que cambian algo llevan el encabezado x-orquestador.
const ENCABEZADOS = { 'content-type': 'application/json', 'x-orquestador': '1' };

export async function api(ruta, { metodo = 'GET', cuerpo } = {}) {
  const r = await fetch(`/api${ruta}`, {
    method: metodo,
    headers: metodo === 'GET' ? {} : ENCABEZADOS,
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

export function escucharEventos(manejadores) {
  const fuente = new EventSource('/api/eventos');
  for (const [tipo, fn] of Object.entries(manejadores)) {
    fuente.addEventListener(tipo, (e) => fn(JSON.parse(e.data)));
  }
  return () => fuente.close();
}
