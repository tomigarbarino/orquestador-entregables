# 01 · Slack y Teams como fuentes propias

**Problema.** Hoy Slack y Teams comparten una sola fuente, "chat del equipo", y solo se puede usar uno de los dos. Los equipos que usan los dos no pueden leer ambos, y la conexión de Slack no se ve por separado.

**Qué cambia para la persona.** En Conectores, Slack y Teams aparecen como dos fuentes distintas, cada una en verde o rojo según esté conectada. Se pueden prender las dos a la vez y elegirlas por entregable.

## Alcance técnico
- `conectores/catalogo.yaml`: fuentes nuevas `slack` (proveedor Slack) y `teams` (proveedor Microsoft 365, herramientas `teams_*` y `chat_message_search`), solo con herramientas de lectura. `chat` queda como alias por compatibilidad para las configs existentes.
- Config por fuente: `canales` (lista) y `menciones_directas` (bool) para Slack; `equipos`, `canales` y `chats_directos` para Teams.
- `lib/conectores.mjs`: estado de cada una por separado (mismo servidor MCP para Teams y para mail/calendario de Microsoft 365).
- `config.example.yaml`, esquema y recetas (`daily`, `registro-tareas`, `reunion-comercial`) actualizados para usar `slack` y `teams`.
- Interfaz: filas propias en Conectores y casillas en Entregables y en el asistente.

## Criterios de aceptación
- [ ] Con Slack y Teams conectados en claude.ai, Conectores muestra las dos en verde.
- [ ] Una corrida de la daily con las dos fuentes registra la lectura de cada una (`registrar_lectura`) y cita sus mensajes como evidencia.
- [ ] Las corridas siguen sin acceso a herramientas que envían mensajes.
- [ ] Una config vieja con `chat` sigue validando y funcionando.
- [ ] `npm test` y `npm run smoke` pasan.
