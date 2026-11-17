import { readFileSync } from 'node:fs';

const MODOS = new Set(['nuevo', 'agregar']);
const METODOS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);
const UBICACIONES = new Set(['path', 'query', 'body']);

const PAQUETE_JAVA = /^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;
const CAMPO_ENTIDAD = /^[A-Za-z_$][A-Za-z0-9_$]*\s*:\s*[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;

const esObjeto = (valor) => valor !== null && typeof valor === 'object' && !Array.isArray(valor);
const esTextoNoVacio = (valor) => typeof valor === 'string' && valor.trim() !== '';

function describir(valor) {
  return valor === undefined ? 'nada' : JSON.stringify(valor);
}

function exigirTexto(valor, ruta, pista, errores) {
  if (!esTextoNoVacio(valor)) {
    errores.push(`El campo "${ruta}" es obligatorio y no puede estar vacío. ${pista}`);
  }
}

/**
 * Valida un manifiesto en memoria.
 * @returns {{ ok: boolean, errors: string[] }} errores accionables en español.
 */
export function validateManifest(value) {
  const errores = [];

  if (!esObjeto(value)) {
    return {
      ok: false,
      errors: [
        'El manifiesto debe ser un objeto JSON con "modo", "servicio", "artefacto", "tipo", "entidad", "clientes", "rutas" y "vault".',
      ],
    };
  }

  if (!MODOS.has(value.modo)) {
    errores.push(
      `El campo "modo" debe ser "nuevo" o "agregar"; se recibió ${describir(value.modo)}. Indica si hay que crear el proyecto o sumar la rebanada a uno existente.`,
    );
  }

  exigirTexto(
    value.servicio,
    'servicio',
    'Escribe el nombre del servicio en PascalCase, por ejemplo "Producto".',
    errores,
  );
  exigirTexto(
    value.artefacto,
    'artefacto',
    'Usa una constante existente de EnumArtefactos, por ejemplo "STR_MON_STT_ORQI_REST"; no inventes una.',
    errores,
  );

  exigirTexto(
    value.paqueteBase,
    'paqueteBase',
    'Usa el paquete Java real del proyecto, por ejemplo "bo.gob.sin.sen.app.orqi.orqi".',
    errores,
  );
  if (esTextoNoVacio(value.paqueteBase) && !PAQUETE_JAVA.test(value.paqueteBase.trim())) {
    errores.push(
      `El campo "paqueteBase" no es un paquete Java válido: ${describir(value.paqueteBase)}. Usa segmentos separados por puntos, por ejemplo "bo.gob.sin.sen.app.orqi.orqi".`,
    );
  }

  if (value.tipo !== 'orquestado') {
    errores.push(
      `El campo "tipo" debe ser "orquestado"; se recibió ${describir(value.tipo)}. En v0.1 solo se generan endpoints orquestados.`,
    );
  }

  validarEntidad(value.entidad, errores);
  const idsOperaciones = validarClientes(value.clientes, errores);
  validarRutas(value.rutas, idsOperaciones, errores);
  validarVault(value.vault, errores);
  validarProyecto(value, errores);

  return { ok: errores.length === 0, errors: errores };
}

function validarEntidad(entidad, errores) {
  if (!esObjeto(entidad)) {
    errores.push(
      'El campo "entidad" debe ser un objeto con "nombre" y "campos"; por ejemplo {"nombre": "Producto", "campos": ["id:Long"]}.',
    );
    return;
  }

  exigirTexto(
    entidad.nombre,
    'entidad.nombre',
    'Escribe el nombre de la entidad en PascalCase, por ejemplo "Producto".',
    errores,
  );

  if (!Array.isArray(entidad.campos) || entidad.campos.length === 0) {
    errores.push(
      'El campo "entidad.campos" debe ser una lista no vacía con la forma "nombre:Tipo"; por ejemplo ["id:Long", "nombre:String"].',
    );
    return;
  }

  entidad.campos.forEach((campo, indice) => {
    if (typeof campo !== 'string' || !CAMPO_ENTIDAD.test(campo.trim())) {
      errores.push(
        `El campo "entidad.campos[${indice}]" debe tener la forma "nombre:Tipo" (por ejemplo "precio:BigDecimal"); se recibió ${describir(campo)}.`,
      );
    }
  });
}

function validarClientes(clientes, errores) {
  const ids = new Set();

  if (!Array.isArray(clientes) || clientes.length === 0) {
    errores.push(
      'El campo "clientes" debe ser una lista con al menos un cliente; cada cliente declara su artefacto y sus operaciones.',
    );
    return ids;
  }

  clientes.forEach((cliente, indiceCliente) => {
    const contexto = `clientes[${indiceCliente}]`;

    if (!esObjeto(cliente)) {
      errores.push(`El elemento "${contexto}" debe ser un objeto con "nombre", "artefacto" y "operaciones".`);
      return;
    }

    exigirTexto(
      cliente.nombre,
      `${contexto}.nombre`,
      'Escribe el nombre del cliente en PascalCase, por ejemplo "Producto".',
      errores,
    );
    exigirTexto(
      cliente.artefacto,
      `${contexto}.artefacto`,
      'Usa una constante existente de EnumArtefactos, por ejemplo "STR_MON_STT_REST"; no inventes una.',
      errores,
    );

    if (!Array.isArray(cliente.operaciones)) {
      errores.push(`El campo "${contexto}.operaciones" debe ser una lista de operaciones, aunque esté vacía.`);
      return;
    }

    const nombreCliente = esTextoNoVacio(cliente.nombre) ? cliente.nombre : contexto;
    const idsCliente = new Set();

    cliente.operaciones.forEach((operacion, indiceOperacion) => {
      validarOperacion(operacion, indiceOperacion, nombreCliente, idsCliente, ids, errores);
    });
  });

  return ids;
}

function validarOperacion(operacion, indice, nombreCliente, idsCliente, ids, errores) {
  const contexto = `La operación ${indice} del cliente "${nombreCliente}"`;

  if (!esObjeto(operacion)) {
    errores.push(
      `${contexto} debe ser un objeto con "id", "metodo", "path", "parametros", "request" y "response".`,
    );
    return;
  }

  if (!esTextoNoVacio(operacion.id)) {
    errores.push(`${contexto} necesita un "id" no vacío, por ejemplo "listar".`);
  } else if (idsCliente.has(operacion.id)) {
    errores.push(
      `El id de operación "${operacion.id}" está repetido en el cliente "${nombreCliente}": los ids deben ser únicos dentro de cada cliente.`,
    );
  } else {
    idsCliente.add(operacion.id);
    ids.add(operacion.id);
  }

  if (!METODOS.has(operacion.metodo)) {
    errores.push(
      `${contexto} tiene "metodo" ${describir(operacion.metodo)}; usa uno de GET, POST, PUT, DELETE o PATCH.`,
    );
  }

  if (!esTextoNoVacio(operacion.path) || !operacion.path.startsWith('/')) {
    errores.push(`${contexto} necesita un "path" que empiece con "/", por ejemplo "/rest/producto/lista".`);
  }

  if (!Array.isArray(operacion.parametros)) {
    errores.push(`${contexto} necesita "parametros" como lista, aunque esté vacía.`);
  } else {
    operacion.parametros.forEach((parametro, indiceParametro) => {
      validarParametro(parametro, indiceParametro, indice, nombreCliente, errores);
    });
  }

  if (operacion.request !== null && !esTextoNoVacio(operacion.request)) {
    errores.push(
      `${contexto} debe tener "request" en null o con el nombre de un tipo Java, por ejemplo "ProductoDto"; se recibió ${describir(operacion.request)}.`,
    );
  }

  if (!esTextoNoVacio(operacion.response)) {
    errores.push(
      `${contexto} necesita "response" con el nombre de un tipo Java, por ejemplo "RespuestaProducto".`,
    );
  }
}

function validarParametro(parametro, indiceParametro, indiceOperacion, nombreCliente, errores) {
  const contexto = `El parámetro ${indiceParametro} de la operación ${indiceOperacion} del cliente "${nombreCliente}"`;

  if (!esObjeto(parametro)) {
    errores.push(`${contexto} debe ser un objeto con "nombre", "tipo" y "en".`);
    return;
  }

  if (!esTextoNoVacio(parametro.nombre) || !esTextoNoVacio(parametro.tipo)) {
    errores.push(`${contexto} necesita "nombre" y "tipo" no vacíos.`);
  }

  if (!UBICACIONES.has(parametro.en)) {
    errores.push(`${contexto} tiene "en" ${describir(parametro.en)}; usa "path", "query" o "body".`);
  }
}

function validarRutas(rutas, idsOperaciones, errores) {
  if (!Array.isArray(rutas) || rutas.length === 0) {
    errores.push(
      'El campo "rutas" debe ser una lista con al menos una ruta pública; cada ruta apunta a una operación declarada.',
    );
    return;
  }

  rutas.forEach((ruta, indice) => {
    if (!esObjeto(ruta)) {
      errores.push(`La ruta ${indice} debe ser un objeto con "metodo", "path" y "operacion".`);
      return;
    }

    if (!METODOS.has(ruta.metodo)) {
      errores.push(`La ruta ${indice} tiene "metodo" ${describir(ruta.metodo)}; usa GET, POST, PUT, DELETE o PATCH.`);
    }

    if (!esTextoNoVacio(ruta.path) || !ruta.path.startsWith('/')) {
      errores.push(`La ruta ${indice} necesita un "path" que empiece con "/", por ejemplo "/rest/producto/lista".`);
    }

    if (!esTextoNoVacio(ruta.operacion)) {
      errores.push(`La ruta ${indice} necesita "operacion" con el id de una operación declarada en "clientes".`);
    } else if (!idsOperaciones.has(ruta.operacion)) {
      errores.push(
        `La ruta ${indice} usa "operacion" = ${describir(ruta.operacion)}, pero ningún cliente declara una operación con ese id; corrige el id o agrega la operación.`,
      );
    }
  });
}

function validarVault(vault, errores) {
  if (!esObjeto(vault)) {
    errores.push(
      'El campo "vault" debe ser un objeto con "data" e "internos"; usa "<pendiente>" si aún no tienes las claves.',
    );
    return;
  }

  if (typeof vault.data !== 'string') {
    errores.push('El campo "vault.data" debe ser un texto con la clave de Vault; usa "<pendiente>" si aún no la tienes.');
  }

  if (typeof vault.internos !== 'string') {
    errores.push(
      'El campo "vault.internos" debe ser un texto con la clave de Vault; usa "<pendiente>" si aún no la tienes.',
    );
  }
}

function validarProyecto(manifest, errores) {
  if (manifest.proyecto === undefined) {
    if (manifest.modo === 'agregar') {
      errores.push('El campo "proyecto" es obligatorio cuando "modo" es "agregar": indica la ruta del ORQI existente.');
    }
    return;
  }

  if (!esTextoNoVacio(manifest.proyecto)) {
    errores.push('El campo "proyecto" debe ser la ruta del ORQI existente como texto no vacío.');
  }
}

/**
 * Lee y valida un manifiesto desde disco.
 * @returns {{ ok: boolean, manifest: object | null, errors: string[] }}
 */
export function loadManifest(filePath) {
  let contenido;
  try {
    contenido = readFileSync(filePath, 'utf8');
  } catch (error) {
    return {
      ok: false,
      manifest: null,
      errors: [
        `No se pudo leer el manifiesto "${filePath}": ${error.message}. Verifica la ruta y los permisos del archivo.`,
      ],
    };
  }

  let manifest;
  try {
    manifest = JSON.parse(contenido);
  } catch (error) {
    return {
      ok: false,
      manifest: null,
      errors: [
        `No se pudo interpretar el JSON del manifiesto "${filePath}": ${error.message}. Corrige la sintaxis y vuelve a intentar.`,
      ],
    };
  }

  const { ok, errors } = validateManifest(manifest);
  if (!ok) {
    return {
      ok: false,
      manifest: null,
      errors: errors.map((error) => `Manifiesto inválido en "${filePath}": ${error}`),
    };
  }

  return { ok: true, manifest, errors: [] };
}
