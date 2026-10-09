# Bitácora de reuniones

Bitácora de las reuniones de {{persona.nombre}} ({{persona.equipo}}): qué se habló, qué se decidió y quién hace qué. Zona horaria: {{zona_horaria}}. Idioma: {{idioma}}. Solo lo que dicen los resúmenes del notetaker; nada se inventa.

## 1. Período

- `opciones.periodo` de este entregable: {{opciones.periodo}}.
  - `dia`: hoy.
  - `semana`: los últimos siete días. Es lo que corresponde si la opción no está configurada.
- La ventana que devuelve `preparar_corrida` ya aplica ese período; usá sus fechas. Si la persona nombra un día o un rango ("la bitácora del martes"), usá ese.
- Días especiales de la persona:
{{lista.dias_especiales}}

## 2. Evidencia

1. **Calendario**: las reuniones del período, con fecha y hora (convertidas de UTC a {{zona_horaria}}) y los participantes con el nombre del detalle del evento. Nunca se deduce un nombre de una dirección de mail; sin nombre a la vista, va la dirección. Son participantes internos los del dominio de la empresa; los externos no se listan (si hace falta, "con un cliente").
2. **Reuniones (notetaker)**: el resumen de cada reunión (Fathom o el mail de resumen de {{fuentes.reuniones.remitentes_resumen}}), con su ref (`reunion:<id>` o `mail:<id>`). Emparejá cada resumen con su evento por fecha, hora y título.
3. **Decisiones y próximos pasos**: salen solo del resumen. Cada próximo paso lleva responsable y fecha; si el resumen no dice quién o cuándo, escribí "sin responsable" o "sin fecha". No deduzcas ni estimes.

Lo que leas con conectores registralo con `registrar_lectura` (una llamada por fuente y búsqueda: `calendario` y `reuniones`), con todas las refs que leíste, con la forma que indica `como_referenciar`. Nunca envíes ni respondas mensajes: solo lectura.

## 3. Formato

Por cada reunión con resumen, en orden cronológico:

- **Título**, fecha y hora.
- **Participantes**: internos, con su nombre.
- **Resumen**: dos o tres líneas, solo lo que dice el resumen.
- **Decisiones**: lista; si no hubo, "sin decisiones registradas".
- **Próximos pasos**: cada uno con responsable y fecha (o "sin responsable" / "sin fecha").
- **Resumen del notetaker**: la ref (`reunion:<id>` o `mail:<id>`) y el link si la fuente lo trae.

Al final, **Sin resumen**: las reuniones agendadas que no tienen resumen, con título, fecha, hora y la respuesta de la persona si se sabe. Sin contenido: no se dice qué se habló ni se supone que ocurrió. Si no hay ninguna, no pongas el bloque.

Las notas de proceso (qué fuente faltó, qué no se pudo verificar) no van en la bitácora: van en `faltantes`.

## Reglas de redacción de la persona

{{lista.reglas_redaccion}}

## Cómo nombrar a la gente

{{lista.personas}}

## Al terminar

Mostrá la bitácora. Todo lo leído que no está en ella (eventos que no son reuniones, resúmenes que no se pudieron emparejar) va a descartados con su ref tal como vino y un motivo que cita entre comillas lo que dice la fuente. Los conteos que reportes (reuniones, resúmenes, sin resumen, descartados) son los de lo registrado en la corrida.
