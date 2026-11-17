import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { validManifest, tempDir, read, write, createCanonicalProject } from './helpers/fixture.mjs';
import { discoverProject } from '../skills/orqi-slice/scripts/lib/discover.mjs';
import { generateSlice } from '../skills/orqi-slice/scripts/lib/generate.mjs';
import { patchShared } from '../skills/orqi-slice/scripts/lib/patch.mjs';
import { verifySlice, gitStatusIssues } from '../skills/orqi-slice/scripts/lib/verify.mjs';

const CLI = fileURLToPath(new URL('../skills/orqi-slice/scripts/verificar.mjs', import.meta.url));

// fixtureCompleto es LOCAL a este archivo (ruling)
async function fixtureCompleto() {
  const dir = tempDir('verificar-test-');
  await createCanonicalProject(dir);
  const manifest = validManifest();
  const { mapa } = discoverProject(dir);
  
  // Inicializar git repo para evitar advertencia
  const { execSync } = await import('node:child_process');
  execSync('git init', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'ignore' });
  execSync('git add -A', { cwd: dir, stdio: 'ignore' });
  execSync('git commit -m "initial"', { cwd: dir, stdio: 'ignore' });
  
  // Generar la rebanada (Task 5 output)
  const r = generateSlice({ proyecto: dir, manifest, mapa });
  if (!r.ok) {
    throw new Error(`generateSlice failed: ${r.errores.join(', ')}`);
  }
  
  // Parchear los archivos compartidos (Task 6 output)
  const p = patchShared({ proyecto: dir, manifest, mapa });
  if (!p.ok) {
    throw new Error(`patchShared failed: ${p.errores.join(', ')}`);
  }
  
  // Escribir manifiesto para CLI tests
  const manifestoPath = join(dir, 'manifiesto.json');
  write(manifestoPath, JSON.stringify(manifest, null, 2));
  
  return { dir, manifest, mapa };
}

