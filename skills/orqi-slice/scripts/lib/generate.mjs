/**
 * Generador de rebanadas ORQI.
 *
 * Valida el manifiesto; descubre el proyecto si no hay mapa; calcula las 10 rutas
 * de salida; verifica colisiones (archivo existente idéntico → omitir, distinto
 * → error y no escribir nada); en `dryRun` solo lista; escribe con `mkdir -p`.
 * El documento `docs/orqi/<seg>.md` lista servicio, rutas, clientes, artefactos,
 * Vault y `TODO`.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateManifest, loadManifest } from './manifest.mjs';
import { deriveNames, toLowerConcat } from './naming.mjs';
import { render } from './render.mjs';
import { javaFields, javaAccessors, javaImports, clientMethods, serviceMethods, controllerRoutes, controllerRouteFields } from './java.mjs';
import { discoverProject } from './discover.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES_DIR = join(__dirname, '..', '..', 'templates');

function readTemplate(name) {
  return readFileSync(join(TEMPLATES_DIR, name), 'utf8');
}

/**
 * Calcula las 10 rutas de salida relativas a la raíz del proyecto.
 * @returns {Array<{key: string, path: string, template: string, context: object}>}
 */
function computeOutputs(proyecto, names, manifest, mapa) {
  const pkgPath = names.pkgPath ?? packageToPath(names.paqueteBase);
  const seg = names.seg ?? toLowerConcat(names.servicio);

  // El paquete base viene del mapa descubierto o del manifiesto
  const paqueteBase = mapa?.paqueteBase ?? manifest.paqueteBase;

  const outputs = [];

  // 1. DTO
  outputs.push({
    key: 'dto',
    path: join(proyecto, 'orqi.application', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'clients', seg, `${names.clases.dto}.java`),
    template: 'Dto.java.tpl',
    context: buildDtoContext(names, manifest, paqueteBase, seg),
  });

  // 2. SolicitudLista
  outputs.push({
    key: 'solicitudLista',
    path: join(proyecto, 'orqi.application', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'clients', seg, `${names.clases.solicitudLista}.java`),
    template: 'SolicitudLista.java.tpl',
    context: buildSolicitudListaContext(names, manifest, paqueteBase, seg),
  });

  // 3. Respuesta
  outputs.push({
    key: 'respuesta',
    path: join(proyecto, 'orqi.application', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'clients', seg, `${names.clases.respuesta}.java`),
    template: 'Respuesta.java.tpl',
    context: buildRespuestaContext(names, manifest, paqueteBase, seg),
  });

  // 4. RespuestaLista
  outputs.push({
    key: 'respuestaLista',
    path: join(proyecto, 'orqi.application', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'clients', seg, `${names.clases.respuestaLista}.java`),
    template: 'RespuestaLista.java.tpl',
    context: buildRespuestaListaContext(names, manifest, paqueteBase, seg),
  });

  // 5. IClient
  outputs.push({
    key: 'clientInterface',
    path: join(proyecto, 'orqi.application', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'clients', seg, `${names.clases.clientInterface}.java`),
    template: 'IClient.java.tpl',
    context: buildIClientContext(names, manifest, paqueteBase, seg),
  });

  // 6. IService
  outputs.push({
    key: 'serviceInterface',
    path: join(proyecto, 'orqi.application', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'orquestadores', `${names.clases.serviceInterface}.java`),
    template: 'IService.java.tpl',
    context: buildIServiceContext(names, manifest, paqueteBase, seg),
  });

  // 7. ServiceImpl
  outputs.push({
    key: 'serviceImpl',
    path: join(proyecto, 'orqi.application.services', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'service', seg, `${names.clases.serviceImpl}.java`),
    template: 'ServiceImpl.java.tpl',
    context: buildServiceImplContext(names, manifest, paqueteBase, seg),
  });

  // 8. ClientImpl
  outputs.push({
    key: 'clientImpl',
    path: join(proyecto, 'orqi.application.services', 'src', 'main', 'java', ...paqueteBase.split('.'), 'application', 'service', 'clients', `${names.clases.clientImpl}.java`),
    template: 'ClientImpl.java.tpl',
    context: buildClientImplContext(names, manifest, paqueteBase, seg),
  });

  // 9. Controller
  outputs.push({
    key: 'controller',
    path: join(proyecto, 'orqi.infraestructure.rest', 'src', 'main', 'java', ...paqueteBase.split('.'), 'infraestructure', 'rest', 'controller', seg, `${names.clases.controller}.java`),
    template: 'Controller.java.tpl',
    context: buildControllerContext(names, manifest, paqueteBase, seg),
  });

  // 10. Documento
  outputs.push({
    key: 'doc',
    path: join(proyecto, 'docs', 'orqi', `${seg}.md`),
    template: 'doc.md.tpl',
    context: buildDocContext(names, manifest, paqueteBase, seg),
  });

  return outputs;
}

