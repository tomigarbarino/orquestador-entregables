# Orquestador de entregables

Una plantilla para que cada equipo deje andando, con Claude, los entregables que arma siempre igual: la daily, el registro de tareas y horas, el deck de avance semanal, las notas de cada reunión comercial, la bitácora de reuniones y los que sumes vos.

**Probá la demo pública, con datos ficticios:** https://orquestador-entregables.vercel.app

Todo se configura, se ve y se ajusta desde una interfaz web local, incluso charlando con Claude. No hace falta editar archivos a mano.

![El visualizador: fuentes, orquestador, entregables y destinos, generado desde tu configuración](docs/capturas/01-visualizador-general.png)

## Qué es

- **Recetas.** Cada entregable tiene una receta con cinco partes: disparador (cuándo corre), fuentes (de dónde salen los datos), pasos, control de evidencia y destino. La interfaz las dibuja y el orquestador las ejecuta.
- **Tu configuración.** Tu nombre, tu equipo, tus proyectos, tus fuentes, tus horarios y tus reglas de redacción viven en un archivo tuyo (`mi-espacio/config.yaml`) que nunca se sube al repo.
- **Una interfaz web local** para editar todo, ver el flujo, probar un entregable y pedir cambios en un chat con Claude.
- **Un orquestador** (una skill de Claude Code) que decide qué entregable toca, revisa qué fuentes están conectadas, corre la receta y entrega un borrador.

Tres reglas que no se negocian:

1. **Todo sale como borrador.** Nada se manda ni se carga en otro sistema sin tu OK.
2. **Si no hay evidencia, no se cuenta.** Cada afirmación del borrador tiene que estar respaldada por algo que se leyó (un PR, una sesión, un evento). Lo que no, queda afuera y se dice por qué.
3. **Tus credenciales no pasan por acá.** La autorización queda en manos de Claude Code y del GitHub CLI. Ni la configuración ni el navegador guardan tokens.

## Cómo se ve

**Probar ahora.** El entregable corre en modo borrador y el visualizador muestra en vivo el paso en curso. Las fuentes se pintan de verde o de rojo según estén conectadas.

![Una corrida en curso: el paso actual resaltado](docs/capturas/02-visualizador-corriendo.png)

Al terminar, cada nodo dice qué encontró (por ejemplo "4 PRs en 2 repos" o "3 reuniones") o por qué falló, y abajo aparece el borrador con su evidencia.

![El resultado de la corrida](docs/capturas/03-visualizador-resultado.png)

![El borrador](docs/capturas/04-borrador.png)

**Pedir un cambio charlando.** Leés el borrador y le pedís a Claude cosas como "esto sobra", "sumá los tickets de Jira" o "que sea más corto". Antes de aplicar nada, el visualizador muestra qué nodos se agregan, se quitan o cambian. Cada corrección queda escrita como regla de la receta, con su fecha, para que no se repita.

![Un cambio propuesto por el chat, antes de aplicarlo](docs/capturas/05-cambio-propuesto.png)

**Sumar un entregable propio** con cuatro preguntas: qué armás siempre igual, de dónde sale cada dato, reglas de formato y tono, y cuándo corre. El flujo se dibuja mientras respondés.

![El asistente de entregable nuevo](docs/capturas/06-asistente.png)

**Conectores y entregables.**

![Conectores](docs/capturas/07-conectores.png)

![Entregables](docs/capturas/08-entregables.png)

## Qué necesitás

