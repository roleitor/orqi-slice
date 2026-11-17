/**
 * Parches idempotentes para los tres archivos compartidos del proyecto ORQI.
 *
 * - ClientVaultFactory: agrega campo estático y método producto()
 * - ApplicationServiceFactory: agrega método getProductoService()
 * - MainRest: agrega bloque path("/rest/producto", ...) antes de awaitInitialization()
 *
 * Reglas:
 * - Validar anclas en los tres archivos ANTES de escribir (atomicidad).
 * - Idempotente: si el método/ruta ya existe con mismo contenido, omitir.
 * - Si existe con contenido distinto, abortar con error accionable y no escribir nada.
 * - dryRun devuelve cambios sin escribir.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { deriveNames } from './naming.mjs';

/**
 * Busca una línea que contenga `needle` y devuelve su índice (0-based).
 * Retorna -1 si no se encuentra.
 */
function findLine(lines, needle) {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(needle)) return i;
  }
  return -1;
}

/**
 * Verifica si un bloque de texto ya existe en el contenido (idempotencia).
 * Retorna true si existe exactamente.
 */
function existsBlock(content, block) {
  return content.includes(block);
}

/**
 * Inserta `insertion` después de la línea `afterLineIndex` en `lines`.
 * Retorna nuevo array de líneas.
 */
function insertAfter(lines, afterLineIndex, insertion) {
  const result = [...lines];
  result.splice(afterLineIndex + 1, 0, insertion);
  return result;
}

/**
 * Inserta `insertion` antes de la línea `beforeLineIndex` en `lines`.
 * Retorna nuevo array de líneas.
 */
function insertBefore(lines, beforeLineIndex, insertion) {
  const result = [...lines];
  result.splice(beforeLineIndex, 0, insertion);
  return result;
}

/**
 * Asegura que un import exista; si no, lo agrega después de los imports existentes.
 */
function ensureImport(lines, importStatement) {
  // Verificar si ya existe
  for (const line of lines) {
    if (line.trim() === importStatement.trim()) return lines;
  }

  // Encontrar la última línea de import
  let lastImportIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('import ')) {
      lastImportIndex = i;
    }
  }

  if (lastImportIndex === -1) {
    // No hay imports, buscar la línea de package
    let packageIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('package ')) {
        packageIndex = i;
        break;
      }
    }
    if (packageIndex !== -1) {
      return insertAfter(lines, packageIndex, importStatement);
    }
    return lines; // No se pudo insertar
  }

  return insertAfter(lines, lastImportIndex, importStatement);
}

/**
 * Parchea ClientVaultFactory.java
 * - Agrega campo estático después del constructor privado
 * - Agrega método público antes del último }
 * - Asegura import de EnumArtefactos
 */
function patchClientVaultFactory(content, names, manifest) {
  const lines = content.split('\n');
  const metodo = names.factories.clientVaultMethod; // 'producto'
  const artefactoServicio = manifest.clientes[0]?.artefacto ?? 'STR_MON_STT_REST';
  const campo = `    private static ClientVault ${metodo};`;
  const metodoStr = `    public static ClientVault ${metodo}() {
        if (${metodo} == null) {
            ${metodo} = new ClientVault(EnumArtefactos.${artefactoServicio}, Boolean.TRUE);
        }
        return ${metodo};
    }`;

  // Verificar idempotencia: buscar el bloque completo exacto
  const hasExactCampo = content.includes(campo);
  const hasExactMetodo = content.includes(metodoStr);
  if (hasExactCampo && hasExactMetodo) {
    return { ok: true, content, cambios: [] };
  }

  // Verificar colisión: existe el campo o método pero con contenido distinto
  const hasCampo = content.includes(`private static ClientVault ${metodo};`);
  const hasMetodo = content.includes(`public static ClientVault ${metodo}()`);
  
  if (hasCampo && !hasExactCampo) {
    return { ok: false, error: `ClientVaultFactory: campo '${metodo}' ya existe con contenido distinto` };
  }
  if (hasMetodo && !hasExactMetodo) {
    return { ok: false, error: `ClientVaultFactory: método '${metodo}' ya existe con contenido distinto` };
  }

  // Encontrar ancla: constructor privado - insertar campo después del } del constructor
  const constructorDeclIndex = findLine(lines, 'private ClientVaultFactory()');
  if (constructorDeclIndex === -1) {
    return { ok: false, error: 'ClientVaultFactory: no se encontró constructor privado (ancla para campo estático)' };
  }
  // Encontrar el } que cierra el constructor (primero después de la declaración)
  let constructorEndIndex = -1;
  for (let i = constructorDeclIndex + 1; i < lines.length; i++) {
    if (lines[i].trim() === '}') {
      constructorEndIndex = i;
      break;
    }
  }
  if (constructorEndIndex === -1) {
    return { ok: false, error: 'ClientVaultFactory: no se encontró llave de cierre del constructor' };
  }

  // Encontrar ancla: último }
  let lastBraceIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === '}') {
      lastBraceIndex = i;
      break;
    }
  }
  if (lastBraceIndex === -1) {
    return { ok: false, error: 'ClientVaultFactory: no se encontró llave de cierre de clase' };
  }

  // Asegurar import de EnumArtefactos
  const newLines = ensureImport(lines, `import bo.gob.sin.str.enumeradores.EnumArtefactos;`);

  // Recalcular índices después de possible import insertion
  let newConstructorDeclIndex = findLine(newLines, 'private ClientVaultFactory()');
  let newConstructorEndIndex = -1;
  for (let i = newConstructorDeclIndex + 1; i < newLines.length; i++) {
    if (newLines[i].trim() === '}') {
      newConstructorEndIndex = i;
      break;
    }
  }
  let newLastBraceIndex = -1;
  for (let i = newLines.length - 1; i >= 0; i--) {
    if (newLines[i].trim() === '}') {
      newLastBraceIndex = i;
      break;
    }
  }

  // Insertar campo después del } del constructor
  let withField = insertAfter(newLines, newConstructorEndIndex, campo);
  // Insertar método antes del último }
  let withMethod = insertBefore(withField, newLastBraceIndex, metodoStr);

  return { ok: true, content: withMethod.join('\n'), cambios: ['ClientVaultFactory'] };
}

