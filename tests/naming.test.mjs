import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveNames,
  packageToPath,
  toCamel,
  toKebab,
  toPascal,
  toSparkPath,
} from '../skills/orqi-slice/scripts/lib/naming.mjs';
import { validManifest } from './helpers/fixture.mjs';

test('convierte nombres y paquetes', () => {
  assert.equal(toPascal('producto'), 'Producto');
  assert.equal(toCamel('Producto'), 'producto');
  assert.equal(toKebab('Producto'), 'producto');
  assert.equal(toPascal('producto-detalle'), 'ProductoDetalle');
  assert.equal(toCamel('producto_detalle'), 'productoDetalle');
  assert.equal(toKebab('ProductoDetalle'), 'producto-detalle');
  assert.equal(packageToPath('bo.gob.sin.sen'), 'bo/gob/sin/sen');
  assert.equal(toSparkPath('/rest/producto/{id}'), '/rest/producto/:id');
  assert.equal(toSparkPath('/rest/producto/{id}/detalle/{clave}'), '/rest/producto/:id/detalle/:clave');
});

test('deriva clases y métodos de productos', () => {
  const n = deriveNames(validManifest());
  assert.equal(n.clases.dto, 'ProductoDto');
  assert.equal(n.clases.solicitudLista, 'SolicitudListaProducto');
  assert.equal(n.clases.clientInterface, 'IProductoClient');
  assert.equal(n.clases.serviceImpl, 'ProductoServiceImpl');
  assert.equal(n.factories.clientVaultMethod, 'producto');
  assert.equal(n.factories.serviceFactoryMethod, 'getProductoService');
  assert.equal(n.operaciones[1].metodoJava, 'obtenerProducto');
  assert.equal(n.operaciones[1].sparkPath, '/rest/producto/:id');
});

test('respeta metodoJava explícito', () => {
  const m = validManifest();
  m.clientes[0].operaciones[0].metodoJava = 'consultarProductos';
  const n = deriveNames(m);
  assert.equal(n.operaciones[0].metodoJava, 'consultarProductos');
});

test('deriva la forma completa de clases, factories y operaciones', () => {
  const n = deriveNames(validManifest());

  assert.equal(n.servicio, 'Producto');
  assert.equal(n.entidad, 'Producto');
  assert.equal(n.rutaBase, '/rest/producto');

  assert.deepEqual(n.clases, {
    dto: 'ProductoDto',
    solicitudLista: 'SolicitudListaProducto',
    respuesta: 'RespuestaProducto',
    respuestaLista: 'RespuestaListaProducto',
    clientInterface: 'IProductoClient',
    serviceInterface: 'IProductoService',
    clientImpl: 'ProductoClient',
    serviceImpl: 'ProductoServiceImpl',
    controller: 'ProductoController',
  });

  assert.deepEqual(n.factories, {
    clientVaultMethod: 'producto',
    serviceFactoryMethod: 'getProductoService',
  });

  assert.equal(n.operaciones.length, 3);
  assert.deepEqual(n.operaciones[0], {
    id: 'listar',
    metodoJava: 'listarProducto',
    metodoHttp: 'GET',
    apiPath: '/rest/producto/lista',
    sparkPath: '/rest/producto/lista',
    parametros: [],
    request: null,
    response: 'RespuestaListaProducto',
  });
  assert.equal(n.operaciones[1].apiPath, '/rest/producto/{id}');
  assert.deepEqual(n.operaciones[1].parametros, [{ nombre: 'id', tipo: 'Long', en: 'path' }]);
  assert.equal(n.operaciones[2].metodoHttp, 'POST');
});
