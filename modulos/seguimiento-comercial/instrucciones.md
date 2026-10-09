## Módulo: seguimiento de próximos pasos comerciales

Este módulo está activo.

- En **notas de reunión comercial**: después de redactar la ficha, armá la lista de próximos pasos con `responsable` (de la persona, del equipo o del cliente) y `fecha` límite. Si la fecha no se dijo, poné la que se deduce del texto ("la semana que viene") y marcala como estimada. Pasala a `seguimiento_guardar` junto con el cliente y la fecha de la reunión. En modo borrador, `seguimiento_guardar` solo propone: el seguimiento se actualiza cuando la persona aprueba la ficha.
- En la **daily**: llamá a `seguimiento_listar` y sumá al bloque "Pendiente / hoy" los compromisos que vencen hoy o ya vencieron, con cliente, responsable y fecha. Si no hay, no agregues nada.
