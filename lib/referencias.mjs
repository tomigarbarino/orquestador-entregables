// Comparación pura, compartida por el servidor y el caso público.
export function normalizarRef(ref) {
  return String(ref || '').trim().toLowerCase()
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\/(pull|issues)\/(\d+).*$/, '#$2')
    .replace(/\s+/g, ' ');
}

function mismaRef(r, x) {
  if (!r || !x) return false;
  if (r === x) return true;
  if (x.endsWith(r)) {
    const antes = x[x.length - r.length - 1];
    if (r.startsWith('#') || [':', '/', ' '].includes(antes)) return true;
  }
  if (/^(claude|codex):[0-9a-f]{8}$/.test(x) && r.startsWith(x)) return true;
  const num = r.match(/^#?(\d+)$/)?.[1];
  return Boolean(num && x.endsWith(`#${num}`));
}

export function coincideRef(ref, leidas) {
  const r = normalizarRef(ref);
  return Boolean(r) && leidas.some((l) => mismaRef(r, normalizarRef(l)));
}
