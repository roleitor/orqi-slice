/**
 * Descubrimiento de la forma canónica de un proyecto ORQI.
 *
 * Solo reconoce el estilo del arquetipo (tres módulos, `MainRest`,
 * `ClientVaultFactory`, `ApplicationServiceFactory` y el patrón
 * controller → service → client). No intenta adivinar variantes: si algo no
 * encaja, devuelve errores accionables y `canonico: false`.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

const MODULOS = ['orqi.application', 'orqi.application.services', 'orqi.infraestructure.rest'];
const SUFIJO_REST = 'infraestructure.rest';
const MENSAJE_NO_CANONICO =
  'El proyecto tiene una forma no canónica; usar el modo manual y seguir las referencias a mano.';

const ARCHIVOS_CLAVE = [
  { nombre: 'ClientVaultFactory.java', modulo: 'orqi.application' },
  { nombre: 'ApplicationServiceFactory.java', modulo: 'orqi.application.services' },
  { nombre: 'MainRest.java', modulo: 'orqi.infraestructure.rest' },
];

function esDirectorio(ruta) {
  try {
    return statSync(ruta).isDirectory();
  } catch {
    return false;
  }
}

function leerTexto(ruta) {
  try {
    return readFileSync(ruta, 'utf8');
  } catch {
    return '';
  }
}

/** Todos los `.java` bajo un directorio, en orden estable y sin `target`. */
function listarJava(directorio) {
  const archivos = [];
  let entradas;

  try {
    entradas = readdirSync(directorio, { withFileTypes: true });
  } catch {
    return archivos;
  }

  for (const entrada of entradas) {
    const ruta = join(directorio, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === 'target' || entrada.name === 'node_modules' || entrada.name === '.git') continue;
      archivos.push(...listarJava(ruta));
    } else if (entrada.isFile() && entrada.name.endsWith('.java')) {
      archivos.push(ruta);
    }
  }

  return archivos.sort();
}

function leerPaquete(contenido) {
  const coincidencia = contenido.match(/^\s*package\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*;/m);
  return coincidencia ? coincidencia[1] : null;
}

