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

Llamá a `preparar_corrida` con el entregable (y el id de corrida, si te lo pasaron). Te devuelve la receta efectiva, las instrucciones completas, la ventana de fechas, los días especiales de la persona (`dias_especiales`: días libres o fechas con una nota que manda sobre el calendario) y el estado de cada fuente con la herramienta que tenés que usar para leerla.

- La ventana manda. Si la persona nombró otro día o período en el pedido ("lo del martes", "del 6 al 8"), pasale `desde` y `hasta` (YYYY-MM-DD) a `preparar_corrida` para que la corrida use esas fechas, y decilo en el borrador.
- Si la ventana trae `aviso` (no hay última corrida aprobada ni última entrega y se usaron los últimos 7 días), ponelo en la primera línea del borrador y pedí que confirmen la fecha de inicio.
- Seguí los `recordatorios` que devuelve.
- Avisá en una línea qué fuentes faltan y cómo se conectan. Si falta una fuente **requerida**, seguí con las demás y decilo en el borrador.
- Las fuentes no conectadas ya quedan marcadas en rojo en el visualizador.

## 4. Correr la receta

Seguí los pasos de la receta en orden. Para cada fuente y cada paso, reportá el avance con `reportar_paso` (`nodo`: `fuente:<id>` o `paso:<id>`; `estado`: `en_curso`, `ok`, `error` u `omitido`; `resultado`: una línea concreta como "3 PRs, 2 reuniones" o el motivo del error). El visualizador muestra esos reportes en vivo.

- Reportá cada nodo cuando empieza (`en_curso`) y cuando termina, en el orden en que lo hacés, no todos juntos al final. Un solo estado final por nodo: no lo vuelvas a cerrar con otro resultado.
- El paso que define la ventana o el período (`paso:ventana`, `paso:periodo`) ya lo deja hecho `preparar_corrida`. Los nodos `control` y `destino` los cierra `guardar_borrador`: no los reportes.
- Los conteos de cada resultado coinciden con lo registrado (sesiones y PRs distintos, no la suma de lecturas parciales). Una fuente leída que no trajo nada es "ok, sin datos", no "sin leer".
- Si el resultado dice que el paso o la fuente no se pudo hacer o leer, el estado es `error` u `omitido`, nunca `ok`. Todo nodo `fuente:*` y `paso:*` de la receta tiene que terminar con estado final (`ok`, `omitido` o `error`): si no, `guardar_borrador` lo rechaza.
- Reportá solo nodos de la receta efectiva. No llames herramientas de un módulo que no está en la receta (por ejemplo `seguimiento_listar` o `resumir_local` si su paso no figura) ni opines sobre si está activo.
- GitHub, sesiones de IA, registros y modelo local se leen con las herramientas propias (`leer_github`, `leer_sesiones`, `leer_registros`, `resumir_local`), que reportan su resultado solas; las tres primeras además registran la lectura. No uses `registrar_lectura` para estas fuentes.
  - `leer_issues_github` trae los issues asignados a la persona (para el paso "Pedidos que me llegaron") y registra sus refs dueño/repo#N como leídas.
  - `leer_github` y `leer_sesiones` devuelven la salida por páginas cuando es grande: si la respuesta trae `siguiente`, pedí la página que indica, con las mismas fechas, hasta que no traiga más. Solo lo devuelto queda registrado como leído; no partas la ventana por días para esquivar el tamaño.
  - De cada sesión usá los `hitos` que caen en la ventana (pedido y cierre, ya partidos por fecha local) y los `pendientes`; `primer_pedido` y `cierre` dan el contexto general. Cada hito con entrega cuenta por separado: que la sesión ya respalde un ítem no cubre sus otros hitos. Para el estado actual de algo, manda el hito más nuevo. Si una sesión viene con `recortado: true`, lo que no ves no se da por inexistente: decí "sin dato".
  - De cada PR usá el `cuerpo` (no solo el título), `motivo_cierre` si se cerró sin mergear, `incluye` si es un release a la rama de producción y `en_produccion` para saber si ya llegó. Un release o una convergencia sin `incluye` se cuenta por las features de su cuerpo. Las secciones de riesgos y de pendientes del cuerpo dicen qué quedó abierto: no lo des por cerrado.
