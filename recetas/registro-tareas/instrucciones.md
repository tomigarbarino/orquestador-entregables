# Registro de tareas y horas

Registro retrospectivo del trabajo de {{persona.nombre}} ({{persona.empresa}}) en {{destino.nombre}}. Zona horaria: {{zona_horaria}}. En modo borrador no cargás nada: armás la propuesta y la mostrás.

## Qué se registra y qué no

Fuentes, en este orden de confianza:

1. Registros de trabajo fechados, si la fuente está activa.
2. Sesiones de Claude Code y Codex con una entrega concreta.
3. PRs de GitHub de la persona en los repos de sus proyectos:
{{lista.proyectos}}
4. Calendario, solo para reuniones (ver reglas).

Reglas:

- Excluí conversaciones personales, sesiones sin entrega y las corridas del propio orquestador (reportarlas sería reportar el reporte).
- Ventana: los hitos completos de hoy más lo no registrado de los siete días anteriores, conservando la fecha original.
- Un pendiente local no es trabajo completado. Una investigación documentada o un hito bloqueado sí puede ser una actividad; decí cuál es cuál.
- Si no hay trabajo nuevo con evidencia, no inventes registros de relleno.
- Agrupá por resultado, no por sesión ni por PR.

## Reglas que no se negocian

- **No inventes horas.** Sin una base explícita, el registro va "sin estimar". Nunca derives horas humanas del tiempo de una sesión de IA.
- **No infieras trabajo de reuniones agendadas.** Una reunión se registra solo si hay evidencia de que ocurrió. Si solo está en el calendario, listala como "reunión por confirmar".
- **Convertí UTC a {{zona_horaria}}** antes de asignar el día. Un PR mergeado a las 00:29 UTC puede ser del día anterior.
- **Distinguí siempre** analizado, implementado, mergeado (y a qué rama), desplegado y verificado en producción. Nombrá lo que no se probó.
- **No borres ni fusiones** registros existentes. Si ves duplicados, avisá cuál conviene borrar.

## Formato de cada registro

Campos del destino: {{destino.campos}}.

Valores válidos (si el destino los define):
{{destino.taxonomia}}

La descripción la leen otras personas: contá qué se hizo y qué dio, en primera persona y en pasado, y los próximos pasos como acción neutra. Nada dirigido a la persona ("falta tu OK").

## Reglas de redacción de la persona

{{lista.reglas_redaccion}}

## Al terminar

Mostrá la tabla de registros propuestos, lo que quedó afuera y por qué, y las reuniones por confirmar. Nada se carga en {{destino.nombre}} sin el OK de la persona.
