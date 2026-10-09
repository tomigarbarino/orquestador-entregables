# Daily

Guion para que {{persona.nombre}} cuente en la daily qué hizo, qué sigue y qué lo frena. Zona horaria: {{zona_horaria}}. Idioma: {{idioma}}. Solo trabajo del equipo; nada personal.

## 1. Ventana

- Por defecto: el día hábil anterior más lo que ya se hizo hoy.
- Lunes: el viernes, más el trabajo del fin de semana si quedó registrado (con su fecha real).
- Si la persona nombra un día ("qué hicimos el viernes"), usá ese.
- Días especiales de la persona (respetá su nota, por ejemplo un día libre que se cuenta con otra fecha):
{{lista.dias_especiales}}

## 2. Evidencia (solo hechos, nada inventado)

En este orden, y sin barrer historiales enteros:

1. **GitHub**: PRs mergeados, abiertos y cerrados en la ventana, en los repos de cada proyecto:
{{lista.proyectos}}
   - Fijate a qué rama se mergeó cada PR: mergeado a una rama de integración no es "en producción", salvo que `en_produccion` diga que ya llegó.
   - Contá lo que hace el PR a partir de su `cuerpo` (problema, cambios, riesgos), no solo del título.
   - Un PR cerrado sin mergear se cuenta según su `motivo_cierre`. Si dice que el código ya entró por otro PR, es "ya integrado en <rama> por #N", no "obsoleto".
   - Un PR a la rama de producción (un release o una convergencia) se cuenta por lo que llevó a producción, feature por feature: los PRs que `incluye` y, si no hay, lo que dice su `cuerpo` (qué entra, migraciones, funciones). "Convergí la línea de desarrollo" no dice nada: decí qué funciones nuevas quedaron en producción. Sus riesgos conocidos van como "Riesgo:".
   - No nombres un PR, ticket o documento que no leíste. Si el cuerpo dice que algo "va en un PR aparte", es un pendiente ("falta hacer el arreglo"), no un PR en curso.
2. **Sesiones de IA**: usá los `hitos` que caen en la ventana (cada pedido con su cierre, ya partidos por día) y los `pendientes`. No uses los transcripts enteros. Una sesión de varios días se cuenta solo por los hitos de la ventana.
   - Cada hito con entrega (un documento, una auditoría, un deploy, un PR) va al guion o a descartados con su motivo, aunque la misma sesión ya respalde otro ítem. Que la sesión esté citada no alcanza para dar por contado cada hito.
   - Si `leer_sesiones` o `leer_github` traen `siguiente`, pedí todas las páginas antes de redactar.
   - Una sesión sin entrega (solo una explicación, un intento bloqueado, algo que se revirtió o se borró) no cuenta como avance. Si la persona pidió borrar u ocultar lo hecho, no se cuenta.
   - El proyecto sale del repo o del tema que nombra el pedido, no de la carpeta desde la que corrió la sesión.
   - Si el cierre de una sesión es sobre todo un prompt o una especificación, es "pedido redactado", no implementación.
   - Si un PR a la rama de producción tiene una sesión ligada con deploy y prueba de humo, el estado es "desplegado y verificado en producción" y esa sesión es la evidencia.
3. **Registros de trabajo**, si la fuente está activa. Excluí los que digan que no se reportan.
4. **Calendario**: solo para confirmar fechas. No deduzcas trabajo de reuniones agendadas.
5. **Chat**: bloqueos o pedidos concretos que mencionen a la persona.

Lo que leas con conectores (calendario, chat) registralo con `registrar_lectura`, con las refs que leíste.

Convertí las fechas de UTC a {{zona_horaria}} antes de asignar el día.

## 3. Formato

Guion en primera persona, de **200 palabras como máximo** (sin contar notas). Tres bloques y nada más:

1. **Hecho**: lo terminado, agrupado por proyecto, no PR por PR. Cada arreglo, por cómo funciona ahora.
2. **Pendiente / hoy**: lo que sigue y las prioridades con evidencia. Lo abierto o en curso va solo acá, nunca también en Hecho. Incluí los pendientes que dejaron las sesiones de la ventana (lo que falta configurar, verificar o decidir).
3. **Bloqueos y riesgos**: cada línea dice qué frena y de quién depende ("espera mi OK", "depende de que yo cambie la configuración a mano", "falta que el cliente responda"). Un riesgo conocido que se aceptó al publicar no frena nada: va como "Riesgo:" con la decisión que falta, si la hay. Una dependencia escondida dentro de un pendiente (algo que solo puede hacer la persona u otra persona) se nombra acá.

Decí el estado exacto de cada cosa: en producción, mergeado (y a qué rama), en preview, local, investigación o pendiente. Un documento o una presentación lleva su estado (local, privado, compartido, presentado). No digas "cerré" ni "terminé" algo cuya fuente nombra pasos que faltan (una decisión, una reunión, la respuesta del cliente): decí qué hiciste y pasá lo que falta a Pendiente.

En Hecho no van paréntesis con lo que falta ("mergeado; falta probarlo"): lo que falta va solo en Pendiente.

Pendientes, bloqueos y riesgos en lenguaje llano, para gente ajena al proyecto, en toda la frase y no solo en la primera mitad. Por ejemplo: "Publicar en producción la carga de búsquedas y el arreglo del link de entrevista (esperan mi OK)", y no "mergear a main los tres release" ni "aplicar 5 migraciones y mergear 3 PR". "Prueba completa en producción" y no "smoke test"; "no hay forma de activar funciones por empresa" y no "sin flags"; "cualquiera puede ver la lista de archivos sin iniciar sesión" y no "buckets listables".

Las notas de proceso (qué fuente faltó, qué no se pudo verificar) no van en el guion: van en `faltantes`.

## Reglas de redacción de la persona

{{lista.reglas_redaccion}}

## Cómo nombrar a la gente

{{lista.personas}}

## Al terminar

Mostrá el guion. Si falta evidencia de algún día, decilo en una línea en vez de rellenar. Todo lo leído que no está en el guion va a descartados con su ref (tal como vino) y un motivo que cita entre comillas lo que dice la fuente; si además lo dejás afuera por largo o por alcance, decilo después de la cita. Los conteos que reportes (sesiones, PRs, repos, descartados) son los de lo registrado en la corrida.
