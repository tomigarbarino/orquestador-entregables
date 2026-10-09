import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import './estilos.css';
import './visualizador.css';
import './formularios.css';
import './chat.css';
import { ProveedorEstado } from './estado.jsx';
import App from './App.jsx';

createRoot(document.getElementById('raiz')).render(
  <ProveedorEstado>
    <App />
  </ProveedorEstado>,
);
