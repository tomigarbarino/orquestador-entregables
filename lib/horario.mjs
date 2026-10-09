// Horarios, ventanas y "qué toca hoy". Sin dependencias de Node: lo usa también la interfaz.

export const DIAS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];
export const NOMBRE_DIA = {
  lun: 'Lunes', mar: 'Martes', mie: 'Miércoles', jue: 'Jueves', vie: 'Viernes', sab: 'Sábado', dom: 'Domingo',
};
const DESDE_INGLES = { Mon: 'lun', Tue: 'mar', Wed: 'mie', Thu: 'jue', Fri: 'vie', Sat: 'sab', Sun: 'dom' };

// Fecha, día y hora actuales en la zona horaria de la persona.
export function ahoraEn(zona, fecha = new Date()) {
  const formato = new Intl.DateTimeFormat('en-US', {
    timeZone: zona || 'UTC',
    weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const p = Object.fromEntries(formato.formatToParts(fecha).map((x) => [x.type, x.value]));
  const hh = p.hour === '24' ? '00' : p.hour;
  return {
    dia: DESDE_INGLES[p.weekday],
    fecha: `${p.year}-${p.month}-${p.day}`,
    hora: `${hh}:${p.minute}`,
    minutos: Number(hh) * 60 + Number(p.minute),
  };
}

export function sumarDias(fechaISO, n) {
  const d = new Date(`${fechaISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diaDeFecha(fechaISO) {
  const d = new Date(`${fechaISO}T12:00:00Z`);
  return DIAS[(d.getUTCDay() + 6) % 7];
}

// Fecha local (YYYY-MM-DD) de un instante, en la zona de la persona.
export function fechaLocal(instante, zona) {
  if (!instante) return null;
  return ahoraEn(zona, new Date(instante)).fecha;
}

export function calcularVentana(tipo, ahora, ultimaCorrida) {
  switch (tipo) {
    case 'dia_habil_anterior': {
      let desde = sumarDias(ahora.fecha, -1);
      while (['sab', 'dom'].includes(diaDeFecha(desde))) desde = sumarDias(desde, -1);
      return { tipo, desde, hasta: ahora.fecha, descripcion: `del ${desde} a hoy (${ahora.fecha})` };
    }
    case 'hoy':
      return { tipo, desde: ahora.fecha, hasta: ahora.fecha, descripcion: `hoy (${ahora.fecha})` };
    case 'ultimos_7_dias': {
      const desde = sumarDias(ahora.fecha, -7);
      return { tipo, desde, hasta: ahora.fecha, descripcion: `del ${desde} a hoy (${ahora.fecha})` };
    }
    case 'desde_ultima_corrida': {
      const desde = ultimaCorrida || sumarDias(ahora.fecha, -7);
      return { tipo, desde, hasta: ahora.fecha, descripcion: `desde ${ultimaCorrida ? 'la última corrida' : 'hace siete días'} (${desde}) a hoy` };
    }
    default: {
      const desde = sumarDias(ahora.fecha, -7);
      return { tipo: tipo || 'evento', desde, hasta: ahora.fecha, descripcion: 'la reunión que nombre la persona (si no nombra ninguna, la última semana)' };
    }
  }
}

export function textoHorario(horario) {
  if (!horario || horario.a_pedido) return 'A pedido';
  const dias = horario.dias || [];
  const habiles = ['lun', 'mar', 'mie', 'jue', 'vie'];
  let d;
  if (dias.length === 7) d = 'Todos los días';
  else if (dias.length === 5 && habiles.every((x) => dias.includes(x))) d = 'Lun a vie';
  else d = dias.map((x) => NOMBRE_DIA[x].slice(0, 3)).join(', ');
  return `${d}, ${horario.hora}`;
}

// entregables: lista de { id, nombre, activo, horario }.
export function tocaHoy(entregables, ahora) {
  return entregables
    .filter((e) => e.activo && e.horario && !e.horario.a_pedido && e.horario.dias.includes(ahora.dia))
    .map((e) => ({ id: e.id, nombre: e.nombre, hora: e.horario.hora }))
    .sort((a, b) => a.hora.localeCompare(b.hora));
}

// Lo que corresponde correr ahora: su hora ya pasó y está dentro de la tolerancia.
export function tocaAhora(entregables, ahora, toleranciaMin = 90) {
  return tocaHoy(entregables, ahora).filter((e) => {
    const [h, m] = e.hora.split(':').map(Number);
    const desde = h * 60 + m;
    return ahora.minutos >= desde && ahora.minutos < desde + toleranciaMin;
  });
}

export function semana(entregables) {
  return {
    dias: DIAS.map((dia) => ({
      dia,
      nombre: NOMBRE_DIA[dia],
      items: entregables
        .filter((e) => e.horario && !e.horario.a_pedido && e.horario.dias.includes(dia))
        .map((e) => ({ id: e.id, nombre: e.nombre, hora: e.horario.hora, activo: e.activo }))
        .sort((a, b) => a.hora.localeCompare(b.hora)),
    })),
    aPedido: entregables
      .filter((e) => !e.horario || e.horario.a_pedido)
      .map((e) => ({ id: e.id, nombre: e.nombre, activo: e.activo })),
  };
}
