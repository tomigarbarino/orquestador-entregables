---
name: orquestador-entregables
description: Arma los entregables que se repiten (daily, registro de tareas y horas, deck de avance semanal, notas de reunión comercial y los que sumes) a partir de tu configuración y tus recetas, siempre como borrador y con control de evidencia. Usar cuando la persona pida "armá lo de hoy", "armá la daily", "corré el registro de tareas", "qué entregables tocan hoy", "probá el entregable X", "programá las rutinas" o "mandalo" después de aprobar un borrador.
---

# Orquestador de entregables

Armás los entregables recurrentes de la persona a partir de su configuración y sus recetas. Todo sale como **borrador**: nada se manda ni se carga en otro sistema sin un OK explícito.

Trabajás con las herramientas del servidor MCP del orquestador (en Claude Code se llaman `mcp__orquestador__<nombre>`). No leas ni edites archivos del espacio a mano: todo pasa por esas herramientas.

## 1. Leer la configuración

Llamá a `estado`. Si la configuración no es válida, decí qué está mal (ruta y mensaje) y sugerí abrir la interfaz (`npm start` en la carpeta del repo) para corregirlo. No sigas con una config inválida.

## 2. Decidir qué entregable toca

- Si la persona nombró uno ("armá la daily"), es ese. Las frases de cada receta ayudan a reconocerlo.
- Si pidió "lo de hoy" o "lo que toca", usá `toca_ahora` de `estado`; si está vacío, `toca_hoy`. Si hay más de uno, armalos uno por uno, en orden de hora.
- Si no queda claro y hay alguien del otro lado, preguntá cuál. Si la corrida es desatendida (rutina o interfaz), no preguntes: armá el que corresponda y explicá la elección.

## 3. Preparar la corrida y revisar las fuentes

Llamá a `preparar_corrida` con el entregable (y el id de corrida, si te lo pasaron). Te devuelve la receta efectiva, las instrucciones completas, la ventana de fechas y el estado de cada fuente con la herramienta que tenés que usar para leerla.

- Avisá en una línea qué fuentes faltan y cómo se conectan. Si falta una fuente **requerida**, seguí con las demás y decilo en el borrador.
- Las fuentes no conectadas ya quedan marcadas en rojo en el visualizador.

## 4. Correr la receta

Seguí los pasos de la receta en orden. Para cada fuente y cada paso, reportá el avance con `reportar_paso` (`nodo`: `fuente:<id>`, `paso:<id>`, `control` o `destino`; `estado`: `en_curso`, `ok`, `error` u `omitido`; `resultado`: una línea concreta como "3 PRs, 2 reuniones" o el motivo del error). El visualizador muestra esos reportes en vivo.

- GitHub, sesiones de IA, registros y modelo local se leen con las herramientas propias (`leer_github`, `leer_sesiones`, `leer_registros`, `resumir_local`), que ya reportan su resultado.
- Calendario, mail, chat y Jira se leen con los conectores que indica `preparar_corrida`. Usá solo herramientas de lectura.
- Respetá las instrucciones y las **reglas aprendidas** de la receta: cada una es una corrección que la persona ya hizo.
- Convertí las fechas de UTC a la zona horaria de la persona antes de asignar un día.

## 5. Control: si no hay evidencia, no se cuenta

Guardá el resultado con `guardar_borrador`:

- `borrador`: el entregable en el formato de la receta, listo para leer.
- `items`: cada afirmación del borrador con su `evidencia` (`fuente` y `ref`: el PR como `dueño/repo#123`, la sesión como aparece en `leer_sesiones`, el id del evento o del mail).
- `descartados`: lo que dejaste afuera y por qué.
- `faltantes`: fuentes que no se pudieron leer.

Si `guardar_borrador` rechaza ítems, sacalos del borrador (o sumales evidencia real) y volvé a llamarla. Nunca inventes una referencia para pasar el control.

## 6. Entregar como borrador

Mostrá el borrador y el destino configurado. **No mandes ni cargues nada** sin un OK explícito de la persona en esta conversación. Con el OK:

- Llamá a `aprobar_corrida` (guarda el recibo y el seguimiento, si el módulo está activo).
- Recién después entregá en el destino con las herramientas que la persona tenga (Slack, el documento, el navegador para un formulario), y confirmá qué quedó cargado.

Si la corrida es desatendida (rutina programada o interfaz web), terminá en el borrador: nunca entregues.

## 7. Aprender de las correcciones

Si la persona corrige el borrador ("esto sobra", "más corto", "sumá los tickets de Jira"), proponé el cambio con `proponer_cambio`: ajustá la receta o la config y dejá la corrección como `regla` (se guarda con la fecha de hoy) para que no se repita. Mostrá el cambio y aplicalo con `aplicar_propuesta` solo después del OK. Después ofrecé volver a probar.

## Rutinas programadas

Si la persona pide programar las rutinas, llamá a `plan_rutinas`, mostrale qué tareas se van a crear en su sistema (días, horas y comando) y aplicalas con `programar_rutinas` solo con su OK. Las rutinas corren en su computadora: tiene que estar prendida y con Claude Code con sesión iniciada.
