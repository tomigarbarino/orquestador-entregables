// Contrato cerrado: la IA elige registros. La redacción y los enlaces salen de
// la fuente, nunca de texto libre del modelo. No certifica borradores arbitrarios.
export const esquemaSeleccion = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: { items: { type: 'array', minItems: 1, maxItems: 3, items: {
    type: 'object', additionalProperties: false, required: ['id', 'estado'],
    properties: { id: { type: 'string', enum: ['C1', 'C2', 'C3'] }, estado: { type: 'string', enum: ['en_main'] } },
  } } },
};

export function controlarSeleccion(paquete, salida) {
  const errores = [];
  const registros = [];
  let seleccion;
  try { seleccion = typeof salida === 'string' ? JSON.parse(salida) : salida; }
  catch { return { ok: false, errores: ['La salida no es JSON válido.'], registros: [], borrador: null }; }
  if (!seleccion || typeof seleccion !== 'object' || Array.isArray(seleccion) ||
      Object.keys(seleccion).some((k) => k !== 'items') || !Array.isArray(seleccion.items) ||
      seleccion.items.length < 1 || seleccion.items.length > 3) {
    return { ok: false, errores: ['Se necesita una selección de 1 a 3 registros, sin campos libres.'], registros: [], borrador: null };
  }
  const ids = new Set();
  for (const item of seleccion.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        Object.keys(item).sort().join(',') !== 'estado,id') {
      errores.push('Registro fuera del contrato: solo se admiten id y estado.'); continue;
    }
    const fuente = paquete.fuentes.find((f) => f.id === item.id);
    if (!fuente) { errores.push(`Referencia desconocida: ${String(item.id)}.`); continue; }
    if (ids.has(item.id)) { errores.push(`Referencia duplicada: ${item.id}.`); continue; }
    ids.add(item.id);
    if (item.estado !== 'en_main' || fuente.estado !== 'en_main') {
      errores.push(`${item.id}: «${String(item.estado)}» no está respaldado. El snapshot solo acredita que el commit está en main; no verifica despliegues.`); continue;
    }
    registros.push(fuente);
  }
  if (errores.length) return { ok: false, errores, registros: [], borrador: null };
  const borrador = [
    '# Avance con evidencia', '',
    `Snapshot público: ${paquete.capturado_en}. Base: ${paquete.head.slice(0, 7)}.`, '',
    ...registros.map((f) => `- **En main** — ${f.titulo}\n  Evidencia: ${f.url}`), '',
    'Pendiente: revisar relevancia y redacción. El despliegue a producción no fue verificado.',
    'Borrador para revisión humana. No se envió ni se publicó ningún mensaje.',
  ].join('\n');
  return { ok: true, errores: [], registros, borrador };
}

export function salidaConFallo(salida) {
  const copia = JSON.parse(salida);
  copia.items[0].estado = 'desplegado';
  return JSON.stringify(copia, null, 2);
}
