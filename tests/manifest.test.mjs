import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { validateManifest, loadManifest } from '../skills/orqi-slice/scripts/lib/manifest.mjs';
import { validManifest, tempDir, write } from './helpers/fixture.mjs';

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

test('loadManifest lee un manifiesto válido desde disco', () => {
  const filePath = join(tempDir(), 'manifiesto.json');
  write(filePath, JSON.stringify(validManifest(), null, 2));
  assert.deepEqual(loadManifest(filePath), { ok: true, manifest: validManifest(), errors: [] });
});
