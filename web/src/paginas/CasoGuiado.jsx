import { useRef, useState } from 'react';
import { controlarSeleccion, salidaConFallo } from '@lib/caso-guiado.mjs';
import fuentes from '../../../ejemplo/caso-publico/fuentes.json';
import corrida from '../../../ejemplo/caso-publico/corrida.json';
import { useApp } from '../estado.jsx';
import '../caso-guiado.css';

const REPO = 'https://github.com/tomigarbarino/orquestador-entregables';

export default function CasoGuiado() {
  const { acciones } = useApp();
  const [modo, setModo] = useState('fuentes');
  const resultado = useRef(null);
  const control = modo === 'fuentes' ? null : controlarSeleccion(fuentes,
    modo === 'fallo' ? salidaConFallo(corrida.raw.response) : corrida.raw.response);
  function mostrar(siguiente) {
    setModo(siguiente);
    // El foco sigue el resultado de la acción también para teclado/lector de pantalla.
    requestAnimationFrame(() => resultado.current?.focus());
  }
  return (
    <div className="caso-guiado">
      <header className="caso-cabecera">
        <p className="caso-etiqueta">CASO GUIADO · PROYECTO PROPIO</p>
        <h1>Un avance que podés rastrear hasta la fuente.</h1>
        <p>De tres commits públicos a un borrador revisable. Recorré la evidencia y probá qué pasa cuando se afirma un despliegue sin respaldo.</p>
        <div className="caso-acciones">
          <button className="boton primario" onClick={() => mostrar('valido')}>Reproducir corrida registrada</button>
          {modo !== 'fuentes' && <button className="boton" onClick={() => mostrar('fuentes')}>Reiniciar caso</button>}
          <button className="boton" onClick={() => acciones.ir('visualizador')}>Explorar todas las recetas</button>
        </div>
        <p className="caso-nota">Replay en tu navegador: sin conectar cuentas, llamar modelos ni enviar mensajes. La inferencia original se ejecutó con un modelo local.</p>
      </header>

      <ol className="caso-pasos" aria-label="Recorrido del entregable">
        <li><b>01 · Fuentes</b><span>Snapshot público</span></li>
        <li><b>02 · Selección IA</b><span>Corrida registrada</span></li>
        <li><b>03 · Control</b><span>Referencias y estados</span></li>
        <li><b>04 · Borrador</b><span>Revisión humana</span></li>
      </ol>

      <div className="caso-columnas">
        <section className="caso-panel" aria-labelledby="caso-fuentes">
          <p className="caso-etiqueta">01 / ENTRADA VERIFICABLE</p>
          <h2 id="caso-fuentes">Tres registros, un límite claro.</h2>
          <p>Estos commits estaban en <code>main</code> al capturar el snapshot del {fuentes.capturado_en.slice(0, 10)}. Eso no demuestra que estén desplegados.</p>
          <ul className="caso-fuentes">
            {fuentes.fuentes.map((f) => <li key={f.id}>
              <span className="caso-ref">{f.id} · {f.sha.slice(0, 7)} · En main</span>
              <a href={f.url} target="_blank" rel="noopener noreferrer">{f.titulo} ↗</a>
            </li>)}
          </ul>
          <a href={`${REPO}/tree/main/ejemplo/caso-publico`} target="_blank" rel="noopener noreferrer">Ver snapshot y corrida original ↗</a>
        </section>

        <section className="caso-panel caso-resultado" aria-labelledby="caso-resultado-titulo" ref={resultado} tabIndex={-1}>
          <p className="caso-etiqueta">02—04 / RESULTADO Y CONTROL</p>
          <h2 id="caso-resultado-titulo">{!control ? 'Todo listo para recorrerlo.' : control.ok ? 'Evidencia válida. Borrador pendiente de revisión.' : 'Bloqueado: estado sin evidencia.'}</h2>
          <div role="status" aria-live="polite" className={`caso-estado ${control ? control.ok ? 'caso-ok' : 'caso-error' : ''}`}>
            {!control ? 'Reproducí la corrida para ver la selección, el control y el borrador.' : control.ok ? `${control.registros.length} referencias válidas · Estado en main · Nada enviado` : '0 borradores habilitados · Corregí la selección antes de continuar'}
          </div>
          {control && <>
            <details><summary>Ver selección {modo === 'fallo' ? 'alterada para esta prueba' : 'original del modelo'}</summary>
              <pre>{modo === 'fallo' ? salidaConFallo(corrida.raw.response) : corrida.raw.response}</pre>
            </details>
            {control.ok ? <>
              <article className="caso-borrador" aria-label="Borrador con evidencia">
                <h3>Avance con evidencia</h3>
                <ul>{control.registros.map((f) => <li key={f.id}><b>En main</b> — {f.titulo} <a href={f.url} target="_blank" rel="noopener noreferrer">[{f.id}] ↗</a></li>)}</ul>
                <p><b>Pendiente:</b> revisar relevancia y redacción. El despliegue a producción no fue verificado.</p>
              </article>
              <p>El modelo seleccionó IDs y estados. El texto y los enlaces se construyen desde el snapshot; no se acepta redacción libre.</p>
              <button className="boton" onClick={() => mostrar('fallo')}>Probar fallo: afirmar «desplegado»</button>
            </> : <>
              <ul className="caso-errores">{control.errores.map((e) => <li key={e}>{e}</li>)}</ul>
              <p>Prueba deliberada: se cambió un estado de la selección original. El control rechaza el resultado completo y retira el borrador.</p>
              <button className="boton" onClick={() => mostrar('valido')}>Restaurar selección original</button>
            </>}
          </>}
        </section>
      </div>

      <section className="caso-panel caso-medidas" aria-labelledby="caso-medidas">
        <div><p className="caso-etiqueta">REGISTRO, NO ESTIMACIÓN</p><h2 id="caso-medidas">Una corrida local medida.</h2><p>qwen3.5:4b vía Ollama · {corrida.capturado_en.slice(0, 10)}. Una muestra; no es un benchmark ni un resultado de cliente.</p></div>
        <dl><div><dt>Tiempo original</dt><dd>{(corrida.mediciones.pared_ms / 1000).toFixed(1)} s</dd></div><div><dt>Tokens entrada / salida</dt><dd>{corrida.raw.prompt_eval_count} / {corrida.raw.eval_count}</dd></div><div><dt>Revisión y ahorro</dt><dd>Sin medir</dd></div></dl>
        <p className="caso-nota">Sin cargo de proveedor remoto en esta llamada local. Electricidad y hardware no medidos. El control verifica este contrato cerrado; no certifica cualquier texto generado ni todos los flujos del producto.</p>
      </section>
      <footer className="caso-pie"><a href={`${REPO}/blob/main/docs/caso-guiado.md`} target="_blank" rel="noopener noreferrer">Cómo reproducirlo y qué se probó ↗</a><a href="https://tomas-garbarino.vercel.app/en/orquestador" target="_blank" rel="noopener noreferrer">Decisiones del proyecto y contacto ↗</a></footer>
    </div>
  );
}
