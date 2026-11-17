#!/usr/bin/env node
/**
 * CLI para parchear los tres archivos compartidos del proyecto ORQI.
 *
 * Uso: parchear.mjs --proyecto <dir> --manifiesto <file> [--mapa <file>] [--dry-run]
 *
 * Códigos de salida:
 *   0 - OK
 *   1 - Error de ancla/colisión
 *   2 - Error de uso (argumentos inválidos)
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest } from './lib/manifest.mjs';
import { discoverProject } from './lib/discover.mjs';
import { patchShared } from './lib/patch.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

function parseArgs(argv) {
  const args = {
    proyecto: null,
    manifiesto: null,
    mapa: null,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--proyecto' || arg === '-p') {
      args.proyecto = argv[++i];
    } else if (arg === '--manifiesto' || arg === '-m') {
      args.manifiesto = argv[++i];
    } else if (arg === '--mapa') {
      args.mapa = argv[++i];
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    }
  }
  return args;
}

function printUsage() {
  console.log(`
Uso: parchear.mjs --proyecto <dir> --manifiesto <file> [--mapa <file>] [--dry-run]

Parchea los tres archivos compartidos (ClientVaultFactory, ApplicationServiceFactory, MainRest)
con la nueva rebanada definida en el manifiesto.

Opciones:
  --proyecto, -p   <dir>    Directorio raíz del proyecto ORQI (requerido)
  --manifiesto, -m <file>   Archivo de manifiesto JSON (requerido)
  --mapa           <file>   Archivo de mapa JSON (opcional, se descubre si falta)
  --dry-run                  Solo muestra cambios sin escribir archivos
  --help, -h                 Muestra esta ayuda

Códigos de salida:
  0  OK
  1  Error de ancla/colisión
  2  Error de uso
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  if (!args.proyecto || !args.manifiesto) {
    console.error('Error: --proyecto y --manifiesto son requeridos');
    printUsage();
    process.exit(2);
  }

  const proyecto = resolve(args.proyecto);
  const manifiestoPath = resolve(args.manifiesto);

  if (!existsSync(proyecto)) {
    console.error(`Error: El proyecto "${proyecto}" no existe`);
    process.exit(2);
  }

  if (!existsSync(manifiestoPath)) {
    console.error(`Error: El manifiesto "${manifiestoPath}" no existe`);
    process.exit(2);
  }

  // Cargar manifiesto
  const { ok: manifestOk, manifest, errors: manifestErrors } = loadManifest(manifiestoPath);
  if (!manifestOk) {
    console.error('Error en manifiesto:');
    for (const err of manifestErrors) {
      console.error(`  - ${err}`);
    }
    process.exit(2);
  }

  // Descubrir o cargar mapa
  let mapa;
  if (args.mapa) {
    const mapaPath = resolve(args.mapa);
    if (!existsSync(mapaPath)) {
      console.error(`Error: El mapa "${mapaPath}" no existe`);
      process.exit(2);
    }
    try {
      mapa = JSON.parse(readFileSync(mapaPath, 'utf8'));
    } catch (e) {
      console.error(`Error leyendo mapa: ${e.message}`);
      process.exit(2);
    }
  } else {
    const { ok: discoverOk, errores: discoverErrores, mapa: discoveredMapa } = discoverProject(proyecto);
    if (!discoverOk) {
      console.error('Error descubriendo proyecto:');
      for (const err of discoverErrores) {
        console.error(`  - ${err}`);
      }
      process.exit(1);
    }
    mapa = discoveredMapa;
  }

  // Aplicar parches
  const resultado = patchShared({ proyecto, manifest, mapa, dryRun: args.dryRun });

  if (resultado.ok) {
    console.log('✓ Parches aplicados correctamente');
    if (args.dryRun) {
      console.log('  (dry-run: no se escribieron archivos)');
    }
    for (const cambio of resultado.cambios) {
      console.log(`  - ${cambio}`);
    }
    process.exit(0);
  } else {
    console.error('✗ Error aplicando parches:');
    for (const err of resultado.errores) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error inesperado:', err.message);
  process.exit(2);
});