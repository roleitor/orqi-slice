#!/usr/bin/env node
/**
 * CLI para verificar una rebanada ORQI.
 *
 * Uso:
 *   verificar.mjs --proyecto <dir> --manifiesto <file> [--mapa <file>]
 *
 * Códigos de salida:
 *   0 - ok (todos los chequeos pasan)
 *   1 - fallaron chequeos
 *   2 - error de uso (argumentos faltantes o inválidos)
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverProject } from './lib/discover.mjs';
import { verifySlice, gitStatusIssues } from './lib/verify.mjs';
import { loadManifest } from './lib/manifest.mjs';
import { deriveNames, toLowerConcat } from './lib/naming.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

/** Parsea argumentos de línea de comandos. */
function parseArgs(argv) {
  const args = {
    proyecto: null,
    manifiesto: null,
    mapa: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--proyecto' || arg === '-p') {
      args.proyecto = argv[++i];
    } else if (arg === '--manifiesto' || arg === '-m') {
      args.manifiesto = argv[++i];
    } else if (arg === '--mapa' || arg === '-M') {
      args.mapa = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg.startsWith('--')) {
      args.unknown = arg;
    }
  }

  return args;
}

/** Muestra ayuda de uso. */
function printUsage() {
  console.log(`
Uso: verificar.mjs --proyecto <dir> --manifiesto <file> [--mapa <file>]

Opciones:
  -p, --proyecto <dir>     Directorio raíz del proyecto ORQI (requerido)
  -m, --manifiesto <file>  Archivo de manifiesto JSON (requerido)
  -M, --mapa <file>        Archivo de mapa del proyecto descubierto (opcional)
  -h, --help               Mostrar esta ayuda

Códigos de salida:
  0  Todos los chequeos pasan
  1  Fallaron uno o más chequeos
  2  Error de uso (argumentos faltantes o inválidos)
`);
}

