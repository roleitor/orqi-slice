/**
 * Verificador de rebanadas ORQI.
 *
 * Valida los 8 chequeos del spec §13 sobre el proyecto generado y parcheado.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { deriveNames, toLowerConcat } from './naming.mjs';

/** Lee un archivo de texto. */
function leerTexto(ruta) {
  try {
    return readFileSync(ruta, 'utf8');
  } catch {
    return '';
  }
}

/** Todos los `.java` bajo un directorio, en orden estable y sin `target`. */
function listarJava(directorio) {
  const archivos = [];
  let entradas;

  try {
    entradas = readdirSync(directorio, { withFileTypes: true });
  } catch {
    return archivos;
  }

  for (const entrada of entradas) {
    const ruta = join(directorio, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === 'target' || entrada.name === 'node_modules' || entrada.name === '.git') continue;
      archivos.push(...listarJava(ruta));
    } else if (entrada.isFile() && entrada.name.endsWith('.java')) {
      archivos.push(ruta);
    }
  }

  return archivos.sort();
}

/** Cuenta ocurrencias exactas de una cadena en un texto. */
function contarOcurrencias(texto, busqueda) {
  if (!busqueda) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = texto.indexOf(busqueda, pos)) !== -1) {
    count++;
    pos += busqueda.length;
  }
  return count;
}

/** Verifica si el proyecto es un repositorio git. */
function esRepoGit(root) {
  return existsSync(join(root, '.git'));
}

/**
 * Función pura: parsea la salida de `git status --porcelain` y devuelve
 * los archivos que NO están en la lista de permitidos.
 *
 * Formato porcelain: "XY path" (2 chars status + space + path)
 * No hacemos trim para preservar la posición fija.
 *
 * @param {string} porcelain - Salida de `git status --porcelain`
 * @param {string[]} allowed - Lista de rutas permitidas (relativas a la raíz del repo)
 * @returns {string[]} Archivos que aparecen en el status pero no están permitidos
 */
export function gitStatusIssues(porcelain, allowed) {
  const permitidos = new Set(allowed);
  const problemas = [];

  for (const linea of porcelain.split('\n')) {
    // Formato fijo: posiciones 0-1 = status, 2 = space, 3+ = path
    if (linea.length < 4) continue;
    const path = linea.slice(3); // No trim, path puede tener espacios iniciales en casos raros

    if (!permitidos.has(path)) {
      problemas.push(path);
    }
  }

  return problemas;
}

/**
 * Verifica una rebanada ORQI completa.
 *
 * @param {object} opciones
 * @param {string} opciones.proyecto - Directorio raíz del proyecto ORQI.
 * @param {object} opciones.manifest - Manifiesto ya validado.
 * @param {object} opciones.mapa - Mapa del proyecto descubierto.
 * @returns {{ok: boolean, errores: string[], advertencias: string[]}}
 */