/**
 * Parchea ApplicationServiceFactory.java
 * - Agrega método getProductoService() antes del último }
 * - Asegura import de la interfaz
 */
function patchApplicationServiceFactory(content, names) {
  const lines = content.split('\n');
  const serviceInterface = names.clases.serviceInterface; // 'IProductoService'
  const serviceImpl = names.clases.serviceImpl; // 'ProductoServiceImpl'
  const metodo = names.factories.serviceFactoryMethod; // 'getProductoService'
  const metodoStr = `    public static ${serviceInterface} ${metodo}() {
        return new ${serviceImpl}();
    }`;
  const importStr = `import ${names.paqueteBase}.application.orquestadores.${serviceInterface};`;

  // Verificar idempotencia: buscar el bloque completo exacto
  const hasExactMetodo = content.includes(metodoStr);
  if (hasExactMetodo) {
    return { ok: true, content, cambios: [] };
  }

  // Verificar colisión: existe la firma pero con contenido distinto
  const hasMetodo = content.includes(`${metodo}()`);
  if (hasMetodo && !hasExactMetodo) {
    return { ok: false, error: `ApplicationServiceFactory: método '${metodo}' ya existe con contenido distinto` };
  }

  // Encontrar ancla: último }
  let lastBraceIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === '}') {
      lastBraceIndex = i;
      break;
    }
  }
  if (lastBraceIndex === -1) {
    return { ok: false, error: 'ApplicationServiceFactory: no se encontró llave de cierre de clase' };
  }

  // Asegurar import
  const newLines = ensureImport(lines, importStr);

  // Recalcular último }
  let newLastBraceIndex = -1;
  for (let i = newLines.length - 1; i >= 0; i--) {
    if (newLines[i].trim() === '}') {
      newLastBraceIndex = i;
      break;
    }
  }

  // Insertar método antes del último }
  let withMethod = insertBefore(newLines, newLastBraceIndex, metodoStr);

  return { ok: true, content: withMethod.join('\n'), cambios: ['ApplicationServiceFactory'] };
}

/**
 * Parchea MainRest.java
 * - Agrega bloque path("/rest/producto", ...) antes de awaitInitialization()
 * - Asegura import del controller
 */
