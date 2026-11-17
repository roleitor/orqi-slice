/**
 * Derivación pura de nombres y rutas de una rebanada ORQI.
 * No lee ni escribe archivos: recibe un manifiesto ya validado.
 */

const esTextoNoVacio = (valor) => typeof valor === 'string' && valor.trim() !== '';

/** Separa un identificador en palabras en minúsculas (camel, kebab o snake). */
function palabras(value) {
  return String(value ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((palabra) => palabra.toLowerCase());
}

function capitalizar(palabra) {
  return palabra.charAt(0).toUpperCase() + palabra.slice(1);
}

/** `producto-detalle` / `producto_detalle` -> `ProductoDetalle`. */
export function toPascal(value) {
  return palabras(value).map(capitalizar).join('');
}

/** `ProductoDetalle` -> `productoDetalle`. */
export function toCamel(value) {
  const [primera, ...resto] = palabras(value);
  if (!primera) return '';
  return primera + resto.map(capitalizar).join('');
}

/** `ProductoDetalle` -> `producto-detalle`. */
export function toKebab(value) {
  return palabras(value).join('-');
}

/** `ProductoDetalle` -> `productodetalle` (Java-safe package segment, lowercase concatenated). */
export function toLowerConcat(value) {
  return palabras(value).join('');
}

/** `bo.gob.sin.sen` -> `bo/gob/sin/sen`. */
export function packageToPath(pkg) {
  return String(pkg).split('.').join('/');
}

/** Rutas OpenAPI a rutas Spark: `/rest/producto/{id}` -> `/rest/producto/:id`. */
export function toSparkPath(path) {
  return String(path).replace(/\{([^{}]+)\}/g, ':$1');
}

/**
 * Deriva los nombres de clases, métodos de factories, ruta base y operaciones.
 *
 * @param {object} manifest manifiesto validado con `validateManifest`.
 * @returns {{
 *   servicio: string,
 *   entidad: string,
 *   clases: {
 *     dto: string,
 *     solicitudLista: string,
 *     respuesta: string,
 *     respuestaLista: string,
 *     clientInterface: string,
 *     serviceInterface: string,
 *     clientImpl: string,
 *     serviceImpl: string,
 *     controller: string,
 *   },
 *   factories: { clientVaultMethod: string, serviceFactoryMethod: string },
 *   rutaBase: string,
 *   operaciones: Array<{
 *     id: string,
 *     metodoJava: string,
 *     metodoHttp: string,
 *     apiPath: string,
 *     sparkPath: string,
 *     parametros: object[],
 *     request: string | null,
 *     response: string,
 *   }>,
 * }}
 */
export function deriveNames(manifest) {
  const servicio = toPascal(manifest.servicio);
  const entidad = toPascal(manifest.entidad.nombre);
  const rutaBase = `/rest/${toKebab(servicio)}`;

  const clases = {
    dto: `${entidad}Dto`,
    solicitudLista: `SolicitudLista${entidad}`,
    respuesta: `Respuesta${entidad}`,
    respuestaLista: `RespuestaLista${entidad}`,
    clientInterface: `I${servicio}Client`,
    serviceInterface: `I${servicio}Service`,
    clientImpl: `${servicio}Client`,
    serviceImpl: `${servicio}ServiceImpl`,
    controller: `${servicio}Controller`,
  };

  const factories = {
    clientVaultMethod: toCamel(servicio),
    serviceFactoryMethod: `get${servicio}Service`,
  };

  const operaciones = [];
  for (const cliente of manifest.clientes) {
    for (const operacion of cliente.operaciones) {
      operaciones.push({
        id: operacion.id,
        metodoJava: esTextoNoVacio(operacion.metodoJava)
          ? operacion.metodoJava
          : `${operacion.id}${entidad}`,
        metodoHttp: operacion.metodo,
        apiPath: operacion.path,
        sparkPath: toSparkPath(operacion.path),
        parametros: (operacion.parametros ?? []).map((parametro) => ({ ...parametro })),
        request: operacion.request,
        response: operacion.response,
      });
    }
  }

  return { servicio, entidad, clases, factories, rutaBase, operaciones };
}