export function verifySlice({ proyecto, manifest, mapa }) {
  const errores = [];
  const advertencias = [];

  // Derivar nombres para saber qué archivos/métodos/rutaBase esperar
  const names = deriveNames(manifest);
  names.paqueteBase = mapa.paqueteBase;
  names.seg = toLowerConcat(names.servicio);
  const rutaBase = names.rutaBase; // '/rest/producto'

  // 1. Existen los 9 Java + 1 doc
  const paqueteBase = mapa.paqueteBase;
  const seg = names.seg;
  const paquetePath = paqueteBase.split('.').join('/');

  const archivosEsperados = [
    // 9 Java
    join('orqi.application', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'clients', seg, `${names.clases.dto}.java`),
    join('orqi.application', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'clients', seg, `${names.clases.solicitudLista}.java`),
    join('orqi.application', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'clients', seg, `${names.clases.respuesta}.java`),
    join('orqi.application', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'clients', seg, `${names.clases.respuestaLista}.java`),
    join('orqi.application', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'clients', seg, `${names.clases.clientInterface}.java`),
    join('orqi.application', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'orquestadores', `${names.clases.serviceInterface}.java`),
    join('orqi.application.services', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'service', seg, `${names.clases.serviceImpl}.java`),
    join('orqi.application.services', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'service', 'clients', `${names.clases.clientImpl}.java`),
    join('orqi.infraestructure.rest', 'src', 'main', 'java', ...paqueteBase.split('.'), 'infraestructure', 'rest', 'controller', seg, `${names.clases.controller}.java`),
    // 1 doc
    join('docs', 'orqi', `${seg}.md`),
  ];

  for (const rel of archivosEsperados) {
    const abs = join(proyecto, rel);
    if (!existsSync(abs)) {
      errores.push(`Archivo faltante: ${rel}`);
    }
  }

  // 2. producto() / getProductoService() / path("<rutaBase>") aparecen exactamente una vez
  const clientVaultFactoryPath = join(proyecto, 'orqi.application', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'ClientVaultFactory.java');
  const appFactoryPath = join(proyecto, 'orqi.application.services', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'service', 'ApplicationServiceFactory.java');
  const mainRestPath = join(proyecto, 'orqi.infraestructure.rest', 'src', 'main', 'java', ...paqueteBase.split('.'), 'infraestructure', 'rest', 'MainRest.java');

  if (existsSync(clientVaultFactoryPath)) {
    const content = leerTexto(clientVaultFactoryPath);
    const metodo = names.factories.clientVaultMethod; // 'producto'
    const count = contarOcurrencias(content, `public static ClientVault ${metodo}()`);
    if (count !== 1) {
      errores.push(`ClientVaultFactory: método '${metodo}()' aparece ${count} veces (se espera exactamente 1)`);
    }
    // Verificar Boolean.TRUE en el método nuevo (buscar el bloque del método)
    const metodoRegex = new RegExp(`public static ClientVault ${metodo}\\(\\) \\{[\\s\\S]*?\\n\\s*\\}`);
    const match = content.match(metodoRegex);
    if (match && !match[0].includes('Boolean.TRUE')) {
      errores.push(`ClientVaultFactory: método '${metodo}()' no usa Boolean.TRUE`);
    }
  } else {
    errores.push('No se encontró ClientVaultFactory.java');
  }

  if (existsSync(appFactoryPath)) {
    const content = leerTexto(appFactoryPath);
    const metodo = names.factories.serviceFactoryMethod; // 'getProductoService'
    const count = contarOcurrencias(content, `public static ${names.clases.serviceInterface} ${metodo}()`);
    if (count !== 1) {
      errores.push(`ApplicationServiceFactory: método '${metodo}()' aparece ${count} veces (se espera exactamente 1)`);
    }
  } else {
    errores.push('No se encontró ApplicationServiceFactory.java');
  }

  if (existsSync(mainRestPath)) {
    const content = leerTexto(mainRestPath);
    const count = contarOcurrencias(content, `path("${rutaBase}"`);
    if (count !== 1) {
      errores.push(`MainRest: bloque path("${rutaBase}") aparece ${count} veces (se espera exactamente 1)`);
    }
  } else {
    errores.push('No se encontró MainRest.java');
  }

  // 3. No hay rutas duplicadas en MainRest
  if (existsSync(mainRestPath)) {
    const content = leerTexto(mainRestPath);
    const pathMatches = content.matchAll(/\bpath\s*\(\s*"([^"]+)"/g);
    const rutasVistas = new Map();
    for (const match of pathMatches) {
      const ruta = match[1];
      rutasVistas.set(ruta, (rutasVistas.get(ruta) || 0) + 1);
    }
    for (const [ruta, count] of rutasVistas) {
      if (count > 1) {
        errores.push(`MainRest: ruta duplicada "${ruta}" (aparece ${count} veces)`);
      }
    }
  }

  // 4. El controller nuevo no contiene { ni } en rutas Spark (verificar en MainRest las rutas del nuevo controller)
  // Las rutas del nuevo controller están dentro del bloque path("/rest/producto", ...)
  if (existsSync(mainRestPath)) {
    const content = leerTexto(mainRestPath);
    // Buscar el bloque del nuevo controller
    const bloqueRegex = new RegExp(`path\\s*\\(\\s*"${rutaBase.replace('/', '\\/')}"\\s*,\\s*\\(\\)\\s*->\\s*\\{([\\s\\S]*?)\\n\\s*\\}\\);`);
    const match = content.match(bloqueRegex);
    if (match) {
      const bloqueContent = match[1];
      // Buscar verbos HTTP con rutas que contengan { o }
      const routeMatches = bloqueContent.matchAll(/\b(get|post|put|delete|patch)\s*\(\s*"([^"]+)"/g);
      for (const routeMatch of routeMatches) {
        const routePath = routeMatch[2];
        if (routePath.includes('{') || routePath.includes('}')) {
          errores.push(`MainRest: ruta Spark del nuevo controller contiene llaves (deben ser dos puntos): "${routePath}"`);
        }
      }
    }
  }

  // 5. Las solicitudes nuevas no contienen extends RespuestaStatus
  const solicitudPath = join(proyecto, 'orqi.application', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'clients', seg, `${names.clases.solicitudLista}.java`);
  if (existsSync(solicitudPath)) {
    const content = leerTexto(solicitudPath);
    if (content.match(/\bclass\s+\w+\s+extends\s+RespuestaStatus\b/)) {
      errores.push(`${names.clases.solicitudLista}: hereda de RespuestaStatus (una solicitud no es una respuesta)`);
    }
  }

  // 6. Application.init(EnumArtefactos.<artefacto>) coincide con el manifiesto
  if (existsSync(mainRestPath)) {
    const content = leerTexto(mainRestPath);
    const expectedArtefacto = manifest.artefacto;
    const initMatch = content.match(/Application\s*\.\s*init\s*\(\s*EnumArtefactos\s*\.\s*([A-Za-z_$][\w$]*)\s*\)/);
    if (initMatch) {
      const actualArtefacto = initMatch[1];
      if (actualArtefacto !== expectedArtefacto) {
        errores.push(`MainRest: Application.init usa EnumArtefactos.${actualArtefacto} pero el manifiesto declara ${expectedArtefacto}`);
      }
    } else {
      errores.push('MainRest: no se encontró Application.init(EnumArtefactos.<ARTEFACTO>)');
    }
  }

  // 7. ClientVaultFactory método usa Boolean.TRUE (ya verificado en paso 2)

  // 8. Si git repo, git status --porcelain solo muestra rutas permitidas
  // Esto se verifica a nivel de CLI, no aquí (se pasa como parámetro opcional)

  // Advertencias
  // test.layers si existe
  const testLayersPath = join(proyecto, 'test.layers');
  if (existsSync(testLayersPath)) {
    advertencias.push('Existe test.layers; verificar capas según política del proyecto');
  }

  // Git ausente
  if (!esRepoGit(proyecto)) {
    advertencias.push('El proyecto no es un repositorio git; omitiendo verificación de git status');
  }

  return {
    ok: errores.length === 0,
    errores,
    advertencias,
  };
}