describe('verificar slice', () => {
  let fixture;

  before(async () => {
    fixture = await fixtureCompleto();
  });

  after(() => {
    if (fixture?.dir) {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  test('pasa sobre la rebanada generada y parcheada', async () => {
    const { dir, manifest, mapa } = fixture;
    const result = verifySlice({ proyecto: dir, manifest, mapa });
    assert.deepEqual(result, { ok: true, errores: [], advertencias: [] });
  });

  test('falla si falta el doc', async () => {
    const { dir, manifest, mapa } = await fixtureCompleto();
    
    // Borrar el doc
    const docPath = join(dir, 'docs', 'orqi', 'producto.md');
    rmSync(docPath, { force: true });
    
    const result = verifySlice({ proyecto: dir, manifest, mapa });
    assert.equal(result.ok, false);
    assert.ok(result.errores.some(e => e.includes('doc') || e.includes('docs/orqi/producto.md')));
    
    rmSync(dir, { recursive: true, force: true });
  });

  test('falla si hay una ruta duplicada', async () => {
    const { dir, manifest, mapa } = await fixtureCompleto();
    
    // Duplicar una ruta en MainRest
    const mainRestPath = join(dir, 'orqi.infraestructure.rest', 'src', 'main', 'java', ...mapa.paqueteBase.split('.'), 'infraestructure', 'rest', 'MainRest.java');
    let content = await read(mainRestPath);
    // Agregar una ruta duplicada
    content = content.replace('awaitInitialization();', `path("/rest/producto", () -> {
            get("/duplicada", ProductoController.listarProducto, JsonTransformer.getInstance());
        });
        awaitInitialization();`);
    await write(mainRestPath, content);
    
    const result = verifySlice({ proyecto: dir, manifest, mapa });
    assert.equal(result.ok, false);
    assert.ok(result.errores.some(e => e.includes('duplicad') || e.includes('duplicated')));
    
    rmSync(dir, { recursive: true, force: true });
  });

  test('falla si el artefacto no coincide', async () => {
    const { dir, manifest, mapa } = await fixtureCompleto();
    
    // Cambiar Application.init en MainRest
    const mainRestPath = join(dir, 'orqi.infraestructure.rest', 'src', 'main', 'java', ...mapa.paqueteBase.split('.'), 'infraestructure', 'rest', 'MainRest.java');
    let content = await read(mainRestPath);
    content = content.replace('Application.init(EnumArtefactos.STR_MON_STT_ORQI_REST)', 'Application.init(EnumArtefactos.STR_MON_STT_REST)');
    await write(mainRestPath, content);
    
    const result = verifySlice({ proyecto: dir, manifest, mapa });
    assert.equal(result.ok, false);
    assert.ok(result.errores.some(e => e.includes('artefacto') || e.includes('Application.init')));
    
    rmSync(dir, { recursive: true, force: true });
  });

  test('falla si hay {id} en rutas Spark', async () => {
    const { dir, manifest, mapa } = await fixtureCompleto();
    
    // Cambiar una ruta Spark para usar {id} en lugar de :id
    const mainRestPath = join(dir, 'orqi.infraestructure.rest', 'src', 'main', 'java', ...mapa.paqueteBase.split('.'), 'infraestructure', 'rest', 'MainRest.java');
    let content = await read(mainRestPath);
    content = content.replace(':id', '{id}');
    await write(mainRestPath, content);
    
    const result = verifySlice({ proyecto: dir, manifest, mapa });
    assert.equal(result.ok, false);
    assert.ok(result.errores.some(e => e.includes('{id}') || e.includes(':id') || e.includes('Spark')));
    
    rmSync(dir, { recursive: true, force: true });
  });

  test('falla si una solicitud extiende RespuestaStatus', async () => {
    const { dir, manifest, mapa } = await fixtureCompleto();
    
    // Cambiar SolicitudListaProducto para que extienda RespuestaStatus
    const solicitudPath = join(dir, 'orqi.application', 'src', 'main', 'java', ...mapa.paqueteBase.split('.'), 'application', 'clients', 'producto', 'SolicitudListaProducto.java');
    let content = await read(solicitudPath);
    content = content.replace('public class SolicitudListaProducto {', 'public class SolicitudListaProducto extends RespuestaStatus {');
    await write(solicitudPath, content);
    
    const result = verifySlice({ proyecto: dir, manifest, mapa });
    assert.equal(result.ok, false);
    assert.ok(result.errores.some(e => e.includes('RespuestaStatus') || e.includes('solicitud')));
    
    rmSync(dir, { recursive: true, force: true });
  });

  test('falla si ClientVaultFactory no usa Boolean.TRUE', async () => {
    const { dir, manifest, mapa } = await fixtureCompleto();
    
    // Cambiar Boolean.TRUE por Boolean.FALSE en ClientVaultFactory (todas las ocurrencias)
    const factoryPath = join(dir, 'orqi.application', 'src', 'main', 'java', ...mapa.paqueteBase.split('.'), 'application', 'ClientVaultFactory.java');
    let content = await read(factoryPath);
    content = content.replace(/Boolean\.TRUE/g, 'Boolean.FALSE');
    await write(factoryPath, content);
    
    const result = verifySlice({ proyecto: dir, manifest, mapa });
    assert.equal(result.ok, false);
    assert.ok(result.errores.some(e => e.includes('Boolean.TRUE') || e.includes('ClientVaultFactory')));
    
    rmSync(dir, { recursive: true, force: true });
  });

  test('falla si producto()/getProductoService()/path aparecen más de una vez', async () => {
    const { dir, manifest, mapa } = await fixtureCompleto();
    
    // Duplicar el método producto() en ClientVaultFactory
    const factoryPath = join(dir, 'orqi.application', 'src', 'main', 'java', ...mapa.paqueteBase.split('.'), 'application', 'ClientVaultFactory.java');
    let content = await read(factoryPath);
    const metodoProducto = content.match(/public static ClientVault producto\(\) \{[\s\S]*?\n    \}/);
    if (metodoProducto) {
      content = content.replace('}', metodoProducto[0] + '\n\n    public static ClientVault producto() {\n        return null;\n    }\n}');
      await write(factoryPath, content);
    }
    
    const result = verifySlice({ proyecto: dir, manifest, mapa });
    assert.equal(result.ok, false);
    assert.ok(result.errores.some(e => e.includes('producto') || e.includes('duplicad')));
    
    rmSync(dir, { recursive: true, force: true });
  });

  test('gitStatusIssues detecta archivos fuera de la lista', () => {
    const issues = gitStatusIssues(' M pom.xml\n?? src/X.java\n', ['src/X.java']);
    assert.deepEqual(issues, ['pom.xml']);
  });

  test('gitStatusIssues ignora archivos permitidos', () => {
    const issues = gitStatusIssues(' M src/A.java\n?? src/B.java\n', ['src/A.java', 'src/B.java']);
    assert.deepEqual(issues, []);
  });

  test('gitStatusIssues maneja líneas vacías', () => {
    const issues = gitStatusIssues('\n M pom.xml\n\n', ['src/X.java']);
    assert.deepEqual(issues, ['pom.xml']);
  });
});

describe('CLI verificar', () => {
  let fixture;

  before(async () => {
    fixture = await fixtureCompleto();
  });

  after(() => {
    if (fixture?.dir) {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  test('exit 0 ok', async () => {
    const { dir, manifest, mapa } = fixture;
    const resultado = spawnSync(process.execPath, [CLI, '--proyecto', dir, '--manifiesto', join(dir, 'manifiesto.json')], { encoding: 'utf8' });
    assert.equal(resultado.status, 0, resultado.stderr);
  });

  test('exit 1 checks failed', async () => {
    const { dir, manifest, mapa } = await fixtureCompleto();
    // Borrar el doc para que falle
    const docPath = join(dir, 'docs', 'orqi', 'producto.md');
    rmSync(docPath, { force: true });
    
    const resultado = spawnSync(process.execPath, [CLI, '--proyecto', dir, '--manifiesto', join(dir, 'manifiesto.json')], { encoding: 'utf8' });
    assert.equal(resultado.status, 1);
    
    rmSync(dir, { recursive: true, force: true });
  });

  test('exit 2 usage', async () => {
    const resultado = spawnSync(process.execPath, [CLI], { encoding: 'utf8' });
    assert.equal(resultado.status, 2);
  });
});