function packageToPath(pkg) {
  return String(pkg).split('.').join('/');
}

function toKebab(value) {
  return String(value ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((palabra) => palabra.toLowerCase())
    .join('-');
}

function toCamel(value) {
  const palabras = String(value ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((palabra) => palabra.toLowerCase());
  if (!palabras.length) return '';
  return palabras[0] + palabras.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}

// Context builders

function buildDtoContext(names, manifest, paqueteBase, seg) {
  const campos = manifest.entidad?.campos ?? [];
  return {
    paqueteBase,
    seg,
    imports: javaImports(['bo.gob.sin.sen.onion.domain.models.dtos.ModelDto']),
    'clases.dto': names.clases.dto,
    fields: javaFields(campos),
    accessors: javaAccessors(campos, names.clases.dto),
  };
}

function buildSolicitudListaContext(names, manifest, paqueteBase, seg) {
  // La solicitud de lista típicamente tiene campos de paginación/filtro
  // Usamos campos vacíos por defecto, se pueden extender según necesidad
  const campos = []; // SolicitudLista suele ser vacía o con campos de filtro
  return {
    paqueteBase,
    seg,
    imports: '',
    'clases.solicitudLista': names.clases.solicitudLista,
    fields: javaFields(campos),
    accessors: javaAccessors(campos, names.clases.solicitudLista),
  };
}

function buildRespuestaContext(names, manifest, paqueteBase, seg) {
  const campos = manifest.entidad?.campos ?? [];
  const camelRespuesta = toCamel(names.clases.respuesta);
  return {
    paqueteBase,
    seg,
    imports: javaImports([
      'bo.gob.sin.sen.onion.application.impl.RespuestaStatus',
      'bo.gob.sin.sen.onion.domain.MensajeServicio',
      'java.util.List',
    ]),
    'clases.respuesta': names.clases.respuesta,
    fields: javaFields(campos),
    accessors: javaAccessors(campos, names.clases.respuesta),
    camelRespuesta,
  };
}

function buildRespuestaListaContext(names, manifest, paqueteBase, seg) {
  // RespuestaLista contiene una lista del DTO
  const campoLista = [`lista${names.entidad}:java.util.List<${names.clases.dto}>`];
  const camelRespuestaLista = toCamel(names.clases.respuestaLista);
  return {
    paqueteBase,
    seg,
    imports: javaImports([
      'bo.gob.sin.sen.onion.application.impl.RespuestaStatus',
      'bo.gob.sin.sen.onion.domain.MensajeServicio',
      'java.util.List',
    ]),
    'clases.respuestaLista': names.clases.respuestaLista,
    fields: javaFields(campoLista),
    accessors: javaAccessors(campoLista, names.clases.respuestaLista),
    camelRespuestaLista,
  };
}

function buildIClientContext(names, manifest, paqueteBase, seg) {
  // Imports para los tipos de request/response
  const imports = new Set([
    'bo.gob.sin.sen.onion.application.IApplicationService',
  ]);
  for (const op of names.operaciones) {
    if (op.request) imports.add(`${paqueteBase}.application.clients.${seg}.${op.request}`);
    imports.add(`${paqueteBase}.application.clients.${seg}.${op.response}`);
  }
  const methods = clientMethods(names.operaciones, names, { cuerpo: false });
  return {
    paqueteBase,
    seg,
    imports: javaImports(Array.from(imports)),
    'clases.clientInterface': names.clases.clientInterface,
    methods,
  };
}

function buildIServiceContext(names, manifest, paqueteBase, seg) {
  const methods = serviceMethods(names.operaciones, names, { cuerpo: false });
  return {
    paqueteBase,
    seg,
    imports: '',
    'clases.serviceInterface': names.clases.serviceInterface,
    'clases.dto': names.clases.dto,
    'clases.respuesta': names.clases.respuesta,
    methods,
  };
}

function buildServiceImplContext(names, manifest, paqueteBase, seg) {
  const methods = serviceMethods(names.operaciones, names, { cuerpo: true });
  // Usamos el primer método como método privado base (el que llama al cliente)
  const primerMetodo = names.operaciones[0]?.metodoJava ?? 'ejecutar';
  const accion = primerMetodo.replace(/^[a-z]+/, m => m.toLowerCase());
  return {
    paqueteBase,
    seg,
    imports: '',
    'clases.serviceImpl': names.clases.serviceImpl,
    'clases.dto': names.clases.dto,
    'clases.respuesta': names.clases.respuesta,
    'clases.serviceInterface': names.clases.serviceInterface,
    'clases.clientImpl': names.clases.clientImpl,
    methods,
    descripcionClase: '',
    autor: '',
    version: '',
    metodoPrivado: primerMetodo,
    accion,
  };
}

function buildClientImplContext(names, manifest, paqueteBase, seg) {
  const methods = clientMethods(names.operaciones, names, { cuerpo: true });
  const camelServicio = toCamel(names.servicio);
  return {
    paqueteBase,
    seg,
    imports: '',
    'clases.clientImpl': names.clases.clientImpl,
    'clases.dto': names.clases.dto,
    'clases.clientInterface': names.clases.clientInterface,
    'clases.respuesta': names.clases.respuesta,
    'factories.clientVaultMethod': names.factories.clientVaultMethod,
    methods,
    descripcionClase: '',
    autor: '',
    version: '',
    rutaBase: names.rutaBase,
    camelServicio,
  };
}

function buildControllerContext(names, manifest, paqueteBase, seg) {
  const routeFields = controllerRouteFields(names.operaciones, names);
  return {
    paqueteBase,
    seg,
    imports: '',
    'clases.controller': names.clases.controller,
    'clases.dto': names.clases.dto,
    'clases.clientImpl': names.clases.clientImpl,
    descripcionClase: '',
    autor: '',
    version: '',
    routeFields,
  };
}

function buildDocContext(names, manifest, paqueteBase, seg) {
  const rutasList = (manifest.rutas ?? [])
    .map(r => `- \`${r.metodo} ${r.path}\` → \`${r.operacion}\``)
    .join('\n');

  const clientesList = (manifest.clientes ?? [])
    .map(cliente => {
      const ops = (cliente.operaciones ?? [])
        .map(op => {
          const params = (op.parametros ?? [])
            .map(p => `${p.nombre}:${p.tipo} (${p.en})`)
            .join(', ');
          return `- **${op.id}** (\`${op.metodo} ${op.path}\`)\n  - Parámetros: ${params}\n  - Request: ${op.request ?? 'null'}\n  - Response: ${op.response}`;
        })
        .join('\n');
      return `### ${cliente.nombre} (${cliente.artefacto})\n${ops}`;
    })
    .join('\n\n');

  return {
    servicio: names.servicio,
    entidad: names.entidad,
    rutaBase: names.rutaBase,
    paqueteBase,
    artefacto: manifest.artefacto,
    vaultData: manifest.vault?.data ?? '<pendiente>',
    vaultInternos: manifest.vault?.internos ?? '<pendiente>',
    rutasList,
    clientesList,
    seg,
    dto: names.clases.dto,
    solicitudLista: names.clases.solicitudLista,
    respuesta: names.clases.respuesta,
    respuestaLista: names.clases.respuestaLista,
    clientInterface: names.clases.clientInterface,
    serviceInterface: names.clases.serviceInterface,
    serviceImpl: names.clases.serviceImpl,
    clientImpl: names.clases.clientImpl,
    controller: names.clases.controller,
  };
}

/**
 * Valida que los IDs de operación sean únicos globalmente.
 */
function validateUniqueOperationIds(manifest) {
  const ids = new Set();
  const duplicados = [];
  for (const cliente of manifest.clientes ?? []) {
    for (const op of cliente.operaciones ?? []) {
      if (ids.has(op.id)) {
        duplicados.push(op.id);
      } else {
        ids.add(op.id);
      }
    }
  }
  return duplicados;
}

/**
 * Genera una rebanada ORQI.
 *
 * @param {object} opciones
 * @param {string} opciones.proyecto - Directorio raíz del proyecto ORQI.
 * @param {object} opciones.manifest - Manifiesto ya validado.
 * @param {object} [opciones.mapa] - Mapa del proyecto descubierto (opcional, se descubre si falta).
 * @param {boolean} [opciones.dryRun=false] - Si true, no escribe archivos.
 * @returns {{ok: boolean, archivos: string[], colisiones: string[], errores: string[]}}
 */
export function generateSlice({ proyecto, manifest, mapa, dryRun = false }) {
  const errores = [];
  const colisiones = [];

  // 1. Validar manifiesto
  const { ok: manifestOk, errors: manifestErrors } = validateManifest(manifest);
  if (!manifestOk) {
    return { ok: false, archivos: [], colisiones: [], errores: manifestErrors };
  }

  // 2. Validar IDs de operación únicos globalmente
  const duplicados = validateUniqueOperationIds(manifest);
  if (duplicados.length > 0) {
    return {
      ok: false,
      archivos: [],
      colisiones: [],
      errores: [`IDs de operación duplicados globalmente: ${duplicados.join(', ')}. Cada operación debe tener un id único en todo el manifiesto.`],
    };
  }

  // 3. Descubrir proyecto si no hay mapa
  let mapaProyecto = mapa;
  if (!mapaProyecto) {
    const { ok: discoverOk, errores: discoverErrores, mapa: discoveredMapa } = discoverProject(proyecto);
    if (!discoverOk) {
      return { ok: false, archivos: [], colisiones: [], errores: discoverErrores };
    }
    mapaProyecto = discoveredMapa;
  }

  // 4. Derivar nombres
  const names = deriveNames(manifest);

  // 5. Calcular salidas
  const outputs = computeOutputs(proyecto, names, manifest, mapaProyecto);

  // 6. Verificar colisiones y escribir archivos (o solo listar en dryRun)
  const archivos = [];
  for (const output of outputs) {
    const rendered = render(readTemplate(output.template), output.context);
    
    if (existsSync(output.path)) {
      const existing = readFileSync(output.path, 'utf8');
      if (existing !== rendered) {
        colisiones.push(relative(proyecto, output.path));
      } else {
        // Contenido idéntico: omitir (idempotente)
        continue;
      }
    }
    
    if (!dryRun) {
      mkdirSync(dirname(output.path), { recursive: true });
      writeFileSync(output.path, rendered, 'utf8');
    }
    archivos.push(relative(proyecto, output.path));
  }

  if (colisiones.length > 0) {
    return { ok: false, archivos: [], colisiones, errores: [] };
  }

  return { ok: true, archivos, colisiones: [], errores: [] };
}