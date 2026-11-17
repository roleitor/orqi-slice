import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { validManifest, tempDir, read, write, createCanonicalProject } from './helpers/fixture.mjs';
import { discoverProject } from '../skills/orqi-slice/scripts/lib/discover.mjs';

// fixtureGenerado es LOCAL a este archivo (ledger ruling)
async function fixtureGenerado() {
  const dir = tempDir('generar-test-');
  await createCanonicalProject(dir);
  const manifest = validManifest();
  const { mapa } = discoverProject(dir);
  return { dir, manifest, mapa };
}

import { generateSlice } from '../skills/orqi-slice/scripts/lib/generate.mjs';

describe('generar slice', () => {
  let fixture;

  before(async () => {
    fixture = await fixtureGenerado();
  });

  after(() => {
    if (fixture?.dir) {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  test('genera los 9 Java y el doc', async () => {
    const { dir, manifest, mapa } = fixture;
    const r = generateSlice({ proyecto: dir, manifest, mapa });
    assert.equal(r.ok, true);
    assert.equal(r.archivos.length, 10);
    // Find controller path from returned archivos (avoids hardcoding computeOutputs logic)
    const controllerRel = r.archivos.find(p => p.endsWith('Controller.java'));
    assert.ok(controllerRel, 'Controller.java should be in generated files');
    const controller = await read(join(dir, controllerRel));
    assert.match(controller, /static final Route listarProducto/);
    assert.match(controller, /ProductoService/);
  });

  test('no escribe si hay colisión', async () => {
    const { dir, manifest, mapa } = await fixtureGenerado();
    // Escribir un archivo con contenido distinto para provocar colisión
    // First generate to create the file, then modify it
    const r1 = generateSlice({ proyecto: dir, manifest, mapa });
    assert.equal(r1.ok, true);
    const dtoRel = r1.archivos.find(p => p.endsWith('ProductoDto.java'));
    assert.ok(dtoRel);
    await write(join(dir, dtoRel), '// distinto');
    const r = generateSlice({ proyecto: dir, manifest, mapa });
    assert.equal(r.ok, false);
    assert.match(r.colisiones.join(' '), /ProductoDto/);
    // Limpiar para after()
    rmSync(dir, { recursive: true, force: true });
  });

  test('es idempotente', async () => {
    const { dir, manifest, mapa } = await fixtureGenerado();
    const r1 = generateSlice({ proyecto: dir, manifest, mapa });
    assert.equal(r1.ok, true);
    const r2 = generateSlice({ proyecto: dir, manifest, mapa });
    assert.equal(r2.ok, true);
    assert.equal(r2.archivos.length, 0);
    rmSync(dir, { recursive: true, force: true });
  });

  test('dryRun no escribe', async () => {
    const { dir, manifest, mapa } = await fixtureGenerado();
    const r = generateSlice({ proyecto: dir, manifest, mapa, dryRun: true });
    assert.equal(r.ok, true);
    assert.equal(r.archivos.length, 10);
    // Verificar que no se escribió ningún archivo (check all returned paths)
    for (const rel of r.archivos) {
      assert.equal(existsSync(join(dir, rel)), false, `File ${rel} should not exist in dryRun`);
    }
    rmSync(dir, { recursive: true, force: true });
  });

  test('fallo por ids de operación duplicados globalmente', async () => {
    const { dir, manifest, mapa } = await fixtureGenerado();
    // Agregar un segundo cliente con el mismo id de operación (duplicado global)
    manifest.clientes.push({
      nombre: 'Otro',
      artefacto: 'STR_MON_STT_REST',
      operaciones: [
        {
          id: 'listar', // duplicado global
          metodo: 'GET',
          path: '/rest/otro/lista',
          parametros: [],
          request: null,
          response: 'RespuestaListaOtro',
        },
      ],
    });
    const r = generateSlice({ proyecto: dir, manifest, mapa });
    assert.equal(r.ok, false);
    assert.match(r.errores.join(' '), /duplicad/);
    rmSync(dir, { recursive: true, force: true });
  });
});