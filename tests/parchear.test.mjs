import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { validManifest, tempDir, read, write, createCanonicalProject } from './helpers/fixture.mjs';
import { discoverProject } from '../skills/orqi-slice/scripts/lib/discover.mjs';
import { generateSlice } from '../skills/orqi-slice/scripts/lib/generate.mjs';

// fixtureConSlice es LOCAL a este archivo (ruling)
async function fixtureConSlice(opciones = {}) {
  const { sinAwait = false } = opciones;
  const dir = tempDir('parchear-test-');
  await createCanonicalProject(dir);
  const manifest = validManifest();
  const { mapa } = discoverProject(dir);
  
  // Generar la rebanada (Task 5 output)
  const r = generateSlice({ proyecto: dir, manifest, mapa });
  if (!r.ok) {
    throw new Error(`generateSlice failed: ${r.errores.join(', ')}`);
  }
  
  // Si sinAwait, remover awaitInitialization() del MainRest para probar ancla faltante
  if (sinAwait) {
    const mainRestPath = join(dir, 'orqi.infraestructure.rest', 'src', 'main', 'java', ...mapa.paqueteBase.split('.'), 'infraestructure', 'rest', 'MainRest.java');
    let content = read(mainRestPath);
    // Eliminar la línea completa, no solo comentarla
    content = content.replace(/^\s*awaitInitialization\(\);\s*\n?/m, '');
    write(mainRestPath, content);
  }
  
  return { dir, manifest, mapa };
}

describe('parchear factories y rutas', () => {
  let fixture;

  before(async () => {
    fixture = await fixtureConSlice();
  });

  after(() => {
    if (fixture?.dir) {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  test('parchea los tres archivos', async () => {
    const { dir, manifest, mapa } = fixture;
    const { patchShared } = await import('../skills/orqi-slice/scripts/lib/patch.mjs');
    const r = patchShared({ proyecto: dir, manifest, mapa });
    assert.equal(r.ok, true);
    
    // Verificar ClientVaultFactory
    const clientVaultFactoryPath = join(dir, 'orqi.application', 'src', 'main', 'java', ...mapa.paqueteBase.split('.'), 'application', 'ClientVaultFactory.java');
    const factory = await read(clientVaultFactoryPath);
    assert.match(factory, /public static ClientVault producto\(\)/);
    assert.match(factory, /Boolean\.TRUE/);
    assert.match(factory, /EnumArtefactos\.STR_MON_STT_REST/);
    
    // Verificar ApplicationServiceFactory
    const appFactoryPath = join(dir, 'orqi.application.services', 'src', 'main', 'java', ...mapa.paqueteBase.split('.'), 'application', 'service', 'ApplicationServiceFactory.java');
    const appFactory = await read(appFactoryPath);
    assert.match(appFactory, /getProductoService\(\)/);
    assert.match(appFactory, /import.*IProductoService/);
    
    // Verificar MainRest
    const mainRestPath = join(dir, 'orqi.infraestructure.rest', 'src', 'main', 'java', ...mapa.paqueteBase.split('.'), 'infraestructure', 'rest', 'MainRest.java');
    const main = await read(mainRestPath);
    assert.match(main, /path\("\/rest\/producto"/);
    assert.match(main, /import.*ProductoController/);
  });

  test('es idempotente y no duplica', async () => {
    const { dir, manifest, mapa } = await fixtureConSlice();
    const { patchShared } = await import('../skills/orqi-slice/scripts/lib/patch.mjs');
    const r1 = patchShared({ proyecto: dir, manifest, mapa });
    assert.equal(r1.ok, true);
    const r2 = patchShared({ proyecto: dir, manifest, mapa });
    assert.equal(r2.ok, true);
    
    const mainRestPath = join(dir, 'orqi.infraestructure.rest', 'src', 'main', 'java', ...mapa.paqueteBase.split('.'), 'infraestructure', 'rest', 'MainRest.java');
    const main = await read(mainRestPath);
    const matches = main.match(/path\("\/rest\/producto"/g);
    assert.equal(matches?.length ?? 0, 1);
    rmSync(dir, { recursive: true, force: true });
  });

  test('aborta si falta el ancla awaitInitialization', async () => {
    const { dir, manifest, mapa } = await fixtureConSlice({ sinAwait: true });
    const { patchShared } = await import('../skills/orqi-slice/scripts/lib/patch.mjs');
    const r = patchShared({ proyecto: dir, manifest, mapa });
    assert.equal(r.ok, false);
    assert.match(r.errores.join(' '), /awaitInitialization/);
    rmSync(dir, { recursive: true, force: true });
  });

  test('dryRun no escribe archivos', async () => {
    const { dir, manifest, mapa } = await fixtureConSlice();
    const { patchShared } = await import('../skills/orqi-slice/scripts/lib/patch.mjs');
    const r = patchShared({ proyecto: dir, manifest, mapa, dryRun: true });
    assert.equal(r.ok, true);
    assert.ok(r.cambios.length > 0);
    
    // Verificar que no se escribió ningún archivo (el contenido original sigue intacto)
    const clientVaultFactoryPath = join(dir, 'orqi.application', 'src', 'main', 'java', ...mapa.paqueteBase.split('.'), 'application', 'ClientVaultFactory.java');
    const factory = await read(clientVaultFactoryPath);
    assert.ok(!factory.includes('producto'), 'ClientVaultFactory should not be modified in dryRun');
    rmSync(dir, { recursive: true, force: true });
  });
});