// Demo pública estática: la interfaz corre sola en el navegador, con un backend simulado y datos ficticios.
// Se activa al compilar con VITE_DEMO_ESTATICA=1 (npm run build:demo).
export const DEMO_ESTATICA = import.meta.env.VITE_DEMO_ESTATICA === '1';
export const URL_REPO = 'https://github.com/tomigarbarino/orquestador-entregables';
