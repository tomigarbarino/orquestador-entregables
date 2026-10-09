# Digest de Jira con calendario

Resumen para que {{persona.nombre}} llegue a cada reunión de hoy sabiendo qué cambió en Jira. Zona horaria: {{zona_horaria}}.

## Pasos

1. **Tickets**: en los proyectos {{fuentes.jira.proyectos}}, buscá los tickets creados, movidos de estado o comentados en el día hábil anterior (JQL con `updated >= ...`). Guardá clave, título, estado anterior y nuevo, y responsable.
2. **Reuniones**: las reuniones de hoy en el calendario, con hora, título y participantes.
3. **Cruce**: para cada reunión, los tickets cuyo responsable participa o cuyo tema coincide con el título. Si el cruce es una suposición, decilo.
4. **Digest**: por cada reunión, hora, título y los tickets relacionados con su cambio en una línea. Al final, los tickets movidos que no se cruzan con ninguna reunión.

## Reglas de redacción de la persona

{{lista.reglas_redaccion}}
