/**
 * Renderizador mínimo de plantillas Java.
 *
 * Solo soporta placeholders `{{clave}}`: no hay bucles ni condicionales. Las
 * claves se buscan como propiedades propias del contexto; si falta una, se
 * lanza `RenderError` en lugar de dejar el placeholder en la salida.
 */

export class RenderError extends Error {
  /**
   * @param {string} clave placeholder que no se encontró en el contexto.
   */
  constructor(clave) {
    super(`No se encontró la clave "${clave}" en el contexto de la plantilla.`);
    this.name = 'RenderError';
    this.clave = clave;
  }
}

const PLACEHOLDER = /\{\{\s*([^{}]+?)\s*\}\}/g;

/**
 * Reemplaza cada `{{clave}}` del template por `context[clave]`.
 *
 * @param {string} template texto con placeholders.
 * @param {Record<string, unknown>} context valores ya compuestos.
 * @returns {string} el template renderizado.
 * @throws {RenderError} si una clave no es una propiedad propia del contexto.
 */
export function render(template, context) {
  const valores = context ?? {};

  return String(template).replace(PLACEHOLDER, (_, clave) => {
    if (!Object.prototype.hasOwnProperty.call(valores, clave)) {
      throw new RenderError(clave);
    }
    return String(valores[clave]);
  });
}
