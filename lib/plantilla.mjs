// Completa las instrucciones de una receta con los datos de la config: {{persona.nombre}},
// {{lista.proyectos}}, {{destino.campos}}, etc. Lo que falta queda como "(sin configurar)".

function obtener(obj, ruta) {
  return ruta.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}

function vinetas(items, vacio) {
  if (!items || !items.length) return vacio;
  return items.map((x) => `- ${x}`).join('\n');
}

export function contextoPlantilla(config, entregable = {}) {
  const proyectos = (config.proyectos || []).map((p) => {
    const repos = (p.repos || []).join(', ') || 'sin repos';
    const rama = p.rama_produccion || 'main';
    return `   - ${p.nombre}: ${repos} (producción: ${rama})`;
  });
  const personas = (config.personas || []).map((p) => {
    const partes = [p.nombre];
    if (p.alias) partes.push(`decir "${p.alias}"`);
    if (p.rol) partes.push(p.rol);
    if (p.nota) partes.push(p.nota);
    return partes.join(' · ');
  });
  const glosario = (config.glosario || []).map((g) => {
    const variantes = g.variantes_dictado?.length ? ` (en el dictado puede aparecer como ${g.variantes_dictado.join(', ')})` : '';
    return `**${g.termino}**${g.significa ? `: ${g.significa}` : ''}${variantes}`;
  });
  const clientes = (config.clientes || []).map((c) => `${c.nombre}${c.nota ? `: ${c.nota}` : ''}`);
  const destino = entregable.destino || {};
  const taxonomia = destino.taxonomia
    ? Object.entries(destino.taxonomia).map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(' · ') : v}`).join('\n')
    : '(el destino no define valores)';
  const fuentes = {};
  for (const [id, f] of Object.entries(config.fuentes || {})) {
    fuentes[id] = {
      ...f,
      remitentes_resumen: (f.remitentes_resumen || []).join(', ') || '(sin configurar)',
      proyectos: (f.proyectos || []).join(', ') || '(sin configurar)',
    };
  }
  return {
    persona: config.persona || {},
    idioma: config.idioma,
    zona_horaria: config.zona_horaria,
    marca: { design_system: config.marca?.design_system || '(sin design system configurado)', notas: config.marca?.notas || '' },
    fuentes,
    destino: {
      ...destino,
      nombre: destino.nombre || destino.canal || destino.tipo || 'el destino',
      campos: (destino.campos || []).join(', ') || '(los que pida el destino)',
      taxonomia,
    },
    opciones: entregable.opciones || {},
    lista: {
      proyectos: proyectos.join('\n') || '   - (sin proyectos configurados)',
      reglas_redaccion: vinetas(config.reglas_redaccion, '- (sin reglas propias)'),
      personas: vinetas(personas, '- (sin personas configuradas)'),
      glosario: vinetas(glosario, '- (sin glosario)'),
      clientes: vinetas(clientes, '- (sin clientes configurados)'),
    },
  };
}

export function completar(texto, contexto) {
  return String(texto || '').replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, ruta) => {
    const valor = obtener(contexto, ruta);
    if (valor == null || valor === '') return '(sin configurar)';
    if (Array.isArray(valor)) return valor.join(', ');
    if (typeof valor === 'object') return JSON.stringify(valor);
    return String(valor);
  });
}
