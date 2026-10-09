# 02 · Origen de tareas configurable y perfil de equipo

**Problema.** El orquestador no sabe de dónde le llegan los pedidos a cada persona, así que la daily y el registro de tareas solo ven lo que la persona hizo (PRs, sesiones) y no lo que le pidieron. Además, cada integrante tendría que configurar lo mismo que el resto de su equipo.

**Qué cambia para la persona.**
- En Perfil, una sección "¿De dónde te llegan las tareas?" con casillas para Slack, Teams, mail, Jira, issues de GitHub y reuniones (Fathom). Cada opción muestra si está conectada y, si no, cómo conectarla. Las que lo necesitan piden el detalle: canales, equipos, remitentes, proyectos o repos, y si cuenta lo asignado o mencionado a la persona.
- Un paso nuevo, "Pedidos que me llegaron", en la daily y en el registro de tareas. Releva qué le pidieron, quién y cuándo, y lo separa en hecho y pendiente, citando el mensaje, el mail o el ticket.
- **Perfil de equipo:** el líder arma desde la interfaz un archivo con las fuentes de tareas, los canales, los entregables prendidos y las reglas de redacción del equipo, y lo exporta. Cada integrante lo importa con "Usar la configuración de mi equipo" y después ajusta lo suyo encima.

## Alcance técnico
- Esquema: `origen_tareas: [{ fuente, canales?, equipos?, remitentes?, proyectos?, repos?, solo_mios? }]`.
- Esquema de perfil de equipo, `equipo.yaml`: un subconjunto de la config, sin datos personales.
- Fusión: los valores de la persona pisan a los del equipo. La interfaz muestra de dónde viene cada valor ("del equipo" o "tuyo").
- Pieza nueva `modulos/pedidos-recibidos`, o paso base en `daily` y `registro-tareas`, que agrega el paso `pedidos` antes de `redactar` y sus fuentes, según `origen_tareas`.
- Interfaz: Perfil (sección de origen de tareas, más exportar e importar el perfil de equipo) y vista previa del flujo.
- Lector de issues de GitHub asignados (`gh issue list --assignee`) en `lib/fuentes-locales.mjs`.

## Criterios de aceptación
- [ ] Una persona elige Slack y mail como origen y la daily muestra el nodo "Pedidos que me llegaron" con esas dos fuentes.
- [ ] Un perfil de equipo exportado no contiene nombre, mail ni datos personales. El escáner de `npm run escanear` no encuentra nada.
- [ ] Al importar el perfil de equipo y después cambiar un canal, el cambio de la persona se conserva.
- [ ] Cada pedido citado en el borrador tiene la referencia del mensaje, el mail o el ticket.
- [ ] `npm test` y `npm run smoke` pasan.
