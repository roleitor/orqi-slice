import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deriveNames } from '../skills/orqi-slice/scripts/lib/naming.mjs';
import {
  clientMethods,
  controllerRoutes,
  javaAccessors,
  javaFields,
  javaImports,
  serviceMethods,
} from '../skills/orqi-slice/scripts/lib/java.mjs';
import { validManifest } from './helpers/fixture.mjs';

const names = () => deriveNames(validManifest());

const METODOS_CLIENTE = `    @Override
    public RespuestaListaProducto listarProducto() {
        throw new UnsupportedOperationException("TODO");
    }

    @Override
    public RespuestaProducto obtenerProducto(Long id) {
        throw new UnsupportedOperationException("TODO");
    }

    @Override
    public RespuestaProducto crearProducto(ProductoDto productoDto) {
        throw new UnsupportedOperationException("TODO");
    }`;

test('genera campos y accesores', () => {
  const campos = ['precio:BigDecimal', 'nombre:String'];
  assert.match(javaFields(campos), /private BigDecimal precio;/);
  assert.match(javaAccessors(campos, 'ProductoDto'), /public BigDecimal getPrecio\(\)/);
  assert.match(javaAccessors(campos, 'ProductoDto'), /public void setPrecio\(BigDecimal precio\)/);
});

test('usa los tipos Java exactos y recorta espacios', () => {
  assert.equal(
    javaFields([' texto : String ', 'entero:Integer', 'largo:Long', 'decimal:BigDecimal', 'booleano:Boolean', 'fecha:Date']),
    `    private String texto;
    private Integer entero;
    private Long largo;
    private BigDecimal decimal;
    private Boolean booleano;
    private Date fecha;`,
  );
});

test('rechaza un campo sin tipo', () => {
  assert.throws(() => javaFields(['precio']), /precio/);
});

test('compone getters y setters con el nombre del campo', () => {
  assert.equal(
    javaAccessors(['precio:BigDecimal', 'nombre:String'], 'ProductoDto'),
    `    public BigDecimal getPrecio() {
        return precio;
    }

    public void setPrecio(BigDecimal precio) {
        this.precio = precio;
    }

    public String getNombre() {
        return nombre;
    }

    public void setNombre(String nombre) {
        this.nombre = nombre;
    }`,
  );
});

test('genera imports sin duplicados y conserva el orden', () => {
  assert.equal(
    javaImports(['java.util.Date', 'java.math.BigDecimal', 'java.util.Date']),
    `import java.util.Date;
import java.math.BigDecimal;`,
  );
  assert.equal(javaImports([]), '');
});

test('rechaza imports que no son textos', () => {
  assert.throws(() => javaImports([null]), /import/i);
  assert.throws(() => javaImports(['java.util.Date', 42]), /import/i);
});

test('genera métodos de cliente con parámetros', () => {
  const code = clientMethods(names().operaciones, names());
  assert.match(code, /RespuestaListaProducto listarProducto\(\)/);
  assert.match(code, /RespuestaProducto obtenerProducto\(Long id\)/);
  assert.match(code, /RespuestaProducto crearProducto\(ProductoDto/);
});

test('genera los métodos de cliente con @Override y TODO', () => {
  assert.equal(clientMethods(names().operaciones, names()), METODOS_CLIENTE);
});

test('genera los métodos de servicio con @Override y TODO', () => {
  assert.equal(serviceMethods(names().operaciones, names()), METODOS_CLIENTE);
});

test('puede generar solo las firmas para las interfaces', () => {
  assert.equal(
    clientMethods(names().operaciones, names(), { cuerpo: false }),
    `    RespuestaListaProducto listarProducto();

    RespuestaProducto obtenerProducto(Long id);

    RespuestaProducto crearProducto(ProductoDto productoDto);`,
  );
  assert.equal(
    serviceMethods(names().operaciones, names(), { cuerpo: false }),
    `    RespuestaListaProducto listarProducto();

    RespuestaProducto obtenerProducto(Long id);

    RespuestaProducto crearProducto(ProductoDto productoDto);`,
  );
});

test('genera rutas Spark con :id', () => {
  const code = controllerRoutes(names().operaciones, names());
  assert.match(code, /get\("\/:id"/);
  assert.match(code, /get\("\/lista"/);
});

test('genera rutas relativas a rutaBase que llaman al controller', () => {
  assert.equal(
    controllerRoutes(names().operaciones, names()),
    `    get("/lista", ProductoController.listarProducto, JsonTransformer.getInstance());
    get("/:id", ProductoController.obtenerProducto, JsonTransformer.getInstance());
    post("", ProductoController.crearProducto, JsonTransformer.getInstance());`,
  );
  assert.ok(!controllerRoutes(names().operaciones, names()).includes('{'));
});

test('usa la ruta vacía para la operación que coincide con rutaBase', () => {
  const n = names();
  const crear = n.operaciones.find((operacion) => operacion.id === 'crear');
  const code = controllerRoutes([crear], n);

  assert.match(code, /post\("", ProductoController\.crearProducto/);
  assert.doesNotMatch(code, /post\("\/"/);
});

test('usa el verbo Spark en minúsculas', () => {
  const n = names();
  n.operaciones[1].metodoHttp = 'PATCH';
  assert.match(controllerRoutes([n.operaciones[1]], n), /patch\("\/:id"/);
});

test('falla si una ruta no está bajo rutaBase', () => {
  const n = names();
  const operacion = {
    ...n.operaciones[0],
    apiPath: '/secure/producto/lista',
    sparkPath: '/secure/producto/lista',
  };

  assert.throws(() => controllerRoutes([operacion], n), /rutaBase/);
});
