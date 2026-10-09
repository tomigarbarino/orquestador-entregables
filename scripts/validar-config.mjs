#!/usr/bin/env node
// Valida la config y las recetas con el mismo esquema que usa la interfaz.
//   node scripts/validar-config.mjs                  tu espacio (mi-espacio/config.yaml)
//   node scripts/validar-config.mjs ruta/config.yaml otro archivo
import fs from 'node:fs';
import YAML from 'yaml';
import { estadoEspacio, listarRecetas, listarModulos, validarTodo, asegurarEspacio } from '../lib/espacio.mjs';

const archivo = process.argv[2];
let resultado;
if (archivo) {
  let datos;
  try {
    datos = YAML.parse(fs.readFileSync(archivo, 'utf8'));
  } catch (e) {
    console.log(`✗ ${archivo} no es YAML válido: ${e.message}`);
    process.exit(1);
  }
  resultado = validarTodo(datos, listarRecetas(), listarModulos());
} else {
  await asegurarEspacio();
  resultado = estadoEspacio().validacion;
}
for (const e of resultado.errores) console.log(`✗ ${e.ruta}: ${e.mensaje}`);
for (const a of resultado.avisos) console.log(`! ${a.ruta}: ${a.mensaje}`);
console.log(resultado.ok ? '✓ La configuración y las recetas son válidas.' : `\n${resultado.errores.length} error(es).`);
process.exit(resultado.ok ? 0 : 1);
