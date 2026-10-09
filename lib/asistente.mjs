// Asistente de entregable nuevo: de las cuatro respuestas (qué armás siempre igual, de dónde
// sale cada dato, reglas de formato y tono, cuándo corre) arma la receta y su entrada en la config.
// Sin dependencias de Node: la interfaz lo usa para dibujar el flujo a medida que se completa.

export const CONTROL_POR_DEFECTO = [
  'Cada afirmación cita al menos una evidencia de las fuentes de la receta.',
  'Se dice el estado exacto de cada cosa; nada se da por terminado sin evidencia.',
  'Si falta un dato, se dice en una línea en vez de rellenarlo.',
];

export function idDesdeNombre(nombre) {
  return String(nombre || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .replace(/^[^a-z]+/, '')
    .slice(0, 48) || 'entregable-nuevo';
}

function ventanaPara(horario) {
  if (!horario || horario.a_pedido) return 'evento';
  if ((horario.dias || []).length >= 4) return 'dia_habil_anterior';
  return 'desde_ultima_corrida';
}

const limpiar = (lista) => (lista || []).map((x) => String(x || '').trim()).filter(Boolean);

export function generarEntregable(datos) {
  const nombre = String(datos.nombre || '').trim() || 'Entregable nuevo';
  const id = datos.id && /^[a-z][a-z0-9-]*$/.test(datos.id) ? datos.id : idDesdeNombre(nombre);
  const fuentes = (datos.fuentes || []).filter((f) => f?.id).map((f) => ({ id: f.id, para: String(f.para || '').trim() || `Datos de ${f.id}` }));
  const horario = datos.horario?.a_pedido || !datos.horario?.dias?.length ? { a_pedido: true } : { dias: datos.horario.dias, hora: datos.horario.hora || '09:00' };
  const destino = { tipo: datos.destino?.tipo || 'borrador' };
  if (datos.destino?.nombre) destino.nombre = datos.destino.nombre;
  if (destino.tipo === 'slack') destino.canal = datos.destino?.canal || '#canal';
  if (['doc', 'formulario'].includes(destino.tipo) && datos.destino?.url) destino.url = datos.destino.url;
  if (destino.tipo === 'formulario' && !destino.url) destino.url = 'https://completar.example';
  const formato = String(datos.formato || '').trim() || 'Texto corto en el formato que usa la persona.';
  const reglasFormato = limpiar(datos.reglas_formato);
  const reglasTono = limpiar(datos.reglas_tono);
  const control = [...CONTROL_POR_DEFECTO, ...limpiar(datos.control)];

  const pasos = [
    { id: 'ventana', nombre: 'Definir la ventana', detalle: horario.a_pedido ? 'Lo que pida la persona; si no dice, la última semana.' : 'Desde la corrida anterior hasta hoy.' },
  ];
  if (fuentes.length) pasos.push({ id: 'evidencia', nombre: 'Juntar evidencia', detalle: 'Leer cada fuente sin barrer historiales enteros.', usa: fuentes.map((f) => f.id) });
  if (String(datos.ejemplo || '').trim()) pasos.push({ id: 'ejemplo', nombre: 'Seguir el ejemplo', detalle: 'Usar el ejemplo de la persona como molde de estructura y largo.' });
  pasos.push({ id: 'redactar', nombre: `Redactar: ${nombre}`, detalle: formato.slice(0, 160) });

  const receta = {
    id,
    nombre,
    descripcion: String(datos.que_armas || '').trim() || `${nombre}, armado a partir de las fuentes de la persona.`,
    version: 1,
    disparador: {
      tipo: horario.a_pedido ? 'a_pedido' : 'horario',
      ...(horario.a_pedido ? {} : { por_defecto: { dias: horario.dias, hora: horario.hora } }),
      ventana: ventanaPara(horario),
      frases: [`armá ${nombre.toLowerCase()}`],
    },
    fuentes: fuentes.length ? fuentes : [{ id: 'sesiones_ia', para: 'Contexto del trabajo reciente' }],
    pasos,
    control,
    destino: { por_defecto: destino.tipo, formato },
    reglas: [],
  };

  const bloques = [
    `# ${nombre}`,
    '',
    `${receta.descripcion} Lo arma {{persona.nombre}} ({{persona.equipo}}, {{persona.empresa}}). Zona horaria: {{zona_horaria}}.`,
    '',
    '## De dónde sale cada dato',
    '',
    ...receta.fuentes.map((f) => `- **${f.id}**: ${f.para}`),
    '',
    '## Formato',
    '',
    formato,
  ];
  if (String(datos.ejemplo || '').trim()) {
    bloques.push('', 'Ejemplo real (molde de estructura y largo, no de contenido):', '', '```', String(datos.ejemplo).trim(), '```');
  }
  if (reglasFormato.length || reglasTono.length) {
    bloques.push('', '## Reglas de formato y tono', '', ...reglasFormato.map((r) => `- ${r}`), ...reglasTono.map((r) => `- ${r}`));
  }
  bloques.push('', '## Reglas de redacción de la persona', '', '{{lista.reglas_redaccion}}', '', '## Al terminar', '', 'Mostrá el borrador y lo que dejaste afuera por falta de evidencia. Nada se manda sin OK.');

  const entrada = { receta: id, activo: true, fuentes: receta.fuentes.map((f) => f.id), horario, destino };
  return { id, receta, instrucciones: `${bloques.join('\n')}\n`, entrada };
}

// Config con el entregable nuevo (y las fuentes que falten, con valores del catálogo).
export function configConEntregable(config, generado, catalogo = { fuentes: {} }) {
  const nueva = JSON.parse(JSON.stringify(config || {}));
  nueva.entregables = { ...(nueva.entregables || {}), [generado.id]: generado.entrada };
  nueva.fuentes = { ...(nueva.fuentes || {}) };
  for (const fid of generado.entrada.fuentes) {
    if (nueva.fuentes[fid]) continue;
    const cat = catalogo.fuentes?.[fid];
    const via = cat?.via || 'mcp';
    nueva.fuentes[fid] = { activo: true, via, ...(via === 'mcp' && cat?.proveedores?.[0] ? { servidor: cat.proveedores[0].nombre } : {}) };
  }
  return nueva;
}
