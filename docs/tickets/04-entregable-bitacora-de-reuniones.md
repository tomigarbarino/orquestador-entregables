# 04 · Entregable nuevo: Bitácora de reuniones

**Problema.** Los equipos escriben a mano la bitácora de sus reuniones (qué se habló, qué se decidió, quién hace qué), aunque Fathom ya tiene esa información.

**Qué cambia para la persona.** Un entregable nuevo, "Bitácora de reuniones", que arranca apagado y se prende desde Entregables o desde el perfil de equipo. Por día o por semana, lista cada reunión con:
- fecha, hora y participantes internos;
- resumen en dos o tres líneas;
- decisiones;
- próximos pasos con responsable y fecha;
- link al resumen del notetaker.

Las reuniones agendadas sin resumen van aparte, como "sin resumen", y nunca se inventa su contenido.

## Alcance técnico
- Receta `recetas/bitacora-reuniones/` (receta.yaml e instrucciones.md) con fuentes `reuniones` (ticket 03) y `calendario`. Pasos: ventana, reuniones del período, resúmenes, decisiones y próximos pasos, redactar. Control: cada reunión cita su resumen.
- Opción `opciones.periodo: dia | semana` y destino configurable (borrador, documento o Slack).
- Si el módulo de seguimiento comercial está activo, los próximos pasos con cliente se proponen al seguimiento.
- Fixture de demo y caso en `test/recetas.test.mjs` y en el smoke.

## Criterios de aceptación
- [ ] La receta valida contra el esquema y su grafo se ve completo en el visualizador.
- [ ] La corrida demo pasa el control de evidencia.
- [ ] Una corrida real semanal lista las reuniones con resumen y deja aparte las que no lo tienen.
- [ ] `npm test` y `npm run smoke` pasan.
