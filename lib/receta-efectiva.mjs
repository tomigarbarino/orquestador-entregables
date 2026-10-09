// Combina config + recetas + módulos activos en lo que realmente corre.
// Sin dependencias de Node: la interfaz la usa para dibujar el flujo y las vistas previas.

export function modulosActivos(config, modulos) {
  return (modulos || []).filter((m) => config?.modulos?.[m.clave]?.activo);
}

function horarioPorDefecto(receta) {
  const d = receta?.disparador;
  if (d?.tipo === 'horario' && d.por_defecto?.dias?.length && d.por_defecto?.hora) {
    return { dias: d.por_defecto.dias, hora: d.por_defecto.hora };
  }
  return { a_pedido: true };
}

// Lista de entregables efectivos (los de la config más los que aporta un módulo activo).
export function entregablesDe(config, recetas, modulos) {
  const lista = [];
  const deModulo = new Map((modulos || []).filter((m) => m.tipo === 'entregable').map((m) => [m.id, m]));
  for (const [id, e] of Object.entries(config?.entregables || {})) {
    const base = recetas?.[e.receta];
    const modulo = deModulo.get(e.receta);
    lista.push({
      id,
      receta: e.receta,
      nombre: e.nombre || base?.receta?.nombre || id,
      activo: Boolean(e.activo) && (!modulo || Boolean(config?.modulos?.[modulo.clave]?.activo)),
      fuentes: e.fuentes || base?.receta?.fuentes?.map((f) => f.id) || [],
      horario: e.horario || horarioPorDefecto(base?.receta),
      destino: e.destino || { tipo: base?.receta?.destino?.por_defecto || 'borrador' },
      opciones: e.opciones || {},
      modulo: modulo?.id || null,
      existeReceta: Boolean(base),
    });
  }
  for (const m of modulosActivos(config, modulos).filter((x) => x.tipo === 'entregable')) {
    if (lista.some((e) => e.receta === m.id)) continue;
    const d = m.entregable_por_defecto || {};
    lista.push({
      id: m.id,
      receta: d.receta || m.id,
      nombre: m.nombre,
      activo: true,
      fuentes: d.fuentes || [],
      horario: d.horario || { a_pedido: true },
      destino: d.destino || { tipo: 'borrador' },
      opciones: {},
      modulo: m.id,
      implicito: true,
      existeReceta: Boolean(recetas?.[d.receta || m.id]),
    });
  }
  return lista;
}

// La receta tal como corre para un entregable: fuentes filtradas por la config,
// pasos de los módulos activos insertados e instrucciones de los módulos sumadas.
export function recetaEfectiva(entregable, config, recetas, modulos) {
  const base = recetas?.[entregable.receta];
  if (!base) return null;
  const r = JSON.parse(JSON.stringify(base.receta));
  r.reglas = r.reglas || [];

  if (Array.isArray(entregable.fuentes) && entregable.fuentes.length) {
    const pedidas = entregable.fuentes;
    const conservadas = r.fuentes.filter((f) => pedidas.includes(f.id));
    const extra = pedidas
      .filter((id) => !r.fuentes.some((f) => f.id === id))
      .map((id) => ({ id, para: 'Fuente sumada en la configuración' }));
    r.fuentes = [...conservadas, ...extra];
  }

  const activas = new Set(r.fuentes.map((f) => f.id));
  let instrucciones = base.instrucciones || '';
  const aplicados = [];

  for (const m of modulosActivos(config, modulos).filter((x) => x.tipo === 'extension')) {
    const registros = [...(m.aplica_a?.[r.id] || []), ...(m.aplica_a?.['*'] || [])];
    if (!registros.length) continue;
    aplicados.push(m.id);
    for (const f of m.fuentes || []) {
      if (!activas.has(f)) {
        r.fuentes.push({ id: f, para: `Módulo: ${m.nombre}`, modulo: m.id });
        activas.add(f);
      }
    }
    for (const reg of registros) {
      const paso = { ...reg.paso, modulo: m.id };
      let indice = r.pasos.length;
      if (reg.antes_de) {
        const i = r.pasos.findIndex((p) => p.id === reg.antes_de);
        if (i >= 0) indice = i;
      } else if (reg.despues_de) {
        const i = r.pasos.findIndex((p) => p.id === reg.despues_de);
        if (i >= 0) indice = i + 1;
      }
      r.pasos.splice(indice, 0, paso);
    }
    if (m.instrucciones_texto) instrucciones += `\n\n${m.instrucciones_texto}`;
  }

  r.pasos = r.pasos.map((p) => (p.usa ? { ...p, usa: p.usa.filter((u) => activas.has(u)) } : p));

  return {
    receta: r,
    instrucciones,
    horario: entregable.horario || horarioPorDefecto(r),
    destino: entregable.destino || { tipo: r.destino?.por_defecto || 'borrador' },
    modulos: aplicados,
  };
}

export function nombreDestino(destino) {
  if (!destino) return 'Borrador';
  const tipos = { borrador: 'Borrador en el chat', slack: 'Slack', doc: 'Documento', formulario: 'Formulario' };
  const base = tipos[destino.tipo] || destino.tipo;
  if (destino.tipo === 'slack' && destino.canal) return `${base} · ${destino.canal}`;
  if (destino.nombre) return `${base} · ${destino.nombre}`;
  return base;
}
