import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { discoverProject } from '../skills/orqi-slice/scripts/lib/discover.mjs';
import { createCanonicalProject, tempDir } from './helpers/fixture.mjs';

const CLI = fileURLToPath(new URL('../skills/orqi-slice/scripts/descubrir.mjs', import.meta.url));
const temporales = [];

function proyecto() {
  const dir = tempDir();
  temporales.push(dir);
  return dir;
}

afterEach(() => {
  while (temporales.length > 0) {
    rmSync(temporales.pop(), { recursive: true, force: true });
  }
});

test('descubre un proyecto canónico', async () => {
  const dir = proyecto();
  await createCanonicalProject(dir);

  const { ok, errores, mapa } = discoverProject(dir);

  assert.equal(ok, true, errores.join(' '));
  assert.deepEqual(mapa.modulos, [
    'orqi.application',
    'orqi.application.services',
    'orqi.infraestructure.rest',
  ]);
  assert.equal(mapa.paqueteBase, 'bo.gob.sin.sen.app.orqi.orqi');
  assert.equal(mapa.artefacto, 'STR_MON_STT_ORQI_REST');
  assert.equal(mapa.async, true);
  assert.ok(mapa.rutas.some((ruta) => ruta.path === '/rest/disponibilidad'));
  assert.ok(mapa.clientVaultMethods.includes('persona'));
  assert.ok(mapa.serviceFactoryMethods.includes('getDisponibilidadService'));
  assert.equal(mapa.canonico, true);
  assert.deepEqual(mapa.defectos, []);
});

test('rechaza un proyecto sin service', async () => {
  const dir = proyecto();
  await createCanonicalProject(dir, { sinService: true });

  const { ok, errores, mapa } = discoverProject(dir);

  assert.equal(ok, false);
  assert.match(errores.join(' '), /forma no canónica/i);
  assert.match(errores.join(' '), /ServiceImpl/);
  assert.equal(mapa.canonico, false);
});

test('detecta defectos conocidos', async () => {
  const dir = proyecto();
  await createCanonicalProject(dir, { defectos: true });

  const { mapa } = discoverProject(dir);

  assert.ok(mapa.defectos.some((defecto) => defecto.codigo === 'MAIN_CLASS'));
  assert.ok(mapa.defectos.some((defecto) => defecto.codigo === 'SOLICITUD_HEREDA_RESPUESTA'));
  assert.ok(mapa.defectos.some((defecto) => defecto.codigo === 'GITIGNORE_INACTIVO'));
});

test('la CLI escribe el mapa y sale 0 en un proyecto canónico', async () => {
  const dir = proyecto();
  await createCanonicalProject(dir);
  const salida = join(dir, 'mapa.json');

  const resultado = spawnSync(process.execPath, [CLI, '--proyecto', dir, '--out', salida], {
    encoding: 'utf8',
  });

  assert.equal(resultado.status, 0, resultado.stderr);
  const mapa = JSON.parse(readFileSync(salida, 'utf8'));
  assert.equal(mapa.paqueteBase, 'bo.gob.sin.sen.app.orqi.orqi');
  assert.equal(mapa.canonico, true);
});

test('la CLI escribe el mapa en stdout cuando no se usa --out', async () => {
  const dir = proyecto();
  await createCanonicalProject(dir);

  const resultado = spawnSync(process.execPath, [CLI, '--proyecto', dir], { encoding: 'utf8' });

  assert.equal(resultado.status, 0, resultado.stderr);
  const mapa = JSON.parse(resultado.stdout);
  assert.equal(mapa.artefacto, 'STR_MON_STT_ORQI_REST');
});

test('la CLI sale 1 e informa los errores en un proyecto no canónico', async () => {
  const dir = proyecto();
  await createCanonicalProject(dir, { sinService: true });

  const resultado = spawnSync(process.execPath, [CLI, '--proyecto', dir], { encoding: 'utf8' });

  assert.equal(resultado.status, 1);
  assert.match(resultado.stderr, /forma no canónica/i);
});

test('la CLI sale 0 y muestra el uso con --help', () => {
  const resultado = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' });

  assert.equal(resultado.status, 0);
  assert.match(resultado.stdout, /Uso:/);
});

test('la CLI sale 2 cuando faltan argumentos', () => {
  const resultado = spawnSync(process.execPath, [CLI], { encoding: 'utf8' });

  assert.equal(resultado.status, 2);
  assert.match(resultado.stderr, /Uso:/);
});
