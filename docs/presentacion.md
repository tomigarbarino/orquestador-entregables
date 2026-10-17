# Presentación para el AI Day

- **Video de 2 minutos:** [presentacion/orquestador-presentacion.webm](presentacion/orquestador-presentacion.webm). Recorre la demo pública con un texto por paso: mapa general, Probar ahora, borrador con evidencia, chat que suma Jira, Conectores, origen de tareas, Historial y Nuevo entregable.
- **Demo pública:** https://orquestador-entregables-tomas.vercel.app (datos ficticios, sin instalar nada).
- **Detalle técnico:** [funcionalidades.md](funcionalidades.md).

## Qué resuelve

Cada semana se arma a mano lo mismo: la daily, el registro de tareas y horas, el deck de avance y las notas de reunión. Los datos salen de GitHub, Slack, Teams, el mail y las grabaciones de reuniones, y los pedidos que llegan por chat se pierden en el camino. Un resumen hecho con IA sin fuentes puede inventar avances, y nadie lo quiere mandar así.

Con el orquestador, cada persona configura sus entregables una vez. Claude arma el borrador con evidencia y la persona decide qué sale.

## Tres reglas que no se negocian

- **Borrador:** nada se envía ni se carga en otro sistema sin el OK de la persona.
- **Evidencia:** si no hay evidencia, no se cuenta. Cada punto cita su PR, mensaje o reunión, y lo que no tiene respaldo queda afuera con su motivo.
- **Credenciales:** corre en la compu de cada uno (solo 127.0.0.1). Los accesos quedan en Claude Code y en el GitHub CLI; ni la config ni el navegador guardan tokens.

## Feature por feature

| Feature | Qué soluciona | Dónde aplica |
|---|---|---|
| Recetas de entregables: daily, registro de tareas y horas, deck de avance, notas de reunión comercial y bitácora de reuniones | No arrancar de cero; los datos personales van en la config y la receta se comparte | Cualquier persona con un entregable recurrente |
| Conectores: GitHub, sesiones de Claude Code y Codex, calendario, mail y reuniones de Outlook, Fathom, Slack, Teams y Jira | Juntar a mano lo que pasó en cinco herramientas | Equipos en Slack o en Teams, con o sin Fathom |
| Visualizador del flujo y «Probar ahora» | La caja negra: se ve qué hizo la IA y dónde falló, sin leer código | Personas no técnicas y quien explica el proceso |
| Control de evidencia | Avances inventados o exagerados | Todo entregable que sale del equipo |
| Chat que propone cambios, con la diferencia en el mapa, reglas fechadas y deshacer | Corregir lo mismo cada semana | Quien ajusta formato o tono sin tocar archivos |
| Entregable propio en cuatro preguntas | Quedar limitado a las recetas de fábrica | Cualquier área: mail semanal a clientes, informe de horas, resumen de incidentes |
| De dónde llegan las tareas y perfil de equipo | Pedidos informales que se pierden y configuración repetida | Soporte, producto, delivery |
| Reuniones como evidencia y bitácora (Fathom u Outlook) | Decisiones que quedan solo en la grabación | Comerciales, líderes, quien tiene muchas reuniones |
| Rutinas programadas y skill en Claude Code | Acordarse de armarlo | Entregables con horario fijo |
| Módulos opcionales: digest de Jira, seguimiento comercial, resumen local con Ollama | Necesidades de algunos equipos sin complicar al resto | Equipos con Jira, áreas comerciales, datos que no pueden salir de la compu |
| Instalación en un comando y demo pública | La barrera de entrada para quien recién empieza | Todos |

## Dónde es aplicable

| Rol | Entregable | Fuentes típicas |
|---|---|---|
| Desarrollo | Daily, registro de tareas y horas | GitHub, sesiones de Claude Code y Codex, Slack o Teams |
| Líderes y producto | Deck de avance semanal | PRs que llegaron a producción, issues, sesiones |
| Comercial | Notas de reunión comercial, seguimiento de compromisos | Fathom, calendario, mail |
| Delivery y PM | Bitácora de reuniones, pedidos recibidos | Fathom u Outlook, Teams, Jira |
| Cualquier área | Uno propio con el asistente | Lo que ya tenga conectado |

No conviene para documentos únicos que no se repiten, ni para envíos que tengan que salir sin revisión humana.

## Roadmap

**Hecho**

- Recetas, interfaz, orquestador, módulos e instalación.
- Interfaz pensada para gente no técnica, validada con corridas reales.
- Slack y Teams como fuentes.
- Origen de tareas y perfil de equipo.
- Fathom y Outlook como evidencia.
- Bitácora de reuniones.
- Lector de GitHub que detecta lo que llega a producción con una convergencia.
- Demo pública y video.

**Con observaciones**

- Deck de avance semanal: lee todo lo del período, pero en decks largos todavía no cumple todas las reglas de redacción y seguridad. Queda como borrador para revisar a mano.

**A validar en el AI Day** (propuestas, sin fecha)

- Piloto con dos o tres equipos, cada uno con su perfil.
- Medir los minutos ahorrados por entregable.
- Permisos de Fathom herramienta por herramienta, cuando publiquen sus nombres.
- Recetas de la comunidad: informe mensual de horas, resumen de incidentes, mail semanal a clientes.
- Probar el digest de Jira con datos reales.

## Cómo contarlo en 5 minutos

| Tiempo | Qué mostrar |
|---|---|
| 1 min | El problema: la daily y el registro de horas se arman a mano cada día. |
| 2 min | Demo: Inicio → Por entregable → Probar ahora → el borrador con su evidencia. |
| 1 min | Chat: «sumá Jira», ver la diferencia en el mapa y aplicar. |
| 1 min | Cómo se suma cada equipo: instalar, perfil de equipo y primer entregable en 15 minutos. |
