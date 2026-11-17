#!/usr/bin/env node
/**
 * CLI de descubrimiento: escanea un proyecto ORQI y escribe el mapa JSON.
 *
 * Sale 0 si la forma es canónica, 1 si no lo es y 2 ante un uso incorrecto.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { discoverProject } from './lib/discover.mjs';

const USO = `Uso: descubrir.mjs --proyecto <directorio> [--out <archivo>]

Escanea el proyecto indicado, valida la forma canónica de ORQI y escribe el mapa.

Opciones:
  --proyecto <directorio>  Proyecto a descubrir (obligatorio).
  --out <archivo>          Guarda el mapa JSON en ese archivo en lugar de la salida estándar.
  --help, -h               Muestra este uso y sale.

Salida:
  0  El proyecto es canónico y el mapa se escribió.
  1  El proyecto no es canónico; se listan los errores en stderr.
  2  Uso incorrecto (faltan argumentos u opción desconocida).
`;

function fallarUso(mensaje) {
  process.stderr.write(`${mensaje}\n\n${USO}`);
  process.exitCode = 2;
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(USO);
    return;
  }

  let proyecto = null;
  let salida = null;

  for (let indice = 0; indice < argv.length; indice += 1) {
    const argumento = argv[indice];

    if (argumento !== '--proyecto' && argumento !== '--out') {
      fallarUso(`Opción desconocida: "${argumento}".`);
      return;
    }

    const valor = argv[indice + 1];
    if (valor === undefined || valor.startsWith('--')) {
      fallarUso(`La opción ${argumento} requiere un valor.`);
      return;
    }

    indice += 1;
    if (argumento === '--proyecto') proyecto = valor;
    else salida = valor;
  }

  if (!proyecto) {
    fallarUso('Falta la opción obligatoria --proyecto <directorio>.');
    return;
  }

  const { ok, errores, mapa } = discoverProject(proyecto);

  if (!ok) {
    process.stderr.write('No se puede continuar: el proyecto no tiene la forma canónica.\n');
    for (const error of errores) process.stderr.write(` - ${error}\n`);
    process.exitCode = 1;
    return;
  }

  const json = `${JSON.stringify(mapa, null, 2)}\n`;

  if (!salida) {
    process.stdout.write(json);
    return;
  }

  const destino = resolve(salida);
  try {
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, json, 'utf8');
  } catch (error) {
    process.stderr.write(`No se pudo escribir el mapa en "${destino}": ${error.message}\n`);
    process.exitCode = 1;
  }
}

main(process.argv.slice(2));
