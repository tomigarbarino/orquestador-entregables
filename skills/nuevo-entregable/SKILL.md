---
name: nuevo-entregable
description: Suma un entregable recurrente nuevo al orquestador en cuatro pasos (qué armás siempre igual, de dónde sale cada dato, reglas de formato y tono, cuándo corre) y genera su receta y su entrada en la configuración. Usar cuando la persona diga "quiero sumar un entregable", "armemos una receta nueva", "todas las semanas armo X a mano" o "agregá un entregable al orquestador".
---

# Sumar un entregable nuevo

Guiás a la persona por los cuatro pasos y al final proponés la receta y su entrada en la configuración. Trabajás con las herramientas del servidor MCP del orquestador (`mcp__orquestador__<nombre>` en Claude Code).

Hacé una pregunta por vez, con un ejemplo concreto, y resumí lo que entendiste antes de pasar a la siguiente. Si la persona ya dio la respuesta, no la repreguntes.

## 1. Qué armás siempre igual

- Nombre del entregable y para quién es.
- Cómo se ve cuando está bien hecho: pedile un ejemplo real (pegado) o que lo describa en tres líneas.
- Con eso definí el `formato` del destino y los pasos de redacción.

## 2. De dónde sale cada dato

- Por cada parte del entregable, de qué fuente sale: GitHub, sesiones de IA, registros, calendario, mail, chat, Jira o modelo local. Llamá a `estado` para ver cuáles están conectadas y avisá las que falten.
- Cada fuente va a la receta con un `para` concreto ("PRs mergeados a main en la semana").
- Las fuentes que se leen con conectores (calendario, mail, chat, Jira) se registran en la corrida con `registrar_lectura`: decilo en el `detalle` del paso que las lee.

## 3. Reglas de formato y tono

- Largo, tono, qué no decir, cómo nombrar a la gente y a los clientes.
- Las reglas generales de la persona ya están en `reglas_redaccion` de la config: sumá solo las propias de este entregable, en las instrucciones.
- Definí el control de evidencia: qué tiene que tener respaldo y qué se descarta. Escribí reglas que se puedan verificar ("como máximo 200 palabras", no "corto").
- Toda receta lleva en el control que cada ítem cita su evidencia, que toda ref leída termina en un ítem o en descartados con su motivo y que el estado se dice exacto (nunca "listo" si solo está en una rama).
- En el YAML, un texto que lleva " #" o ": " va entre comillas simples: si no, se corta (" #" se lee como comentario) o se rompe la receta.

## 4. Cuándo corre y a dónde va

- Días y hora, o "a pedido".
- Qué período cubre cada corrida (`disparador.ventana`): `hoy`, `dia_habil_anterior`, `ultimos_7_dias`, `desde_ultima_corrida` o `evento`. Si la persona puede nombrar otro día en el pedido, decilo en las instrucciones.
- Destino: borrador en el chat, Slack (canal), un documento o un formulario (URL). Recordale que siempre sale como borrador y nada se manda sin su OK.

## Generar la receta

Con `ver_receta` mirá una receta existente parecida (por ejemplo `daily`) para copiar la estructura. Después llamá a `proponer_cambio` con:

- `recetas`: la receta nueva (`id` en minúsculas con guiones, `receta_yaml` con disparador, fuentes, pasos, control y destino, e `instrucciones` en Markdown). Uno de los pasos tiene que tener id `redactar` (ahí se enganchan los módulos), y cada `usa` de un paso nombra fuentes de la receta.
- `config_yaml`: la config completa con la entrada nueva en `entregables` (receta, activo, fuentes, horario y destino). Conservá el resto igual.
- `motivo`: "Entregable nuevo: <nombre>".

Mostrale el resultado y aplicalo con `aplicar_propuesta` solo con su OK. Después ofrecé probarlo: "armá <nombre>".
