# Caso guiado de avance con evidencia

Autorizado en la conversación: mejorar primero un flujo demostrable del orquestador y luego incorporarlo como caso propio al portfolio.

## Alcance y comportamiento
Una entrada directa al caso guía por fuentes públicas, selección de evidencia, borrador y revisión humana. Se reproduce una corrida local registrada; el navegador no llama modelos ni conecta cuentas. Una acción separada inyecta un estado de producción no comprobado para mostrar el bloqueo. Se conserva el acceso al espacio de demo y sus recetas existentes.

## Implementación
- `lib/referencias.mjs`: extraer la comparación pura de referencias desde `lib/corridas.mjs`, conservando su API y pruebas.
- `lib/caso-guiado.mjs`: contrato cerrado de selección de IDs/estados y renderizado desde fuentes; rechazo de referencias desconocidas, duplicados y escalamiento de estado.
- `ejemplo/caso-publico/`: snapshot verificable de commits públicos y salida local original con trazabilidad. Los commits en main no se presentan como desplegados.
- `scripts/caso-guiado.mjs`: replay sin inferencia y corrida local explícita, acotada, con tiempos/tokens y costos no medidos diferenciados.
- `web/src/paginas/CasoGuiado.jsx`: recorrido, evidencia enlazada, resultado y bloqueo, accesible por URL.
- CI: tests existentes, casos nuevos, smoke y build estático en Node 24.

## Aceptación y pruebas
El replay válido queda como borrador sin envío. Una referencia inventada, estado no respaldado, salida vacía o malformada impide generar un borrador aprobado. Reiniciar restaura el caso. La demo funciona en escritorio/móvil y con teclado, sin desbordamiento. Las recetas y el smoke existentes siguen pasando. Se registra una llamada local real sin sustituir la salida a mano; fallos se informan, no se inventan métricas.

No hay DB, migraciones, envíos, cambios de cuentas ni nuevas rutinas. No se habilita inferencia desde el navegador. El alcance no incluye solucionar todos los riesgos de los decks largos.

## Riesgos y reversión
Separar claramente snapshot, replay y simulación de fallo. La comprobación de IDs no certifica cualquier redacción libre: el texto final se construye desde los registros elegidos. Conservar dependencia compartida de referencias sin módulos de Node en el navegador. Revertir el commit y promover el deployment anterior; no hay datos productivos que revertir.
