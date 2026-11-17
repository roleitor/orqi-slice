import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RenderError, render } from '../skills/orqi-slice/scripts/lib/render.mjs';

test('reemplaza placeholders', () => {
  assert.equal(render('package {{pkg}};', { pkg: 'bo.gob.sin' }), 'package bo.gob.sin;');
});

test('reemplaza todas las apariciones y varias claves', () => {
  assert.equal(render('{{a}}-{{b}}-{{a}}', { a: 'x', b: 'y' }), 'x-y-x');
});

test('no altera un texto sin placeholders', () => {
  assert.equal(render('public class X {}', {}), 'public class X {}');
});

test('admite espacios dentro de las llaves', () => {
  assert.equal(render('{{ pkg }}', { pkg: 'bo' }), 'bo');
});

test('no interpreta patrones de reemplazo en el valor', () => {
  assert.equal(render('{{v}}', { v: '$& $1' }), '$& $1');
});

test('falla con placeholder desconocido', () => {
  assert.throws(() => render('{{falta}}', {}), /falta/);
});

test('el error es RenderError y no acepta propiedades heredadas', () => {
  assert.throws(
    () => render('{{toString}}', {}),
    (error) =>
      error instanceof RenderError &&
      error.name === 'RenderError' &&
      /toString/.test(error.message),
  );
});

test('un valor null se renderiza como texto null', () => {
  assert.equal(render('{{v}}', { v: null }), 'null');
});
