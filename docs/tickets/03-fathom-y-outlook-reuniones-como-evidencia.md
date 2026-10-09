# 03 · Fathom y Outlook: las reuniones pasan a contar como evidencia

**Problema.** La mayoría de los equipos usa Fathom para resumir las reuniones, pero el orquestador solo lo usa en la reunión comercial. Como un evento de calendario no prueba que una reunión ocurrió, la daily y el registro de tareas hoy no pueden contar reuniones, ni las tareas que se asignaron en ellas.

**Qué cambia para la persona.**
- En Conectores aparece "Reuniones (notetaker)". Se lee del conector de Fathom en claude.ai si está autorizado, o de los mails de resumen en Outlook si no.
- Una reunión con resumen se cuenta con lo que se decidió ("Participé de X; se decidió Y"), citando el resumen. Sin resumen, sigue sin contarse.
- Las tareas asignadas en una reunión entran en "Pedidos que me llegaron" (ticket 02).

## Alcance técnico
- Catálogo: fuente `reuniones` con proveedores Fathom (conector MCP, herramientas de lectura) y Outlook (`outlook_email_search` y `read_resource`, filtrando por `remitentes_resumen`). Elige el proveedor conectado y avisa cuál usa.
- Config por equipo: `notetaker` (fathom, read_ai u otro) y `remitentes_resumen`.
- Recetas `daily` y `registro-tareas`: la regla "no deducir trabajo de reuniones agendadas" pasa a "una reunión cuenta solo con resumen del notetaker". `reunion-comercial` usa la fuente nueva.
- Las refs de reunión (`reunion:<id>` o `mail:<id>`) se registran con `registrar_lectura` y se verifican en el control.

## Criterios de aceptación
- [ ] Sin el conector de Fathom, la fuente funciona leyendo los resúmenes desde Outlook y lo dice en el detalle.
- [ ] Una daily real con una reunión resumida la cuenta con su decisión y cita el resumen. Una reunión sin resumen no aparece en Hecho.
- [ ] Las tareas asignadas a la persona en el resumen aparecen como pedidos, con su responsable y fecha si los tienen.
- [ ] `npm test` y `npm run smoke` pasan.
