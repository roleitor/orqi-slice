# Skill orqi-slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar `orqi-slice` v0.1: un skill con scripts Node sin dependencias que descubre un ORQI canónico, genera la rebanada Java de un servicio, parchea los tres puntos compartidos y verifica el resultado.

**Architecture:** Carpeta `skills/orqi-slice/` con `SKILL.md`, referencias, 9 plantillas Java y cuatro CLI ESM (`descubrir`, `generar`, `parchear`, `verificar`) sobre una librería compartida en `scripts/lib/`. Los tests usan `node --test` y un fixture canónico temporal; el e2e con Maven es opcional.

**Tech Stack:** Node.js 20+ (ESM, solo stdlib), `node:test`, manifiesto JSON; Java 25/Maven solo para el e2e opcional.

**Spec:** `docs/superpowers/specs/2026-11-05-skill-orqi-slice-design.md`

## Global Constraints

- Node.js >= 20; ESM (`.mjs`); cero dependencias de runtime.
- v0.1 solo acepta proyectos canónicos y `tipo: "orquestado"`.
- La generación produce 9 archivos Java + 1 documento y parchea exactamente 3 archivos.
- Nunca tocar `pom.xml`, Docker, CI, `test.layers` ni `EnumArtefactos`.
- Nunca inventar `EnumArtefactos`, claves de Vault ni rutas: error accionable y sin escritura.
- El método nuevo de `ClientVaultFactory` usa `true` (interno).
- El ejemplo usa `STR_MON_STT_REST` / `STR_MON_STT_ORQI_REST` y Vault `<pendiente>`.
- No hay `install.sh`; la distribución es `npx skills add` desde GitLab.
- Todos los comandos se ejecutan desde la raíz del repo.

## Review Focus

1. Proyecto no canónico: `descubrir` debe negarse y no debe generarse nada.
2. Anclas ausentes o duplicadas al parchear: abortar sin cambios parciales.
3. Re-ejecución: no duplicar archivos, métodos, imports ni rutas.
4. Colisiones de clases, rutas o métodos: detectarlas antes de escribir.
5. Manifiesto incompleto o con `tipo` distinto de `orquestado`: error claro y sin salida a medias.

---

## File Structure

```
package.json                         # privado, ESM, test = node --test
.gitignore
.gitlab-ci.yml                       # node --test
README.md                            # qué es, instalación, uso
CHANGELOG.md
docs/
  uso.md
  distribucion.md
  superpowers/specs/2026-11-05-skill-orqi-slice-design.md
  superpowers/plans/2026-11-05-orqi-slice-implementation.md
skills/orqi-slice/
  SKILL.md
  references/{contrato-insumos,descubrimiento,convenciones,arquetipo,verificacion,ejemplo-productos}.md
  templates/{Dto,SolicitudLista,Respuesta,RespuestaLista,IClient,Client,IService,ServiceImpl,Controller}.java.tpl
  scripts/{descubrir,generar,parchear,verificar}.mjs
  scripts/lib/{manifest,naming,render,java,discover,generate,patch,verify}.mjs
  examples/productos/manifiesto.json
tests/
  helpers/fixture.mjs
  manifest.test.mjs
  naming.test.mjs
  render.test.mjs
  java.test.mjs
  descubrir.test.mjs
  generar.test.mjs
  parchear.test.mjs
  verificar.test.mjs
  docs.test.mjs
  e2e.test.mjs
```

---

### Task 1: Manifiesto y arnés de tests

**Files:**
- Create: `package.json`, `.gitignore`
- Create: `skills/orqi-slice/scripts/lib/manifest.mjs`
- Test: `tests/manifest.test.mjs`

**Interfaces:**
- `validateManifest(value) -> { ok: boolean, errors: string[] }`
- `loadManifest(filePath) -> { ok: boolean, manifest: object | null, errors: string[] }`

- [ ] **Step 1: Write the failing test**

`tests/manifest.test.mjs` incluye un `validManifest()` que devuelve el manifiesto de `productos` de la spec y estos casos:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest, loadManifest } from '../skills/orqi-slice/scripts/lib/manifest.mjs';

test('acepta el manifiesto de productos', () => {
  assert.deepEqual(validateManifest(validManifest()), { ok: true, errors: [] });
});

test('rechaza tipo distinto de orquestado', () => {
  const result = validateManifest({ ...validManifest(), tipo: 'proxy' });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /tipo.*orquestado/i);
});

