# Daily

Guion para que {{persona.nombre}} cuente en la daily qué hizo, qué sigue y qué lo frena. Zona horaria: {{zona_horaria}}. Idioma: {{idioma}}. Solo trabajo del equipo; nada personal.

## 1. Ventana

- Por defecto: el día hábil anterior más lo que ya se hizo hoy.
- Lunes: el viernes, más el trabajo del fin de semana si quedó registrado (con su fecha real).
- Si la persona nombra un día ("qué hicimos el viernes"), usá ese.

## 2. Evidencia (solo hechos, nada inventado)

En este orden, y sin barrer historiales enteros:

1. **GitHub**: PRs mergeados y abiertos en la ventana, en los repos de cada proyecto:
{{lista.proyectos}}
   Fijate a qué rama se mergeó cada PR: mergeado a una rama de integración no es "en producción".
2. **Sesiones de IA**: tomá solo los pedidos y los cierres de cada sesión, no los transcripts enteros. Una sesión sin entrega (solo una explicación, un intento bloqueado) no cuenta como avance.
3. **Registros de trabajo**, si la fuente está activa. Excluí los que digan que no se reportan.
4. **Calendario**: solo para confirmar fechas. No deduzcas trabajo de reuniones agendadas.
5. **Chat**: bloqueos o pedidos concretos que mencionen a la persona.

Convertí las fechas de UTC a {{zona_horaria}} antes de asignar el día.

## 3. Formato

Guion en primera persona, para decir en 60 a 90 segundos. Tres bloques:

1. **Hecho**: lo terminado, agrupado por proyecto, no PR por PR.
2. **Pendiente / hoy**: lo que sigue y las prioridades con evidencia.
3. **Bloqueos**: qué frena y de quién depende (un acceso, una decisión, otra persona).

Decí el estado exacto de cada cosa: en producción, mergeado, en preview, local, investigación o pendiente.

## Reglas de redacción de la persona

{{lista.reglas_redaccion}}

## Cómo nombrar a la gente

{{lista.personas}}

## Al terminar

Mostrá el guion. Si falta evidencia de algún día, decilo en una línea en vez de rellenar.
