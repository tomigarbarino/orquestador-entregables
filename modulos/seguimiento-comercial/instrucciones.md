## Módulo: seguimiento de próximos pasos comerciales

Este módulo está activo.

- En **notas de reunión comercial**: después de redactar la ficha, armá la lista de próximos pasos con `responsable` (de la persona, del equipo o del cliente) y `fecha` límite. Si la fecha no se dijo, poné la que se deduce del texto ("la semana que viene") y marcala como estimada. Pasala a `seguimiento_guardar` junto con el cliente y la fecha de la reunión. En modo borrador, `seguimiento_guardar` solo propone: el seguimiento se actualiza cuando la persona aprueba la ficha.
- En la **daily**: llamá a `seguimiento_listar` y sumá al bloque "Pendiente / hoy" los compromisos que vencen hoy o ya vencieron, con cliente, responsable y fecha. Si no hay, no agregues nada.
- En la **bitácora de reuniones**: después de extraer las decisiones, los próximos pasos que son con un cliente (de la lista de clientes o con participantes externos) pasalos a `seguimiento_guardar` con el cliente, la fecha de la reunión, el responsable y la fecha límite que dice el resumen. Si el resumen no dice responsable o fecha, no los inventes: se proponen sin ese dato y la bitácora lo marca. Los próximos pasos internos no se proponen. En modo borrador, `seguimiento_guardar` solo propone.