test('rechaza operaciones duplicadas', () => {
  const m = validManifest();
  m.clientes[0].operaciones.push({ ...m.clientes[0].operaciones[0] });
  assert.equal(validateManifest(m).ok, false);
});

test('rechaza una ruta que no referencia una operación', () => {
  const m = validManifest();
  m.rutas[0].operacion = 'inexistente';
  assert.match(validateManifest(m).errors.join(' '), /operacion/i);
});

test('loadManifest reporta archivo inexistente', () => {
  const result = loadManifest('/ruta/que/no-existe.json');
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /no se pudo leer/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/manifest.test.mjs`
Expected: FAIL con `Cannot find module .../lib/manifest.mjs`.

- [ ] **Step 3: Create `package.json` and `.gitignore`**

`package.json`: `"type": "module"`, `"private": true`, `"engines": { "node": ">=20" }`, `"scripts": { "test": "node --test" }`.

`.gitignore`: `node_modules/`, `coverage/`, `.archify/`, `*.log`, `.DS_Store`.

- [ ] **Step 4: Implement `manifest.mjs`**

Valida: objeto raíz; `modo` ∈ {`nuevo`,`agregar`}; `servicio` y `artefacto` no vacíos; `paqueteBase` con forma de paquete Java; `tipo === "orquestado"`; `entidad.nombre` y `entidad.campos` (`nombre:Tipo`); `clientes` no vacío, cada uno con `nombre`, `artefacto`, `operaciones`; por operación `id`, `metodo` ∈ {GET,POST,PUT,DELETE,PATCH}, `path` que empieza en `/`, `parametros` (`{nombre,tipo,en}` con `en` ∈ {path,query,body}), `request` nulo o string, `response` string; ids de operación únicos por cliente; `rutas` no vacías con `metodo`, `path` y `operacion` existente; `vault.data`/`vault.internos` strings; `proyecto` obligatorio solo si `modo === "agregar"`. Los errores son frases accionables en español.

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/manifest.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore skills/orqi-slice/scripts/lib/manifest.mjs tests/manifest.test.mjs
git commit -m "feat: manifest validation and test harness"
```

---

### Task 2: Nombres y rutas derivadas

**Files:**
- Create: `skills/orqi-slice/scripts/lib/naming.mjs`
- Test: `tests/naming.test.mjs`

**Interfaces:**
- `toPascal(value) -> string`, `toCamel(value) -> string`, `toKebab(value) -> string`
- `packageToPath(pkg) -> string`
- `toSparkPath(path) -> string`
- `deriveNames(manifest) -> { servicio, entidad, clases, factories, rutaBase, operaciones }`

`clases` = `{ dto, solicitudLista, respuesta, respuestaLista, clientInterface, serviceInterface, clientImpl, serviceImpl, controller }`.
`factories` = `{ clientVaultMethod, serviceFactoryMethod }`.
Cada operación derivada = `{ id, metodoJava, metodoHttp, apiPath, sparkPath, parametros, request, response }`.

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toPascal, toCamel, toKebab, packageToPath, toSparkPath, deriveNames } from '../skills/orqi-slice/scripts/lib/naming.mjs';

test('convierte nombres y paquetes', () => {
  assert.equal(toPascal('producto'), 'Producto');
  assert.equal(toCamel('Producto'), 'producto');
  assert.equal(toKebab('Producto'), 'producto');
  assert.equal(packageToPath('bo.gob.sin.sen'), 'bo/gob/sin/sen');
  assert.equal(toSparkPath('/rest/producto/{id}'), '/rest/producto/:id');
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
```

`validManifest()` puede importarse de `tests/helpers/fixture.mjs` (creado en Task 4) o duplicarse aquí; en esta tarea se duplica para no depender de Task 4.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/naming.test.mjs`
Expected: FAIL con módulo no encontrado.

- [ ] **Step 3: Implement `naming.mjs`**

`metodoJava` = `operacion.metodoJava` si existe; si no, `${id}${EntidadPascal}` (por ejemplo `listarProducto`). `rutaBase` = `/rest/${kebab(servicio)}`. `packageSegment` = `toLower(servicio)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/naming.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/orqi-slice/scripts/lib/naming.mjs tests/naming.test.mjs
git commit -m "feat: name and route derivation"
```

---

### Task 3: Renderer y fragmentos Java

**Files:**
- Create: `skills/orqi-slice/scripts/lib/render.mjs`
- Create: `skills/orqi-slice/scripts/lib/java.mjs`
- Test: `tests/render.test.mjs`, `tests/java.test.mjs`

**Interfaces:**
- `render(template, context) -> string`; reemplaza `{{clave}}`; lanza `RenderError` si una clave no está en `context`.
- `javaFields(campos) -> string`
- `javaAccessors(campos, className) -> string`
- `javaImports(imports) -> string`
- `clientMethods(operaciones, names) -> string`
- `serviceMethods(operaciones, names) -> string`
- `controllerRoutes(operaciones, names) -> string`

- [ ] **Step 1: Write the failing tests**

```js
// tests/render.test.mjs
test('reemplaza placeholders', () => {
  assert.equal(render('package {{pkg}};', { pkg: 'bo.gob.sin' }), 'package bo.gob.sin;');
});
test('falla con placeholder desconocido', () => {
  assert.throws(() => render('{{falta}}', {}), /falta/);
});

// tests/java.test.mjs
test('genera campos y accesores', () => {
  const campos = ['precio:BigDecimal', 'nombre:String'];
  assert.match(javaFields(campos), /private BigDecimal precio;/);
  assert.match(javaAccessors(campos, 'ProductoDto'), /public BigDecimal getPrecio\(\)/);
  assert.match(javaAccessors(campos, 'ProductoDto'), /public void setPrecio\(BigDecimal precio\)/);
});
test('genera métodos de cliente con parámetros', () => {
  const code = clientMethods(deriveNames(validManifest()).operaciones, deriveNames(validManifest()));
  assert.match(code, /RespuestaListaProducto listarProducto\(\)/);
  assert.match(code, /RespuestaProducto obtenerProducto\(Long id\)/);
  assert.match(code, /RespuestaProducto crearProducto\(ProductoDto/);
});
test('genera rutas Spark con :id', () => {
  const code = controllerRoutes(deriveNames(validManifest()).operaciones, deriveNames(validManifest()));
  assert.match(code, /get\("\/:id"/);
  assert.match(code, /get\("\/lista"/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/render.test.mjs tests/java.test.mjs`
Expected: FAIL con módulos no encontrados.

- [ ] **Step 3: Implement `render.mjs` and `java.mjs`**

`render` solo soporta `{{clave}}`, sin bucles ni condicionales. `javaFields`/`javaAccessors` cubren `String, Integer, Long, BigDecimal, Boolean, Date`. `clientMethods` firma: `RespuestaX <metodo>([params])` con `@Override`; el body queda como `throw new UnsupportedOperationException("TODO");` salvo que la plantilla lo complete. `controllerRoutes` usa la ruta relativa a `rutaBase` (`/:id`, `/lista`, `""` para la base; Spark rechaza `"/"` dentro de `path(rutaBase)`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/render.test.mjs tests/java.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/orqi-slice/scripts/lib/render.mjs skills/orqi-slice/scripts/lib/java.mjs tests/render.test.mjs tests/java.test.mjs
git commit -m "feat: renderer and Java snippets"
```

---

### Task 4: Descubrimiento canónico

**Files:**
- Create: `tests/helpers/fixture.mjs`
- Create: `skills/orqi-slice/scripts/lib/discover.mjs`
- Create: `skills/orqi-slice/scripts/descubrir.mjs`
- Test: `tests/descubrir.test.mjs`

**Interfaces:**
- `createCanonicalProject(dir, opciones?) -> Promise<void>`: escribe un proyecto mínimo con los tres módulos, `MainRest`, `ClientVaultFactory`, `ApplicationServiceFactory`, un controller, un cliente y un service.
- `discoverProject(root) -> { ok, errores, mapa }`
- `mapa` = `{ root, paqueteBase, modulos, artefacto, rutas, clientVaultMethods, serviceFactoryMethods, async, canonico, defectos }`
- CLI: `descubrir.mjs --proyecto <dir> [--out <file>]`; exit 0 canónico, 1 no canónico, 2 uso.

- [ ] **Step 1: Write the failing test**

```js
test('descubre un proyecto canónico', async () => {
  const dir = await crearDirectorioTemporal();
  await createCanonicalProject(dir);
  const { ok, mapa } = discoverProject(dir);
  assert.equal(ok, true);
  assert.equal(mapa.paqueteBase, 'bo.gob.sin.sen.app.orqi.orqi');
  assert.equal(mapa.artefacto, 'STR_MON_STT_ORQI_REST');
  assert.equal(mapa.async, true);
  assert.ok(mapa.rutas.some((r) => r.path === '/rest/disponibilidad'));
});

test('rechaza un proyecto sin service', async () => {
  const dir = await crearDirectorioTemporal();
  await createCanonicalProject(dir, { sinService: true });
  const { ok, errores } = discoverProject(dir);
  assert.equal(ok, false);
  assert.match(errores.join(' '), /forma no canónica/i);
});

test('detecta defectos conocidos', async () => {
  const dir = await crearDirectorioTemporal();
  await createCanonicalProject(dir, { defectos: true });
  const { mapa } = discoverProject(dir);
  assert.ok(mapa.defectos.some((d) => d.codigo === 'MAIN_CLASS'));
  assert.ok(mapa.defectos.some((d) => d.codigo === 'SOLICITUD_HEREDA_RESPUESTA'));
});
```

El fixture se crea con `fs.mkdtemp` en `os.tmpdir()` y se elimina en `afterEach`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/descubrir.test.mjs`
Expected: FAIL con módulos no encontrados.

- [ ] **Step 3: Implement the fixture helper and `discover.mjs`**

`createCanonicalProject` escribe (con rutas de paquete `bo.gob.sin.sen.app.orqi.orqi`):

- `orqi.application/src/main/java/bo/gob/sin/sen/app/orqi/orqi/application/ClientVaultFactory.java` con `private static ClientVault disponibilidad;` y `public static ClientVault persona()`.
- `orqi.application/.../orquestadores/IDisponibilidadService.java`.
- `orqi.application.services/.../service/ApplicationServiceFactory.java` con `getDisponibilidadService()`.
- `orqi.application.services/.../service/clients/DisponibilidadClient.java`.
- `orqi.application.services/.../service/disponibilidad/DisponibilidadServiceImpl.java`.
- `orqi.infraestructure.rest/.../MainRest.java` con `Application.init(EnumArtefactos.STR_MON_STT_ORQI_REST)` y `path("/rest/disponibilidad", () -> { post("/orquestado", ...); });` y `awaitInitialization();`.
- Opciones: `sinService` omite el service; `defectos` agrega `main.class` inválido, `SolicitudListaDisponibilidad extends RespuestaStatus` y `_.gitignore`.

`discoverProject` valida: los tres directorios de módulo; existencia de los tres archivos clave; al menos un controller/cliente/service; `Application.init`; `path(...)`. Extrae `paqueteBase` de la línea `package` de `MainRest`, `artefacto` de `Application.init`, rutas de `path("...")`, métodos de los factories y `async` si aparece `CompletableFuture`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/descubrir.test.mjs`
Expected: PASS.

- [ ] **Step 5: Implement CLI and smoke test**

`descubrir.mjs` parsea `--proyecto`, `--out`, `--help`; escribe el JSON del mapa; en no canónico imprime los errores y sale 1. Probar:

```bash
node skills/orqi-slice/scripts/descubrir.mjs --proyecto <fixture> --out /tmp/mapa.json
```

- [ ] **Step 6: Commit**

```bash
git add tests/helpers/fixture.mjs skills/orqi-slice/scripts/lib/discover.mjs skills/orqi-slice/scripts/descubrir.mjs tests/descubrir.test.mjs
git commit -m "feat: canonical discovery"
```

---

### Task 5: Plantillas y generador

**Files:**
- Create: `skills/orqi-slice/templates/*.java.tpl` (9)
- Create: `skills/orqi-slice/scripts/lib/generate.mjs`
- Create: `skills/orqi-slice/scripts/generar.mjs`
- Test: `tests/generar.test.mjs`

**Interfaces:**
- `generateSlice({ proyecto, manifest, mapa, dryRun }) -> { ok, archivos, colisiones, errores }`
- CLI: `generar.mjs --proyecto <dir> --manifiesto <file> [--mapa <file>] [--dry-run]`.

Rutas de salida (bajo `<proyecto>/`):

1. `orqi.application/src/main/java/<pkgPath>/application/clients/<seg>/<Dto>.java`
2. `.../clients/<seg>/<SolicitudLista>.java`
3. `.../clients/<seg>/<Respuesta>.java`
4. `.../clients/<seg>/<RespuestaLista>.java`
5. `.../clients/<seg>/<IClient>.java`
6. `.../orquestadores/<IService>.java`
7. `orqi.application.services/src/main/java/<pkgPath>/application/service/<seg>/<ServiceImpl>.java`
8. `.../application/service/clients/<ClientImpl>.java`
9. `orqi.infraestructure.rest/src/main/java/<pkgPath>/infraestructure/rest/controller/<seg>/<Controller>.java`
10. `docs/orqi/<seg>.md`

- [ ] **Step 1: Write the failing test**

```js
test('genera los 9 Java y el doc', async () => {
  const dir = await fixtureGenerado(); // fixture + mapa + manifiesto
  const r = generateSlice({ proyecto: dir, manifest, mapa });
  assert.equal(r.ok, true);
  assert.equal(r.archivos.length, 10);
  const controller = await read(`${dir}/orqi.infraestructure.rest/.../ProductoController.java`);
  assert.match(controller, /static final Route listarProducto/);
  assert.match(controller, /ProductoService/);
});

test('no escribe si hay colisión', async () => {
  const dir = await fixtureGenerado();
  await write(`${dir}/.../ProductoDto.java`, '// distinto');
  const r = generateSlice({ proyecto: dir, manifest, mapa });
  assert.equal(r.ok, false);
  assert.match(r.colisiones.join(' '), /ProductoDto/);
});

test('es idempotente', async () => {
  const dir = await fixtureGenerado();
  assert.equal(generateSlice({ proyecto: dir, manifest, mapa }).ok, true);
  const r2 = generateSlice({ proyecto: dir, manifest, mapa });
  assert.equal(r2.ok, true);
  assert.equal(r2.archivos.length, 0);
});
```

El controller expone campos `Route` estáticos; el bloque `path(rutaBase)` se inserta en `MainRest` en Task 6.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/generar.test.mjs`
Expected: FAIL con módulo no encontrado.

- [ ] **Step 3: Create the 9 templates**

Cada plantilla es Java con placeholders `{{...}}` y sin lógica: `package`, imports, clase, campos, accesores, métodos y rutas se pasan ya compuestos. El generador arma el contexto con `naming` + `java`.

- [ ] **Step 4: Implement `generate.mjs`**

Valida el manifiesto; descubre si no hay mapa; calcula las 10 rutas; verifica colisiones (archivo existente idéntico → omitir, distinto → error y no escribir nada); en `dryRun` solo lista; escribe con `mkdir -p`. El documento `docs/orqi/<seg>.md` lista servicio, rutas, clientes, artefactos, Vault y `TODO`.

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/generar.test.mjs`
Expected: PASS.

- [ ] **Step 6: Implement CLI and smoke test**

Probar `generar.mjs --dry-run` sobre el fixture y verificar que no escribe.

- [ ] **Step 7: Commit**

```bash
git add skills/orqi-slice/templates skills/orqi-slice/scripts/lib/generate.mjs skills/orqi-slice/scripts/generar.mjs tests/generar.test.mjs
git commit -m "feat: slice generator and templates"
```

---

### Task 6: Parches de factories y rutas

**Files:**
- Create: `skills/orqi-slice/scripts/lib/patch.mjs`
- Create: `skills/orqi-slice/scripts/parchear.mjs`
- Test: `tests/parchear.test.mjs`

**Interfaces:**
- `patchShared({ proyecto, manifest, mapa, dryRun }) -> { ok, cambios, errores }`
- CLI: `parchear.mjs --proyecto <dir> --manifiesto <file> [--mapa <file>] [--dry-run]`.

Reglas:
- `ClientVaultFactory`: insertar `private static ClientVault <metodo>;` después del constructor privado y `public static ClientVault <metodo>()` antes del último `}`; import de `EnumArtefactos` si falta; cuerpo con `new ClientVault(EnumArtefactos.<artefacto>, Boolean.TRUE)`.
- `ApplicationServiceFactory`: insertar `public static <IService> <getService>()` antes del último `}`; import de la interfaz.
- `MainRest`: insertar `path("<rutaBase>", () -> { ... });` antes de `awaitInitialization();`; import del controller. Cada ruta pública usa `get("...")`/`post("...")` y llama al método del controller.

- [ ] **Step 1: Write the failing test**

```js
test('parchea los tres archivos', async () => {
  const dir = await fixtureConSlice();
  const r = patchShared({ proyecto: dir, manifest, mapa });
  assert.equal(r.ok, true);
  const factory = await read(`${dir}/.../ClientVaultFactory.java`);
  assert.match(factory, /public static ClientVault producto\(\)/);
  assert.match(factory, /Boolean\.TRUE/);
  const appFactory = await read(`${dir}/.../ApplicationServiceFactory.java`);
  assert.match(appFactory, /getProductoService\(\)/);
  const main = await read(`${dir}/.../MainRest.java`);
  assert.match(main, /path\("\/rest\/producto"/);
});

test('es idempotente y no duplica', async () => {
  const dir = await fixtureConSlice();
  patchShared({ proyecto: dir, manifest, mapa });
  const r2 = patchShared({ proyecto: dir, manifest, mapa });
  assert.equal(r2.ok, true);
  const main = await read(`${dir}/.../MainRest.java`);
  assert.equal(main.match(/path\("\/rest\/producto"/g).length, 1);
});

test('aborta si falta el ancla', async () => {
  const dir = await fixtureConSlice({ sinAwait: true });
  const r = patchShared({ proyecto: dir, manifest, mapa });
  assert.equal(r.ok, false);
  assert.match(r.errores.join(' '), /awaitInitialization/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/parchear.test.mjs`
Expected: FAIL con módulo no encontrado.

- [ ] **Step 3: Implement `patch.mjs`**

Antes de escribir, para cada archivo: leer, contar anclas, verificar idempotencia. Si algo falla, no escribir ninguno de los tres (aplicar en memoria y volcar al final). `dryRun` devuelve los cambios sin escribir.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/parchear.test.mjs`
Expected: PASS.

- [ ] **Step 5: Implement CLI and smoke test**

Probar `parchear.mjs --dry-run` y verificar que el archivo no cambia.

- [ ] **Step 6: Commit**

```bash
git add skills/orqi-slice/scripts/lib/patch.mjs skills/orqi-slice/scripts/parchear.mjs tests/parchear.test.mjs
git commit -m "feat: idempotent factory and route patches"
```

---

### Task 7: Verificador

**Files:**
- Create: `skills/orqi-slice/scripts/lib/verify.mjs`
- Create: `skills/orqi-slice/scripts/verificar.mjs`
- Test: `tests/verificar.test.mjs`

**Interfaces:**
- `verifySlice({ proyecto, manifest, mapa }) -> { ok, errores, advertencias }`
- `gitStatusIssues(porcelain, allowed) -> string[]` (función pura)
- CLI: `verificar.mjs --proyecto <dir> --manifiesto <file> [--mapa <file>]`.

Chequeos:
- existen los 9 Java y `docs/orqi/<seg>.md`;
- `producto()` / `getProductoService()` / `path("<rutaBase>"` aparecen exactamente una vez;
- no hay rutas duplicadas en `MainRest`;
- el controller nuevo no contiene `{` ni `}` en rutas Spark;
- las solicitudes nuevas no contienen `extends RespuestaStatus`;
- `Application.init(EnumArtefactos.<artefacto>)` coincide;
- el método de `ClientVaultFactory` usa `Boolean.TRUE`;
- si el proyecto es git, `git status --porcelain` solo muestra rutas permitidas (`gitStatusIssues`).

- [ ] **Step 1: Write the failing test**

```js
test('pasa sobre la rebanada generada y parcheada', async () => {
  const dir = await fixtureCompleto();
  assert.deepEqual(verifySlice({ proyecto: dir, manifest, mapa }), { ok: true, errores: [], advertencias: [] });
});

test('falla si falta el doc', async () => { /* borrar doc; esperar error */ });
test('falla si hay una ruta duplicada', async () => { /* duplicar path; esperar error */ });
test('falla si el artefacto no coincide', async () => { /* cambiar Application.init; esperar error */ });
test('gitStatusIssues detecta archivos fuera de la lista', () => {
  const issues = gitStatusIssues(' M pom.xml\n?? src/X.java\n', ['src/X.java']);
  assert.deepEqual(issues, ['pom.xml']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/verificar.test.mjs`
Expected: FAIL con módulo no encontrado.

- [ ] **Step 3: Implement `verify.mjs`**

Devuelve errores accionables; `advertencias` para `test.layers` o git ausente. `gitStatusIssues` parsea líneas `XY path` y compara con `allowed`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/verificar.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/orqi-slice/scripts/lib/verify.mjs skills/orqi-slice/scripts/verificar.mjs tests/verificar.test.mjs
git commit -m "feat: slice verifier"
```

---

### Task 8: Ejemplo, skill, documentación y CI

**Files:**
- Create: `skills/orqi-slice/examples/productos/manifiesto.json`
- Create: `skills/orqi-slice/SKILL.md`
- Create: `skills/orqi-slice/references/*.md` (6)
- Create: `README.md` (reemplaza el template de GitLab)
- Create: `docs/uso.md`, `docs/distribucion.md`
- Create: `.gitlab-ci.yml`
- Create: `CHANGELOG.md`
- Test: `tests/docs.test.mjs`, `tests/e2e.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
test('el ejemplo de productos valida', async () => {
  const { ok } = loadManifest('skills/orqi-slice/examples/productos/manifiesto.json');
  assert.equal(ok, true);
});

test('SKILL.md tiene frontmatter y las secciones obligatorias', async () => {
  const text = await readFile('skills/orqi-slice/SKILL.md', 'utf8');
  assert.match(text, /^---\nname: orqi-slice/m);
  for (const h of ['Reglas duras', 'Modo `nuevo`', 'Modo `agregar`', 'Definición de terminado']) {
    assert.match(text, new RegExp(h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('e2e sin Maven genera, parchea y verifica', async () => {
  const dir = await fixtureCompleto({ vacio: true });
  // discover -> generate -> patch -> verify
  assert.equal(verify.ok, true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/docs.test.mjs tests/e2e.test.mjs`
Expected: FAIL (faltan archivos).

- [ ] **Step 3: Write the example and docs**

`examples/productos/manifiesto.json`: copiar el manifiesto de la spec (`modo: agregar`, `servicio: Producto`, `tipo: orquestado`, `artefacto: STR_MON_STT_ORQI_REST`, clientes con `STR_MON_STT_REST`, 3 operaciones, `vault` con `<pendiente>`).

`SKILL.md` (≤ 120 líneas): frontmatter `name: orqi-slice`, `description`; secciones "Cuándo usarlo", "Reglas duras", "Modo `nuevo`", "Modo `agregar`", "Flujo", "Definición de terminado"; enlaces a `references/`.

Referencias: contrato de insumos, descubrimiento, convenciones, arquetipo (incluye `-Dpackage`), verificación, ejemplo productos. Cada una con las tablas/comandos de la spec.

`README.md`: qué es, requisitos (Node 20+, Java 25 para el proyecto destino), instalación con `npx skills add git@git.impuestos.gob.bo:rolando.quispe/sia-skill-onion.git --skill orqi-slice -g -a codex -y`, uso rápido, estructura, tests.

`docs/uso.md`: los dos modos paso a paso. `docs/distribucion.md`: instalación, actualización, pin, proxy npm.

`.gitlab-ci.yml`:
```yaml
stages: [test]
test:
  stage: test
  image: node:20
  script:
    - node --version
    - npm test
```

`CHANGELOG.md`: `0.1.0` con alcance inicial.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (todos los tests).

- [ ] **Step 5: Manual acceptance**

```bash
node skills/orqi-slice/scripts/descubrir.mjs --help
node skills/orqi-slice/scripts/generar.mjs --help
node skills/orqi-slice/scripts/parchear.mjs --help
node skills/orqi-slice/scripts/verificar.mjs --help
```

Cada uno sale 0 y muestra uso. Probar el flujo completo sobre un fixture temporal (sin Maven).

- [ ] **Step 6: Commit**

```bash
git add README.md CHANGELOG.md .gitlab-ci.yml docs skills tests
git commit -m "feat: skill docs, example and CI"
```

---

## Self-Review

- **Spec coverage:** manifiesto (§12), descubrimiento (§11.1), generación (§12), parches (§11.3), verificación (§13), ejemplo (§12), documentación (§15), distribución (§16), tests (§14), decisiones D1–D7.
- **Tipos:** `deriveNames` produce `clases`/`factories`/`operaciones`; `generateSlice` y `patchShared` consumen el mismo `manifest`/`mapa`; `verifySlice` usa las mismas claves.
- **Review Focus:** cada punto tiene test en Tasks 4 (no canónico), 6 (anclas), 5/6 (idempotencia), 5 (colisiones), 1/3 (manifiesto).
- **Pendiente del builder:** el e2e con Maven queda opcional (`E2E_MVN=1`); el `gitStatusIssues` se prueba con una función pura, no con un repo git real.