/** Nombres de los métodos `public static` declarados en un factory. */
function extraerMetodosFactory(contenido) {
  const metodos = [];
  const patron =
    /public\s+static\s+(?:final\s+)?[A-Za-z_$][\w$.]*(?:\s*<[^;{}()]*?>)?(?:\[\])*\s+([A-Za-z_$][\w$]*)\s*\(/g;

  for (const coincidencia of contenido.matchAll(patron)) {
    if (!metodos.includes(coincidencia[1])) metodos.push(coincidencia[1]);
  }

  return metodos;
}

function detectarDefectos(root, archivos, mapa) {
  const defectos = [];

  const pom = join(root, 'pom.xml');
  if (existsSync(pom) && mapa.paqueteBase) {
    const contenido = leerTexto(pom);
    const coincidencia = contenido.match(/<main\.class>\s*([^<]+?)\s*<\/main\.class>/);
    const esperado = `${mapa.paqueteBase}.${SUFIJO_REST}.MainRest`;

    if (coincidencia && coincidencia[1] !== esperado) {
      defectos.push({
        codigo: 'MAIN_CLASS',
        mensaje: `El "main.class" del pom raíz apunta a "${coincidencia[1]}", pero MainRest está en "${esperado}"; corrige el pom raíz.`,
        archivo: 'pom.xml',
      });
    }
  }

  for (const archivo of archivos) {
    if (!basename(archivo).startsWith('Solicitud')) continue;

    const coincidencia = leerTexto(archivo).match(
      /\bclass\s+([A-Za-z_$][\w$]*)\s+extends\s+RespuestaStatus\b/,
    );

    if (coincidencia) {
      defectos.push({
        codigo: 'SOLICITUD_HEREDA_RESPUESTA',
        mensaje: `La clase "${coincidencia[1]}" hereda de RespuestaStatus; una solicitud no es una respuesta. Quita la herencia.`,
        archivo: relative(root, archivo),
      });
    }
  }

  if (existsSync(join(root, '_.gitignore')) && !existsSync(join(root, '.gitignore'))) {
    defectos.push({
      codigo: 'GITIGNORE_INACTIVO',
      mensaje:
        'El archivo de exclusión se llama "_.gitignore", así que git no lo aplica; renómbralo a ".gitignore".',
      archivo: '_.gitignore',
    });
  }

  return defectos;
}

function cerrar(errores, mapa) {
  const ok = errores.length === 0;
  mapa.canonico = ok;
  if (!ok) errores.push(MENSAJE_NO_CANONICO);
  return { ok, errores, mapa };
}

/**
 * Escanea `root` y devuelve `{ ok, errores, mapa }`.
 *
 * `mapa` conserva lo observado aunque el proyecto no sea canónico, para que el
 * llamador pueda explicar qué falta. Los `defectos` son hallazgos conocidos del
 * demo y no impiden que la forma sea canónica.
 */
export function discoverProject(root) {
  const mapa = {
    root: null,
    paqueteBase: null,
    modulos: [],
    artefacto: null,
    rutas: [],
    clientVaultMethods: [],
    serviceFactoryMethods: [],
    async: false,
    canonico: false,
    defectos: [],
  };

  const errores = [];

  if (typeof root !== 'string' || root.trim() === '') {
    errores.push('No se indicó el directorio del proyecto; pasa --proyecto <directorio>.');
    return cerrar(errores, mapa);
  }

  mapa.root = resolve(root);

  if (!esDirectorio(mapa.root)) {
    errores.push(
      `El proyecto "${mapa.root}" no existe o no es un directorio; verifica la ruta indicada en --proyecto.`,
    );
    return cerrar(errores, mapa);
  }

  const javaPorModulo = new Map();

  for (const modulo of MODULOS) {
    const directorio = join(mapa.root, modulo);
    if (!esDirectorio(directorio)) {
      errores.push(
        `No se encontró el módulo "${modulo}" en "${mapa.root}"; la forma canónica exige los módulos ${MODULOS.join(', ')}.`,
      );
      javaPorModulo.set(modulo, []);
      continue;
    }

    mapa.modulos.push(modulo);
    const fuente = join(directorio, 'src', 'main', 'java');
    javaPorModulo.set(modulo, listarJava(esDirectorio(fuente) ? fuente : directorio));
  }

  const archivos = [...javaPorModulo.values()].flat();

  for (const clave of ARCHIVOS_CLAVE) {
    const archivo = (javaPorModulo.get(clave.modulo) ?? []).find(
      (ruta) => basename(ruta) === clave.nombre,
    );

    if (!archivo) {
      errores.push(
        `No se encontró "${clave.nombre}" dentro del módulo "${clave.modulo}"; la forma canónica lo exige en src/main/java.`,
      );
    }
  }

  const buscarClave = (nombre) => archivos.find((ruta) => basename(ruta) === nombre) ?? null;

  const mainRest = buscarClave('MainRest.java');
  const clientVaultFactory = buscarClave('ClientVaultFactory.java');
  const applicationServiceFactory = buscarClave('ApplicationServiceFactory.java');

  if (mainRest) {
    const contenido = leerTexto(mainRest);
    const paquete = leerPaquete(contenido);

    if (!paquete) {
      errores.push(
        'No se pudo leer la línea "package" de "MainRest.java"; la forma canónica exige un paquete Java declarado.',
      );
    } else if (!paquete.endsWith(`.${SUFIJO_REST}`)) {
      errores.push(
        `El paquete de MainRest ("${paquete}") no termina en ".${SUFIJO_REST}"; no se puede derivar el paquete base del proyecto.`,
      );
    } else {
      const paqueteBase = paquete.slice(0, -(SUFIJO_REST.length + 1));
      if (paqueteBase === '') {
        errores.push(
          `El paquete de MainRest ("${paquete}") no declara un paquete base antes de ".${SUFIJO_REST}".`,
        );
      } else {
        mapa.paqueteBase = paqueteBase;
      }
    }

    const init = contenido.match(
      /Application\s*\.\s*init\s*\(\s*EnumArtefactos\s*\.\s*([A-Za-z_$][\w$]*)\s*\)/,
    );

    if (!init) {
      errores.push(
        'MainRest.java no contiene "Application.init(EnumArtefactos.<ARTEFACTO>)"; la forma canónica exige ese anclaje.',
      );
    } else {
      mapa.artefacto = init[1];
    }

    for (const coincidencia of contenido.matchAll(/\bpath\s*\(\s*"([^"]+)"/g)) {
      mapa.rutas.push({ path: coincidencia[1] });
    }

    if (mapa.rutas.length === 0) {
      errores.push(
        'MainRest.java no registra rutas con path("/..."); la forma canónica exige al menos un bloque path(...).',
      );
    }
  }

  if (clientVaultFactory) {
    mapa.clientVaultMethods = extraerMetodosFactory(leerTexto(clientVaultFactory));
  }

  if (applicationServiceFactory) {
    mapa.serviceFactoryMethods = extraerMetodosFactory(leerTexto(applicationServiceFactory));
  }

  const hayControllers = archivos.some((ruta) => basename(ruta).endsWith('Controller.java'));
  const hayClientes = archivos.some((ruta) => basename(ruta).endsWith('Client.java'));
  const hayServices = archivos.some((ruta) => basename(ruta).endsWith('ServiceImpl.java'));

  if (!hayControllers) {
    errores.push(
      'No se encontró ningún controller "*Controller.java" en el módulo "orqi.infraestructure.rest"; la forma canónica exige el patrón controller → service → client.',
    );
  }

  if (!hayClientes) {
    errores.push(
      'No se encontró ningún cliente "*Client.java" en el módulo "orqi.application.services"; la forma canónica exige el patrón controller → service → client.',
    );
  }

  if (!hayServices) {
    errores.push(
      'No se encontró ningún service "*ServiceImpl.java" en el módulo "orqi.application.services"; la forma canónica exige el patrón controller → service → client.',
    );
  }

  mapa.async = archivos.some((ruta) => leerTexto(ruta).includes('CompletableFuture'));
  mapa.defectos = detectarDefectos(mapa.root, archivos, mapa);

  return cerrar(errores, mapa);
}