function patchMainRest(content, names, mapa) {
  const lines = content.split('\n');
  const controllerClass = names.clases.controller; // 'ProductoController'
  const rutaBase = names.rutaBase; // '/rest/producto'
  
  // Generar las rutas usando controllerRoutes (igual que en la plantilla)
  const routesCode = names.operaciones
    .map((operacion) => {
      const verbo = String(operacion.metodoHttp).toLowerCase();
      const ruta = operacion.sparkPath.replace(rutaBase, '') || '';
      return `            ${verbo}("${ruta}", ${controllerClass}.${operacion.metodoJava}, JsonTransformer.getInstance());`;
    })
    .join('\n');
  
  const pathBlock = `        path("${rutaBase}", () -> {
${routesCode}
        });`;

  const importStr = `import ${names.paqueteBase}.infraestructure.rest.controller.${names.seg}.${controllerClass};`;

  // Verificar idempotencia: buscar el bloque completo exacto
  const hasExactPathBlock = content.includes(pathBlock);
  if (hasExactPathBlock) {
    return { ok: true, content, cambios: [] };
  }

  // Verificar colisión: existe path con la misma rutaBase pero contenido distinto
  const hasPathBlock = content.includes(`path("${rutaBase}"`);
  if (hasPathBlock && !hasExactPathBlock) {
    return { ok: false, error: `MainRest: bloque path("${rutaBase}") ya existe con contenido distinto` };
  }

  // Encontrar ancla: awaitInitialization()
  const awaitIndex = findLine(lines, 'awaitInitialization();');
  if (awaitIndex === -1) {
    return { ok: false, error: 'MainRest: no se encontró awaitInitialization() (ancla para rutas)' };
  }

  // Asegurar import del controller
  const newLines = ensureImport(lines, importStr);

  // Recalcular índice de awaitInitialization
  const newAwaitIndex = findLine(newLines, 'awaitInitialization();');
  if (newAwaitIndex === -1) {
    return { ok: false, error: 'MainRest: awaitInitialization() perdido tras inserción de import' };
  }

  // Insertar bloque path antes de awaitInitialization
  let withPath = insertBefore(newLines, newAwaitIndex, pathBlock);

  return { ok: true, content: withPath.join('\n'), cambios: ['MainRest'] };
}

/**
 * Función principal: parchea los tres archivos compartidos.
 * 
 * @param {object} opciones
 * @param {string} opciones.proyecto - Directorio raíz del proyecto ORQI.
 * @param {object} opciones.manifest - Manifiesto ya validado.
 * @param {object} opciones.mapa - Mapa del proyecto descubierto.
 * @param {boolean} [opciones.dryRun=false] - Si true, no escribe archivos.
 * @returns {{ok: boolean, cambios: string[], errores: string[]}}
 */
export function patchShared({ proyecto, manifest, mapa, dryRun = false }) {
  const errores = [];
  const cambios = [];
  const names = deriveNames(manifest);
  names.paqueteBase = mapa.paqueteBase;
  names.seg = names.servicio.toLowerCase();

  // Rutas de los tres archivos
  const clientVaultFactoryPath = join(proyecto, 'orqi.application', 'src', 'main', 'java', ...mapa.paqueteBase.split('.'), 'application', 'ClientVaultFactory.java');
  const appFactoryPath = join(proyecto, 'orqi.application.services', 'src', 'main', 'java', ...mapa.paqueteBase.split('.'), 'application', 'service', 'ApplicationServiceFactory.java');
  const mainRestPath = join(proyecto, 'orqi.infraestructure.rest', 'src', 'main', 'java', ...mapa.paqueteBase.split('.'), 'infraestructure', 'rest', 'MainRest.java');

  // Leer contenidos originales
  const clientVaultContent = existsSync(clientVaultFactoryPath) ? readFileSync(clientVaultFactoryPath, 'utf8') : '';
  const appFactoryContent = existsSync(appFactoryPath) ? readFileSync(appFactoryPath, 'utf8') : '';
  const mainRestContent = existsSync(mainRestPath) ? readFileSync(mainRestPath, 'utf8') : '';

  if (!clientVaultContent) errores.push(`No se encontró ${clientVaultFactoryPath}`);
  if (!appFactoryContent) errores.push(`No se encontró ${appFactoryPath}`);
  if (!mainRestContent) errores.push(`No se encontró ${mainRestPath}`);

  if (errores.length > 0) {
    return { ok: false, cambios: [], errores };
  }

  // Aplicar parches en memoria (validación atómica)
  const r1 = patchClientVaultFactory(clientVaultContent, names, manifest);
  if (!r1.ok) errores.push(r1.error);
  else cambios.push(...r1.cambios);

  const r2 = patchApplicationServiceFactory(appFactoryContent, names);
  if (!r2.ok) errores.push(r2.error);
  else cambios.push(...r2.cambios);

  const r3 = patchMainRest(mainRestContent, names, mapa);
  if (!r3.ok) errores.push(r3.error);
  else cambios.push(...r3.cambios);

  // Si hay errores, no escribir nada (atomicidad)
  if (errores.length > 0) {
    return { ok: false, cambios: [], errores };
  }

  // Escribir archivos si no es dryRun
  if (!dryRun) {
    writeFileSync(clientVaultFactoryPath, r1.content, 'utf8');
    writeFileSync(appFactoryPath, r2.content, 'utf8');
    writeFileSync(mainRestPath, r3.content, 'utf8');
  }

  return { ok: true, cambios, errores: [] };
}