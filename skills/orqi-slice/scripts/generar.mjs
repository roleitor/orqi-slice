#!/usr/bin/env node
/**
 * CLI para generar una rebanada ORQI.
 *
 * Uso:
 *   generar.mjs --proyecto <dir> --manifiesto <file> [--mapa <file>] [--dry-run]
 */

import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

import { loadManifest } from './lib/manifest.mjs';
import { discoverProject } from './lib/discover.mjs';
import { generateSlice } from './lib/generate.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function printUsage() {
  console.error(`
Uso: generar.mjs --proyecto <dir> --manifiesto <file> [--mapa <file>] [--dry-run]

Opciones:
  --proyecto <dir>     Directorio raíz del proyecto ORQI existente (obligatorio)
  --manifiesto <file>  Ruta al archivo JSON del manifiesto (obligatorio)
  --mapa <file>        Ruta al archivo JSON del mapa descubierto (opcional)
  --dry-run            Solo lista los archivos que se generarían, sin escribirlos
  --help               Muestra esta ayuda
`);
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opciones = {
    proyecto: null,
    manifiesto: null,
    mapa: null,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--proyecto':
        opciones.proyecto = args[++i];
        break;
      case '--manifiesto':
        opciones.manifiesto = args[++i];
        break;
      case '--mapa':
        opciones.mapa = args[++i];
        break;
      case '--dry-run':
        opciones.dryRun = true;
        break;
      case '--help':
        printUsage();
        break;
      default:
        console.error(`Opción desconocida: ${arg}`);
        printUsage();
    }
  }

  if (!opciones.proyecto || !opciones.manifiesto) {
    console.error('Error: --proyecto y --manifiesto son obligatorios.');
    printUsage();
  }

  return opciones;
}

async function main() {
  const { proyecto, manifiesto, mapa, dryRun } = parseArgs();

  const proyectoPath = resolve(proyecto);
  if (!existsSync(proyectoPath)) {
    console.error(`Error: El proyecto "${proyectoPath}" no existe.`);
    process.exit(1);
  }

  // Cargar manifiesto
  const { ok: manifestOk, manifest, errors: manifestErrors } = loadManifest(manifiesto);
  if (!manifestOk) {
    console.error('Error en el manifiesto:');
    for (const error of manifestErrors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  // Cargar mapa si se proporciona
  let mapaProyecto = null;
  if (mapa) {
    const mapaPath = resolve(mapa);
    if (!existsSync(mapaPath)) {
      console.error(`Error: El mapa "${mapaPath}" no existe.`);
      process.exit(1);
    }
    try {
      mapaProyecto = JSON.parse(readFileSync(mapaPath, 'utf8'));
    } catch (error) {
      console.error(`Error al leer el mapa: ${error.message}`);
      process.exit(1);
    }
  }

  // Generar slice
  const resultado = generateSlice({
    proyecto: proyectoPath,
    manifest,
    mapa: mapaProyecto,
    dryRun,
  });

  if (!resultado.ok) {
    console.error('Error al generar la rebanada:');
    for (const error of resultado.errores) {
      console.error(`  - ${error}`);
    }
    if (resultado.colisiones.length > 0) {
      console.error('Colisiones detectadas (archivos existentes con contenido distinto):');
      for (const colision of resultado.colisiones) {
        console.error(`  - ${colision}`);
      }
    }
    process.exit(1);
  }

  if (dryRun) {
    console.log(`[DRY-RUN] Se generarían ${resultado.archivos.length} archivos:`);
  } else {
    console.log(`Generados ${resultado.archivos.length} archivos:`);
  }
  for (const archivo of resultado.archivos) {
    console.log(`  ${archivo}`);
  }
}

main().catch((error) => {
  console.error(`Error inesperado: ${error.message}`);
  process.exit(1);
});