- Una computadora con Windows o Mac.
- [Node.js](https://nodejs.org) 20 o más nuevo (la versión LTS) y [git](https://git-scm.com).
- Una cuenta de Claude con acceso a Claude Code. El instalador instala Claude Code si no lo tenés.
- Opcional: el [GitHub CLI](https://cli.github.com) para leer PRs y [Ollama](https://ollama.com) para el resumen con modelo local.

## Instalación

### Windows

1. Instalá Node.js y git (los dos con las opciones por defecto).
2. Abrí PowerShell y bajá el repo:

   ```powershell
   git clone https://github.com/tomigarbarino/orquestador-entregables.git
   cd orquestador-entregables
   ```

3. Corré el instalador:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\instalar.ps1
   ```

### Mac

1. Instalá Node.js desde [nodejs.org](https://nodejs.org) (o con `brew install node`). git viene con las herramientas de Xcode: si no lo tenés, `xcode-select --install`.
2. Abrí la Terminal y bajá el repo:

   ```bash
   git clone https://github.com/tomigarbarino/orquestador-entregables.git
   cd orquestador-entregables
   ```

3. Corré el instalador:

   ```bash
   bash scripts/instalar.sh
   ```

### Qué hace el instalador

1. Revisa que tengas Node, git y Claude Code (si falta Claude Code, lo instala).
2. Enlaza las skills `orquestador-entregables` y `nuevo-entregable` en `~/.claude/skills`, para que Claude Code las encuentre. Si ya tenés una skill con ese nombre, no la toca.
3. Registra el servidor del orquestador en Claude Code (`claude mcp add`), que es el que le da a Claude las herramientas para leer tu config, tus fuentes y guardar borradores.
4. Crea tu espacio (`mi-espacio/`) con una configuración de ejemplo.
5. Abre la interfaz en el navegador.

Si Claude Code todavía no tiene una sesión iniciada, abrí una terminal y corré:

```bash
claude auth login
```

Para ver qué haría el instalador sin cambiar nada: `node scripts/instalar.mjs --revisar`. Para deshacerlo: `node scripts/instalar.mjs --desinstalar` (tu espacio no se borra).

## Tu primer entregable en 15 minutos

1. **Abrí la interfaz** (2 minutos). Desde la carpeta del repo:

   ```bash
   npm start
   ```

   Se abre en `http://127.0.0.1:4317`. Si primero querés ver cómo funciona sin conectar nada, corré `npm run demo`: usa datos ficticios y no gasta nada.

2. **Perfil** (3 minutos). Tu nombre, tu equipo, tu zona horaria, tus proyectos con sus repos (como `dueño/repo`) y tus reglas de redacción ("frases cortas", "sin emojis", "decir el estado exacto de cada cosa").

3. **Conectores** (4 minutos).
   - GitHub: si está en rojo, corré `gh auth login` en una terminal.
   - Calendario, mail o chat: conectalos en [la configuración de conectores de claude.ai](https://claude.ai/settings/connectors) (Microsoft 365, Google, Slack o Atlassian), autorizalos con tu cuenta y tocá **Revisar de nuevo**.
   - Slack y Teams son fuentes propias: se conectan por separado y cada entregable las suma o las saca cuando quiere.
   - Reuniones: la fuente lee el resumen de tu notetaker, con Fathom (conectalo en claude.ai) o, si no, con los mails de resumen que te llegan a Outlook (conectá Microsoft 365). Una reunión cuenta solo si tiene resumen; las que no lo tienen quedan aparte, como "sin resumen".
   - Las sesiones de Claude Code y Codex se leen de tu máquina: no hay que conectar nada.

4. **De dónde te llegan las tareas** (opcional, en Perfil). Marcá dónde te piden cosas (un canal de Slack, ciertos remitentes de mail, un repo). Con eso, la daily y el registro de tareas suman el paso "Pedidos que me llegaron": qué te pidieron, quién y cuándo, separado en hecho y pendiente.

5. **Entregables** (1 minuto). Dejá prendida la daily y elegí sus fuentes.

6. **Probala** (3 minutos). En el **Visualizador**, elegí **Por entregable** → Daily → **Probar ahora**. Mirá cómo avanza nodo por nodo y leé el borrador.

7. **Ajustala charlando** (2 minutos). En el chat de la derecha pedí lo que no te cierra ("esto sobra", "que el bloque de pendientes vaya primero"). Mirá la diferencia en el flujo, tocá **Aplicar** y **Probar de nuevo**.

## Sumar un entregable propio

Pensá en algo que armás siempre igual: el mail de los viernes a cada cliente, el informe mensual de horas, el resumen de incidentes de la semana. Después, cualquiera de estas tres vías:

- **Nuevo entregable** en la interfaz: cuatro pasos con formulario y el flujo dibujándose al costado.
- **Completar charlando**: el mismo asistente, pero respondiendo en el chat.
- **Desde Claude Code**: "quiero sumar un entregable nuevo" (usa la skill `nuevo-entregable`).

Las tres generan la receta en `mi-espacio/recetas/<id>/` y su entrada en tu config, y te muestran el cambio antes de aplicarlo.

## Usarlo desde Claude Code

Con las skills instaladas, en cualquier sesión de Claude Code podés pedir:

- "armá la daily"
- "armá lo de hoy" (corre lo que toca según tu horario)
- "qué entregables tocan hoy"
- "programá las rutinas"

El orquestador avisa qué fuentes faltan, corre la receta, aplica el control de evidencia y te muestra el borrador. Si lo aprobás, recién ahí lo entrega en su destino (Slack, un documento o un formulario), con tu OK. Mientras corre, el visualizador de la interfaz muestra en qué paso está.

## Bitácora de reuniones

Un entregable que arma la bitácora de tus reuniones: por cada una, lo que se habló, lo que se decidió, quién hace qué y el link al resumen. Se arma por día o por semana: en **Entregables → Editar** elegís el **Período** (Por día o Por semana). Una reunión sin resumen no se cuenta: queda aparte, con su fecha y su título, sin inventar qué se habló.

## Perfil de equipo

Si varias personas arman los mismos entregables, pueden compartir una base. En **Perfil** exportás un archivo `equipo.yaml` con lo que el equipo comparte (las fuentes, los entregables con sus horarios y de dónde les llegan las tareas) y sin datos personales: ni tu nombre, ni mails, ni carpetas. Cada integrante lo importa en su espacio y ajusta encima lo suyo. La interfaz marca qué viene del equipo.

## Rutinas programadas

En **Entregables → Rutinas programadas** ves el plan (qué tarea se crea, qué días y a qué hora) y lo aplicás con un clic. En Windows se crean tareas en el Programador de tareas; en Mac y Linux, líneas en tu crontab. También desde la consola:

```bash
node scripts/programar.mjs
```

Las rutinas corren en tu computadora: tiene que estar prendida y Claude Code con sesión iniciada. Cada una deja su borrador en la interfaz; ninguna manda nada.

## Módulos opcionales

Vienen apagados. Se prenden en **Entregables → Módulos opcionales**:

- **Digest de Jira con calendario**: un entregable nuevo que cruza los tickets que se movieron con las reuniones del día.
- **Seguimiento de próximos pasos comerciales**: cada próximo paso de una reunión queda con responsable y fecha, y la daily avisa cuáles vencen.
- **Resumen con modelo local**: antes de redactar, un modelo que corre en tu máquina con Ollama resume lo más voluminoso, sin que esos datos salgan de la computadora.

## Cómo está armado

Detalle por funcionalidad, flujo de una corrida, validación y riesgos conocidos: [docs/funcionalidades.md](docs/funcionalidades.md).

```
recetas/             recetas genéricas: daily, registro-tareas, deck-avance, reunion-comercial, bitacora-reuniones
modulos/             vueltas de tuerca opcionales
esquema/             esquemas de la config y de las recetas (los usan la interfaz y el orquestador)
conectores/          catálogo de fuentes y sus herramientas de solo lectura
skills/              skills de Claude Code: orquestador-entregables y nuevo-entregable
mcp/servidor.mjs     servidor MCP del orquestador
servidor/            servidor de la interfaz (solo escucha en 127.0.0.1)
web/                 la interfaz (React y React Flow)
lib/                 lógica compartida: recetas, grafo, horarios, validación, corridas
scripts/             instalador, corridas por consola, rutinas, validación, escaneo y capturas
config.example.yaml  configuración de ejemplo con una persona y una empresa ficticias
mi-espacio/          tu espacio (no se sube): config.yaml, recetas propias, corridas e historial
```

Comandos útiles:

| Comando | Qué hace |
|---|---|
| `npm start` | Abre la interfaz con tu espacio |
| `npm run demo` | Abre la interfaz con datos ficticios, sin gastar nada |
| `npm run validar` | Valida tu config y tus recetas |
| `npm run correr -- daily` | Corre un entregable en modo borrador desde la consola |
| `npm run programar` | Muestra (o aplica, con `-- --aplicar`) las rutinas |
| `npm test` | Corre los tests |
| `npm run smoke` | Prueba de punta a punta con la config de ejemplo (sin tocar tu espacio) |
| `npm run escanear` | Busca datos personales antes de publicar cambios al repo |

## Seguridad y privacidad

- La interfaz escucha solo en `127.0.0.1` y rechaza pedidos de otras páginas.
- El chat solo puede leer tu config y tus recetas y **proponer** cambios: no tiene shell ni acceso a otros archivos, y nunca aplica nada solo.
- Las corridas solo tienen permitidas las herramientas del orquestador y las de **solo lectura** de cada conector (están listadas en `conectores/catalogo.yaml`). No pueden mandar mensajes ni cargar datos.
- Los botones de la interfaz ejecutan acciones fijas (por ejemplo, `claude mcp add` con argumentos validados), nunca comandos libres.
- Cada cambio de tu config y tus recetas queda versionado con git en tu espacio y se puede deshacer desde **Historial**.
- Tu espacio está en el `.gitignore`: si hacés un fork y subís cambios, tus datos no viajan.

## Problemas frecuentes

- **"Claude Code no tiene una sesión iniciada"**: corré `claude auth login` en una terminal y tocá **Revisar de nuevo** en Conectores.
- **Una fuente aparece en rojo**: en Conectores está el motivo y cómo conectarla. Para los conectores de claude.ai, el nombre que figura en `claude mcp list` tiene que coincidir con el campo "Nombre del conector" de la fuente.
- **GitHub dice "sin acceso" a un repo**: revisá que el nombre sea `dueño/repo` y que tu cuenta de `gh` tenga permiso de lectura.
- **El borrador dice que hay afirmaciones sin evidencia**: es el control haciendo su trabajo. Revisá qué fuente faltó y conectala, o pedile al chat que ajuste la receta.

## Licencia

MIT. Ver [LICENSE](LICENSE).

