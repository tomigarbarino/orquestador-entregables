# Deck de avance semanal

Presentación semanal de {{persona.equipo}} ({{persona.empresa}}) para contar lo que avanzó. La arma {{persona.nombre}}.

## Pasos

1. **Período**: desde el último deck hasta hoy. El último deck es el más nuevo entre la última corrida aprobada y la fecha de última entrega cargada en la config ({{opciones.ultima_entrega}}), aunque se haya armado fuera del orquestador. Si no hay ninguna de las dos y usás el respaldo de siete días, avisalo en la primera línea del borrador y pedí confirmar la fecha de inicio.
2. **Qué entró**: PRs mergeados a la rama de producción de cada proyecto (eso es "en producción") y PRs abiertos o en una rama de integración (pendiente de pasar). Contá en GitHub, no de memoria.
{{lista.proyectos}}
   - Un PR mergeado a otra rama que ya llegó a producción (`en_produccion`) se cuenta como entregado, aunque se haya mergeado antes del período. Lo que el deck anterior dejó pendiente y llegó en el período también se cuenta.
   - Un release a la rama de producción se abre en los PRs que `incluye`: cada uno es parte de una slide o va a descartados con su motivo. Si no trae PRs incluidos (por ejemplo, una convergencia de una rama larga), las features salen de su `cuerpo`: cada función nueva que lista (lo que entra, sus migraciones) va a una slide o a las notas. Algo que no existía en producción y llegó ese día se cuenta como nuevo, no como un retoque. Sus riesgos conocidos van a las notas.
   - Un PR con `llego_a_produccion_el` se mergeó a otra rama antes del período y llegó a producción en el período con el release `via`: es una función nueva en producción, con slide propia o agrupada por tema, y su "en producción desde" es esa fecha. Contalo a partir de su `cuerpo`, con lo que el release declara (flags, variables, riesgos).
   - "En producción desde" es la fecha del merge a la rama de producción, no la del merge a la rama de integración.
   - Un arreglo mergeado solo a una rama de integración no arregló nada en producción: va como "por pasar", en futuro.
   - Si el cuerpo trae riesgos, pendientes o lo no incluido, la slide dice qué quedó abierto. Algo que llegó apagado ("llega apagado", una variable sin configurar) es "en producción, apagado hasta configurarlo" si ninguna fuente confirma que se activó.
   - Contá lo que hace cada PR a partir de su `cuerpo`, no del título. Un PR cerrado sin mergear se cuenta según su `motivo_cierre`.
   - Si la base de un PR abierto no es la rama de producción, decilo: "PR abierto contra <rama>; no va directo a producción". Si una sesión o un PR dice que esa rama se retiró, agregá que hay que apuntarlo a la rama de producción antes de que pueda llegar.
   - Por pasar es solo un PR abierto o algo mergeado a una rama de integración. Un cambio local sin PR no tiene slide propia: va en las notas de otra slide ("en curso, local") o a descartados.
   - Pedí todas las páginas de `leer_github` y `leer_sesiones` (campo `siguiente`). Lo que no se pudo leer va a faltantes, nunca a descartados.
3. **Evidencia por feature entregada**: una captura real o un GIF de la app. Si la interfaz esconde el mecanismo, sumá una slide "cómo funciona por dentro". Para el contexto de cada feature usá los `hitos` y `pendientes` de las sesiones.
4. **Armado**: un tema por slide, sin slide de agenda ni de resumen. Design system: {{marca.design_system}}.
5. En modo borrador devolvé el guion completo slide por slide, y **cada slide con sus cinco campos**: título, mensaje en una línea, evidencia visual, estado (en producción, por pasar o investigación) y notas para decir. El deck se arma cuando la persona lo aprueba.

## Reglas de redacción

- Los arreglos se cuentan por cómo funciona ahora, no por el bug ni por quién lo reportó, y salen del cuerpo del PR. Ninguna frase arranca por el error: "el filtro encuentra las búsquedas que superan el tope", no "corrige que el filtro no encontraba a nadie".
- Un tema por slide. Un hallazgo de seguridad no se mete en una slide de otro tema. Una vulnerabilidad abierta se nombra sin el detalle que serviría para explotarla: ni rutas, ni endpoints, ni qué rol o paso la dispara. Si la fuente dice que la exposición ya existía en producción, decilo así, sin minimizarlo.
- Si un release dice que lo nuevo no tiene flags (se ve para todos los clientes o empresas), o que depende de variables que nadie confirmó, la slide lo dice.
- Títulos y mensajes cuentan cómo funciona ahora; nunca arrancan por el error ("se cerró", "se corrigió", "bypass").
- No recomiendes pasos que la fuente no propone ni que contradigan lo que dice el PR (por ejemplo, "no mergear a main").
- Nombrá solo a las personas de la lista de abajo; a cualquier otra, por su rol.
- Los números se copian de la fuente. Si dos fuentes del período se contradicen (una frase del 01/10 que otro PR del 06/10 dejó vieja), manda la más nueva.
- Los mensajes de lo que está por pasar cuentan qué va a cambiar para quien usa la app, en futuro y sin jerga (nada de commits, portar o ramas en el mensaje).
- Lo que no llegó a producción va en futuro o "por pasar", también en el título y el mensaje: nada de "ya", "ahora", "completa" ni "se corrigió".
- No afirmes un "antes", un "se venía pidiendo", un "ya probado" ni una motivación sin que salga de un PR, una sesión o un registro.
- Si un release declara riesgos o vulnerabilidades abiertas, no digas que se cerraron brechas sin aclararlo.
- Pendientes y próximos pasos en lenguaje llano, para gente ajena al proyecto.
- Cuando mostrás datos, sumá una conclusión. Una slide de investigación trae el hallazgo principal con su dato y su conclusión, separa lo medido (con su fuente) de la interpretación (rotulada como hipótesis) y no propone consultar al cliente si la persona no lo pidió.
- Usá solo los estados de la lista (en producción, por pasar, investigación); no inventes otros.
- Tapá o recortá datos de clientes, candidatos y usuarios, también en las capturas que proponés.
{{lista.reglas_redaccion}}

## Cómo nombrar a la gente

{{lista.personas}}

## Al terminar

Reportá cuántas slides tiene y cuántas hay de cada estado (contadas sobre el borrador), qué evidencia visual falta conseguir (cada slide en una sola lista: con captura o sin captura útil) y qué se verificó y qué no. "Verificado" es solo lo que una fuente dice que se probó en QA o en producción; que pasen los tests o una demo local no es verificar en QA. Todo lo que una fuente dice que no se probó ("no probado en la UI", "no se probó en el navegador", "sin smoke con login", "sin IA real") va en "no verificado", con su ref. Todo PR leído que no está en una slide va a descartados con su ref y su motivo. Lo que dice el resumen final coincide con el borrador.
