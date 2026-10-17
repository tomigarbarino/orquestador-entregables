# Avance con evidencia: caso guiado

Proyecto propio, con una muestra reproducible y límites explícitos. [Abrir el caso](https://orquestador-entregables-tomas.vercel.app/?caso=avance).

## Recorrido para mostrarlo (2 minutos)

1. Abrí el caso: tres commits públicos, identificados y enlazados. El snapshot del 17/10/2026 comprueba que pertenecían a `main` en `af6dfb0`, usando `git merge-base --is-ancestor`. No comprueba despliegues.
2. Tocá **Reproducir corrida registrada**. Se vuelve a controlar la respuesta original del modelo y aparece un borrador con referencias. No se simula una inferencia nueva ni se hace una llamada desde el navegador.
3. Tocá **Probar fallo: afirmar «desplegado»**. Se inyecta deliberadamente ese estado; el control lo rechaza y retira todo el borrador, aunque los otros registros sean válidos.
4. Restaurá la selección original o reiniciá. La revisión humana sigue pendiente; no hay envío de mensajes.
5. **Explorar todas las recetas** abre el espacio ficticio existente con daily, tareas, decks y sus corridas simuladas. Son otra modalidad, diferenciada en el banner.

## Qué se ejecutó realmente

`ejemplo/caso-publico/fuentes.json` conserva títulos originales, SHA completos y URLs públicas. `corrida.json` conserva el pedido exacto, esquema, opciones, respuesta completa de Ollama y su hash SHA-256 del snapshot. No se corrigió la respuesta a mano.

Una inferencia local de `qwen3.5:4b`, el 17/10/2026, seleccionó tres IDs con estado `en_main`. Tiempo de pared: **13.211 ms**; tokens de entrada/salida: **716 / 85**. Es una muestra de selección estructurada, no un benchmark ni una evaluación de redacción libre. El borrador se construye determinísticamente a partir de los títulos y enlaces seleccionados.

No hubo cargo de proveedor remoto para esta llamada local. Electricidad, hardware, tiempo de edición humana y ahorro de tiempo no fueron medidos. No hay resultados de clientes ni adopción comprobada en este caso.

## Reproducir y verificar

Node 22.12+; CI usa Node 24.

```sh
npm ci
npm run caso
npm test
npm run smoke
npm run build:demo
```

`npm run caso` trabaja sin red y falla si cambia el snapshot, si la salida no cumple el contrato o si el fallo deliberado no queda bloqueado. Los tests cubren selección válida, JSON inválido, vacío, IDs desconocidos, duplicados, texto libre, mezcla válida/inválida y escalamiento de estado, además de los tests del producto existente.

Para registrar **una nueva inferencia**, instalar previamente Ollama y el modelo `qwen3.5:4b`; el script no los instala ni descarga:

```sh
npm run caso -- --local
```

Ese comando hace una sola llamada a `http://127.0.0.1:11434`, con timeout de 90 s y máximo de 512 tokens de salida. Reemplaza `corrida.json`, incluyendo una salida rechazada si el modelo falla el contrato. Revisá el diff antes de commitear; cualquier nueva medición requiere actualizar la copia del portfolio. El replay y CI nunca llaman modelos.

## Arquitectura y límites

- `lib/caso-guiado.mjs` es el control puro compartido por navegador, CLI y tests. Acepta de uno a tres registros del snapshot, solo IDs/estados, sin campos libres. Un error invalida el resultado completo.
- `lib/referencias.mjs` extrae el comparador existente sin cambiar su API pública en `lib/corridas.mjs`. Las pruebas existentes siguen cubriendo el control del servidor.
- La página guiada usa una corrida capturada. El resto de la demo conserva datos ficticios y no acredita conexiones reales.
- Se restauró `ejemplo/demo/semilla/config.yaml`, ausente del repo por la regla genérica del `.gitignore`. La excepción solo permite ese fixture ficticio. El espacio personal sigue ignorado.
- El control cerrado no certifica semántica de texto libre, calidad de decks largos, integraciones vivas ni despliegues reales. Un piloto con un equipo debería medir correcciones, esfuerzo de revisión y tiempo total antes de afirmar ahorro.

## Validación del cambio

17/10/2026: **124 tests**, replay válido y rechazo deliberado, **16 flujos smoke** y build estático. Navegador: teclado para iniciar, resultado y foco, rechazo sin borrador, restauración, reinicio, navegación al espacio completo y layout móvil. La versión publicada se verifica después del deploy. No se ejecutan instaladores, cuentas ni rutinas programadas en esta validación.

Reversión: revertir el commit o volver al deployment anterior. No hay migraciones ni datos productivos modificados.