/** Función principal del CLI. */
export async function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);

  if (args.help) {
    printUsage();
    return { exitCode: 0, output: '' };
  }

  if (args.unknown) {
    console.error(`Opción desconocida: ${args.unknown}`);
    printUsage();
    return { exitCode: 2, output: '' };
  }

  if (!args.proyecto || !args.manifiesto) {
    console.error('Faltan argumentos requeridos: --proyecto y --manifiesto');
    printUsage();
    return { exitCode: 2, output: '' };
  }

  const proyecto = resolve(args.proyecto);
  const manifiestoPath = resolve(args.manifiesto);

  if (!existsSync(proyecto)) {
    console.error(`El proyecto "${proyecto}" no existe`);
    return { exitCode: 2, output: '' };
  }

  if (!existsSync(manifiestoPath)) {
    console.error(`El manifiesto "${manifiestoPath}" no existe`);
    return { exitCode: 2, output: '' };
  }

  // Cargar manifiesto
  let manifest;
  try {
    const manifestResult = loadManifest(manifiestoPath);
    if (!manifestResult.ok) {
      console.error('Manifiesto inválido:');
      for (const err of manifestResult.errors) {
        console.error(`  - ${err}`);
      }
      return { exitCode: 2, output: '' };
    }
    manifest = manifestResult.manifest;
  } catch (err) {
    console.error(`Error leyendo manifiesto: ${err.message}`);
    return { exitCode: 2, output: '' };
  }

  // Cargar mapa si se proporciona, sino descubrir
  let mapa;
  if (args.mapa) {
    const mapaPath = resolve(args.mapa);
    if (!existsSync(mapaPath)) {
      console.error(`El mapa "${mapaPath}" no existe`);
      return { exitCode: 2, output: '' };
    }
    try {
      const content = readFileSync(mapaPath, 'utf8');
      mapa = JSON.parse(content);
    } catch (err) {
      console.error(`Error leyendo mapa: ${err.message}`);
      return { exitCode: 2, output: '' };
    }
  } else {
    const { ok, errores, mapa: discoveredMapa } = discoverProject(proyecto);
    if (!ok) {
      console.error('Error descubriendo el proyecto:');
      for (const err of errores) {
        console.error(`  - ${err}`);
      }
      return { exitCode: 1, output: '' };
    }
    mapa = discoveredMapa;
  }

  // Ejecutar verificación
  const result = verifySlice({ proyecto, manifest, mapa });

  // Verificación git status si es repo git
  const { promisify } = await import('node:util');
  const { execFile } = await import('node:child_process');
  const execFileAsync = promisify(execFile);
  
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd: proyecto });
    // Rutas permitidas: los archivos generados/parcheados Y los directorios creados
    const derivedNames = deriveNames(manifest);
    derivedNames.paqueteBase = mapa.paqueteBase;
    derivedNames.seg = toLowerConcat(derivedNames.servicio);
    const paqueteBase = mapa.paqueteBase;
    const seg = derivedNames.seg;
    const paquetePath = paqueteBase.split('.').join('/');
    
    const permitidas = new Set([
      // 9 Java
      join('orqi.application', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'clients', seg, `${derivedNames.clases.dto}.java`),
      join('orqi.application', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'clients', seg, `${derivedNames.clases.solicitudLista}.java`),
      join('orqi.application', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'clients', seg, `${derivedNames.clases.respuesta}.java`),
      join('orqi.application', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'clients', seg, `${derivedNames.clases.respuestaLista}.java`),
      join('orqi.application', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'clients', seg, `${derivedNames.clases.clientInterface}.java`),
      join('orqi.application', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'orquestadores', `${derivedNames.clases.serviceInterface}.java`),
      join('orqi.application.services', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'service', seg, `${derivedNames.clases.serviceImpl}.java`),
      join('orqi.application.services', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'service', 'clients', `${derivedNames.clases.clientImpl}.java`),
      join('orqi.infraestructure.rest', 'src', 'main', 'java', ...paqueteBase.split('.'), 'infraestructure', 'rest', 'controller', seg, `${derivedNames.clases.controller}.java`),
      // 1 doc
      join('docs', 'orqi', `${seg}.md`),
      // 3 parcheados
      join('orqi.application', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'ClientVaultFactory.java'),
      join('orqi.application.services', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'service', 'ApplicationServiceFactory.java'),
      join('orqi.infraestructure.rest', 'src', 'main', 'java', ...paqueteBase.split('.'), 'infraestructure', 'rest', 'MainRest.java'),
      // Directorios creados por la generación (incluyendo archivos nuevos)
      join('docs', 'orqi'),
      join('docs') + '/',
      join('orqi.application', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'clients', seg),
      join('orqi.application', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'clients') + '/',
      join('orqi.application', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'orquestadores'),
      join('orqi.application.services', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'service', seg),
      join('orqi.application.services', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'service', seg) + '/',
      join('orqi.application.services', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'service', 'clients'),
      join('orqi.infraestructure.rest', 'src', 'main', 'java', ...paqueteBase.split('.'), 'infraestructure', 'rest', 'controller', seg),
      join('orqi.infraestructure.rest', 'src', 'main', 'java', ...paqueteBase.split('.'), 'infraestructure', 'rest', 'controller') + '/',
      join('orqi.infraestructure.rest', 'src', 'main', 'java', ...paqueteBase.split('.'), 'infraestructure', 'rest', 'controller', seg) + '/',
      // manifiesto (archivo de prueba/CLI) - usar el nombre real del archivo
      basename(args.manifiesto),
    ]);
    
    const issues = gitStatusIssues(stdout, Array.from(permitidas));
    if (issues.length > 0) {
      result.ok = false;
      result.errores.push(...issues.map(f => `git status: archivo no permitido modificado/creado: ${f}`));
    }
  } catch {
    // No es repo git o git no disponible - ya se advierte en verifySlice
  }

  // Reportar resultados
  if (result.errores.length > 0) {
    console.error('❌ Verificación falló:');
    for (const err of result.errores) {
      console.error(`  - ${err}`);
    }
  }

  if (result.advertencias.length > 0) {
    console.warn('⚠️  Advertencias:');
    for (const warn of result.advertencias) {
      console.warn(`  - ${warn}`);
    }
  }

  if (result.ok) {
    console.log('✅ Verificación OK');
    return { exitCode: 0, output: '' };
  } else {
    return { exitCode: 1, output: '' };
  }
}

// Ejecutar si es el script principal
if (import.meta.url === `file://${__filename}`) {
  runCli().then(({ exitCode }) => {
    process.exit(exitCode);
  }).catch((err) => {
    console.error(`Error inesperado: ${err.message}`);
    process.exit(2);
  });
}
