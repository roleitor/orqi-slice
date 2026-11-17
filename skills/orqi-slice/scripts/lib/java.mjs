/**
 * Fragmentos Java para las plantillas de una rebanada ORQI.
 *
 * Las funciones reciben datos ya derivados (`deriveNames`) y devuelven texto
 * listo para insertar en una plantilla. No leen ni escriben archivos.
 */

import { toCamel, toSparkPath } from './naming.mjs';

const SANGRIA = '    ';

/** Convierte `nombre:Tipo` en sus dos partes, recortando espacios. */
function partesCampo(campo) {
  if (typeof campo !== 'string') {
    throw new TypeError(`El campo debe ser un texto "nombre:Tipo"; se recibió ${JSON.stringify(campo)}.`);
  }

  const separador = campo.indexOf(':');
  const nombre = separador === -1 ? '' : campo.slice(0, separador).trim();
  const tipo = separador === -1 ? '' : campo.slice(separador + 1).trim();

  if (!nombre || !tipo) {
    throw new TypeError(`El campo "${campo}" debe tener la forma "nombre:Tipo", por ejemplo "precio:BigDecimal".`);
  }

  return { nombre, tipo };
}

/** `precio` -> `Precio`, para componer getPrecio/setPrecio. */
function sufijoAccesor(nombre) {
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

/** Nombre del parámetro que transporta el request, derivado de su tipo. */
function nombreRequest(tipo) {
  return toCamel(tipo);
}

/** `Long id, ProductoDto productoDto` a partir de los parámetros y el request. */
function parametrosFirma(operacion) {
  const parametros = (operacion.parametros ?? []).map(
    (parametro) => `${parametro.tipo} ${parametro.nombre}`,
  );

  if (operacion.request) {
    parametros.push(`${operacion.request} ${nombreRequest(operacion.request)}`);
  }

  return parametros.join(', ');
}

/** Nombre Java del método, con el mismo fallback que `deriveNames`. */
function nombreMetodo(operacion, names) {
  if (operacion.metodoJava) return operacion.metodoJava;
  return `${operacion.id}${names.entidad}`;
}

/** Ruta Spark relativa a `rutaBase`; falla si la operación está fuera de ella. */
function rutaRelativa(operacion, names) {
  const ruta = operacion.sparkPath ?? toSparkPath(operacion.apiPath ?? operacion.path ?? '');
  const base = names.rutaBase;

  if (ruta === base) return '';
  if (ruta.startsWith(`${base}/`)) return ruta.slice(base.length);

  throw new RangeError(
    `La ruta "${ruta}" de la operación "${operacion.id}" está fuera de rutaBase "${base}"; corrige el manifiesto para que todas las rutas cuelguen de la ruta base del servicio.`,
  );
}

/** Cuerpo común de los métodos de cliente y de servicio. */
function metodos(operaciones, names, opciones) {
  const conCuerpo = opciones?.cuerpo ?? true;

  return operaciones
    .map((operacion) => {
      const firma = `${operacion.response} ${nombreMetodo(operacion, names)}(${parametrosFirma(operacion)})`;

      if (!conCuerpo) return `${SANGRIA}${firma};`;

      return `${SANGRIA}@Override
${SANGRIA}public ${firma} {
${SANGRIA}${SANGRIA}throw new UnsupportedOperationException("TODO");
${SANGRIA}}`;
    })
    .join('\n\n');
}

/**
 * Campos privados de un DTO o respuesta.
 *
 * @param {string[]} campos lista con la forma `nombre:Tipo`.
 * @returns {string} una línea `private Tipo nombre;` por campo.
 */
export function javaFields(campos) {
  return campos
    .map((campo) => {
      const { nombre, tipo } = partesCampo(campo);
      return `${SANGRIA}private ${tipo} ${nombre};`;
    })
    .join('\n');
}

/**
 * Getters y setters de un DTO o respuesta.
 *
 * @param {string[]} campos lista con la forma `nombre:Tipo`.
 * @param {string} className nombre de la clase; se conserva por contrato de las
 *   plantillas, aunque getters y setters no dependen de él.
 * @returns {string} los accesores, separados por una línea en blanco.
 */
export function javaAccessors(campos, className) {
  return campos
    .map((campo) => {
      const { nombre, tipo } = partesCampo(campo);
      const sufijo = sufijoAccesor(nombre);

      return `${SANGRIA}public ${tipo} get${sufijo}() {
${SANGRIA}${SANGRIA}return ${nombre};
${SANGRIA}}

${SANGRIA}public void set${sufijo}(${tipo} ${nombre}) {
${SANGRIA}${SANGRIA}this.${nombre} = ${nombre};
${SANGRIA}}`;
    })
    .join('\n\n');
}

/**
 * Sentencias `import` a partir de nombres calificados.
 *
 * @param {string[]} imports nombres calificados, por ejemplo `java.util.Date`.
 * @returns {string} una sentencia por import, sin duplicados y en el orden dado.
 */
export function javaImports(imports) {
  const vistos = new Set();
  const lineas = [];

  for (const nombre of imports) {
    if (typeof nombre !== 'string') {
      throw new TypeError(`Cada import debe ser un texto con el nombre calificado; se recibió ${JSON.stringify(nombre)}.`);
    }

    const limpio = nombre.trim();
    if (!limpio || vistos.has(limpio)) continue;

    vistos.add(limpio);
    lineas.push(`import ${limpio};`);
  }

  return lineas.join('\n');
}

/**
 * Métodos de `IClient`/`Client` para cada operación.
 *
 * Por defecto devuelve implementaciones con `@Override` y un cuerpo TODO; con
 * `{ cuerpo: false }` devuelve solo las firmas para la interfaz.
 *
 * @param {object[]} operaciones operaciones derivadas por `deriveNames`.
 * @param {object} names resultado completo de `deriveNames`.
 * @param {{ cuerpo?: boolean }} [opciones]
 * @returns {string} los métodos, separados por una línea en blanco.
 */
export function clientMethods(operaciones, names, opciones) {
  return metodos(operaciones, names, opciones);
}

/**
 * Métodos de `IService`/`ServiceImpl` para cada operación.
 *
 * Comparte la forma de `clientMethods`: implementaciones con `@Override` y
 * TODO por defecto, o solo firmas con `{ cuerpo: false }`.
 *
 * @param {object[]} operaciones operaciones derivadas por `deriveNames`.
 * @param {object} names resultado completo de `deriveNames`.
 * @param {{ cuerpo?: boolean }} [opciones]
 * @returns {string} los métodos, separados por una línea en blanco.
 */
export function serviceMethods(operaciones, names, opciones) {
  return metodos(operaciones, names, opciones);
}

/**
 * Rutas Spark del controller, relativas a `rutaBase`.
 *
 * Cada ruta referencia el campo `Route` estático del controller y usa el verbo
 * en minúsculas (`get`, `post`, `put`, `delete`, `patch`).
 *
 * @param {object[]} operaciones operaciones derivadas por `deriveNames`.
 * @param {object} names resultado completo de `deriveNames`.
 * @returns {string} una sentencia de ruta por operación.
 */
export function controllerRoutes(operaciones, names) {
  return operaciones
    .map((operacion) => {
      const verbo = String(operacion.metodoHttp).toLowerCase();
      const ruta = rutaRelativa(operacion, names);

      return `${SANGRIA}${verbo}("${ruta}", ${names.clases.controller}.${nombreMetodo(operacion, names)}, JsonTransformer.getInstance());`;
    })
    .join('\n');
}

/**
 * Campos `Route` estáticos del controller (para la plantilla Controller.java).
 *
 * Cada operación genera un campo `public static final Route <metodoJava> = ...`
 * con el cuerpo que llama al servicio correspondiente.
 *
 * @param {object[]} operaciones operaciones derivadas por `deriveNames`.
 * @param {object} names resultado completo de `deriveNames`.
 * @returns {string} los campos Route, separados por una línea en blanco.
 */
export function controllerRouteFields(operaciones, names) {
  return operaciones
    .map((operacion) => {
      const metodo = nombreMetodo(operacion, names);
      const responseType = operacion.response;
      const requestType = operacion.request;
      const serviceFactoryMethod = `get${names.servicio}Service`;

      let body = '';
      if (requestType) {
        body = `${SANGRIA}public static final Route ${metodo} = (request, response) -> {\n${SANGRIA}${SANGRIA}try {\n${SANGRIA}${SANGRIA}${SANGRIA}var vService = ApplicationServiceFactory.${serviceFactoryMethod}();\n${SANGRIA}${SANGRIA}${SANGRIA}var vContext = JWTValidator.context(request.headers(JWTValidator.AUTHORIZATION));\n${SANGRIA}${SANGRIA}${SANGRIA}vService.setServiceContext(vContext);\n${SANGRIA}${SANGRIA}${SANGRIA}var vSolicitud = jsonBuilder.fromJson(request.body(), ${requestType}.class);\n${SANGRIA}${SANGRIA}${SANGRIA}return vService.${metodo}(vSolicitud).join();\n${SANGRIA}${SANGRIA}} catch (Exception ex) {\n${SANGRIA}${SANGRIA}${SANGRIA}Log.error(ex, "Error al ${metodo.replace(/^[a-z]+/, m => m.toLowerCase())} ${names.entidad}", null);\n${SANGRIA}${SANGRIA}${SANGRIA}response.status(HttpStatus.BAD_REQUEST_400);\n${SANGRIA}${SANGRIA}${SANGRIA}return null;\n${SANGRIA}${SANGRIA}}\n${SANGRIA}};`;
      } else {
        body = `${SANGRIA}public static final Route ${metodo} = (request, response) -> {\n${SANGRIA}${SANGRIA}try {\n${SANGRIA}${SANGRIA}${SANGRIA}var vService = ApplicationServiceFactory.${serviceFactoryMethod}();\n${SANGRIA}${SANGRIA}${SANGRIA}var vContext = JWTValidator.context(request.headers(JWTValidator.AUTHORIZATION));\n${SANGRIA}${SANGRIA}${SANGRIA}vService.setServiceContext(vContext);\n${SANGRIA}${SANGRIA}${SANGRIA}return vService.${metodo}().join();\n${SANGRIA}${SANGRIA}} catch (Exception ex) {\n${SANGRIA}${SANGRIA}${SANGRIA}Log.error(ex, "Error al ${metodo.replace(/^[a-z]+/, m => m.toLowerCase())} ${names.entidad}", null);\n${SANGRIA}${SANGRIA}${SANGRIA}response.status(HttpStatus.BAD_REQUEST_400);\n${SANGRIA}${SANGRIA}${SANGRIA}return null;\n${SANGRIA}${SANGRIA}}\n${SANGRIA}};`;
      }
      return body;
    })
    .join('\n\n');
}