- Calendario, mail, chat y Jira se leen con los conectores que indica `preparar_corrida`. Usá solo herramientas de lectura. Después de cada búsqueda, llamá a `registrar_lectura` con la `fuente`, **todos** los ids que devolvió en `refs` (no una selección: lo que no sirve va a descartados), la `consulta` tal como la hiciste, el `total` de resultados y un `resumen` de una línea que cuente lo leído sin clasificarlo todavía: sin eso, sus refs no pasan el control. Si buscaste algo y no hubo resultados, registralo igual (refs vacías, con la consulta). Buscá un término por consulta; de una consulta combinada sin resultados no se concluye que no hay nada de cada término.
- Respetá las instrucciones y las **reglas aprendidas** de la receta: cada una es una corrección que la persona ya hizo.
- Convertí las fechas de UTC a la zona horaria de la persona antes de asignar un día.

## 5. Control: si no hay evidencia, no se cuenta

Guardá el resultado con `guardar_borrador`:

- `borrador`: el entregable en el formato de la receta, listo para leer.
- `items`: cada afirmación del borrador con su `evidencia` (`fuente` y `ref`: el PR como `dueño/repo#123`, la sesión como aparece en `leer_sesiones`, el id del evento o del mail). **Todas** las refs de un ítem tienen que estar entre lo leído. La ref es la sesión o el PR donde se produjo lo que afirmás, no una consulta posterior sobre el tema.
- `descartados`: lo que dejaste afuera, cada uno como `{ texto, motivo, refs }` con al menos una ref, copiada tal como vino (con su prefijo: `codex:` no es `claude:`). El motivo cita entre comillas lo que dice la fuente (su pedido, su cierre, su título, su motivo de cierre), no una suposición; una razón editorial (largo, alcance) va además de la cita.
- Lo que no pudiste leer no es un descarte: el control rechaza un descartado cuyo motivo es "no se leyó" o "excedió el límite". Leelo (por páginas) o nombralo en `faltantes`.
- `faltantes`: fuentes que no se pudieron leer, insumos que faltan (por ejemplo, el resumen o la lectura de una candidata, uno por línea) y notas de proceso. Si el borrador tiene una sección de faltantes, lo mismo va acá. Las fuentes y pasos que terminaron en error u omitido se suman solos si no los nombraste. Lo que no es parte del entregable no va en el borrador.

Toda ref leída tiene que terminar en un ítem o en descartados: el control rechaza el borrador si quedan refs sin clasificar, si alguna ref de un ítem no es válida o si algún nodo de la receta no tiene estado final. Corregí lo que te marque (sacá el ítem o sumale evidencia real, clasificá lo que falta, cerrá los nodos) y volvé a llamarla; al tercer intento se guarda con observaciones. Nunca inventes una referencia para pasar el control.

Antes de guardar, revisá el borrador contra cada línea del control de la receta, una por una. Además, siempre:

- No nombres un PR, ticket, documento o persona que no esté en lo leído o en la config. Lo que una fuente dice que "va en otro PR" o "se hará" es pendiente.
- Escribí en primera persona de la persona. Nunca nombres al asistente (Claude, Codex) como quien hizo algo; lo que hizo otra persona se atribuye a ella, como lo dice la fuente.
- Números, nombres y cantidades se copian de la fuente, del texto final y no de un plan previo.
- Cada cosa lleva su estado exacto (local, en una rama, PR abierto, mergeado a qué rama, en producción, apagado hasta configurarlo; un documento: local, privado, compartido o presentado). Nada está "cerrado" si la fuente nombra pasos que faltan.
- Lo que dice tu resumen final y el resumen de cada nodo coincide con el borrador y con lo registrado.

## 6. Entregar como borrador

Mostrá el borrador y el destino configurado. **No mandes ni cargues nada** sin un OK explícito de la persona en esta conversación. Con el OK:

- Llamá a `aprobar_corrida` (marca la corrida como aprobada y, si el módulo está activo, guarda el seguimiento comercial).
- Recién después entregá en el destino con las herramientas que la persona tenga (Slack, el documento, el navegador para un formulario), y confirmá qué quedó cargado.

Si la corrida es desatendida (rutina programada o interfaz web), terminá en el borrador: nunca entregues.

## 7. Aprender de las correcciones

Si la persona corrige el borrador ("esto sobra", "más corto", "sumá los tickets de Jira"), proponé el cambio con `proponer_cambio`: ajustá la receta o la config y dejá la corrección como `regla` (se guarda con la fecha de hoy) para que no se repita. Mostrá el cambio y aplicalo con `aplicar_propuesta` solo después del OK. Después ofrecé volver a probar.

## Rutinas programadas

Si la persona pide programar las rutinas, llamá a `plan_rutinas`, mostrale qué tareas se van a crear en su sistema (días, horas y comando) y aplicalas con `programar_rutinas` solo con su OK. Las rutinas corren en su computadora: tiene que estar prendida y con Claude Code con sesión iniciada.
