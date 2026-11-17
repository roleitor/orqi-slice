import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const PREFIJO_TEMPORAL = 'orqi-slice-';

/**
 * Manifiesto canónico de `productos` (spec §12). Devuelve un objeto nuevo en
 * cada llamada para que los tests puedan mutarlo sin contaminar a los demás.
 */
export function validManifest() {
  return {
    modo: 'agregar',
    proyecto: '/ruta/orqi-existente',
    servicio: 'Producto',
    paqueteBase: 'bo.gob.sin.sen.app.orqi.orqi',
    tipo: 'orquestado',
    artefacto: 'STR_MON_STT_ORQI_REST',
    vault: { data: '<pendiente>', internos: '<pendiente>' },
    clientes: [
      {
        nombre: 'Producto',
        artefacto: 'STR_MON_STT_REST',
        operaciones: [
          {
            id: 'listar',
            metodo: 'GET',
            path: '/rest/producto/lista',
            parametros: [],
            request: null,
            response: 'RespuestaListaProducto',
          },
          {
            id: 'obtener',
            metodo: 'GET',
            path: '/rest/producto/{id}',
            parametros: [{ nombre: 'id', tipo: 'Long', en: 'path' }],
            request: null,
            response: 'RespuestaProducto',
          },
          {
            id: 'crear',
            metodo: 'POST',
            path: '/rest/producto',
            parametros: [],
            request: 'ProductoDto',
            response: 'RespuestaProducto',
          },
        ],
      },
    ],
    entidad: {
      nombre: 'Producto',
      campos: ['id:Long', 'nombre:String', 'precio:BigDecimal', 'stock:Integer', 'estado:String'],
    },
    rutas: [
      { metodo: 'GET', path: '/rest/producto/lista', operacion: 'listar' },
      { metodo: 'GET', path: '/rest/producto/:id', operacion: 'obtener' },
      { metodo: 'POST', path: '/rest/producto', operacion: 'crear' },
    ],
  };
}

/**
 * Directorio temporal descartable. Es síncrono a propósito: sirve tanto para
 * `tempDir()` como para `await tempDir()` en los tests de tareas posteriores.
 */
export function tempDir(prefix = PREFIJO_TEMPORAL) {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Lee un archivo de texto. Síncrono para poder usarse con o sin `await`. */
export function read(filePath) {
  return readFileSync(filePath, 'utf8');
}

/** Escribe un archivo de texto, creando los directorios padre si faltan. */
export function write(filePath, contents) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents, 'utf8');
}

const PAQUETE_BASE_CANONICO = 'bo.gob.sin.sen.app.orqi.orqi';

function escribirJava(dir, modulo, paquete, archivo, contenido) {
  const ruta = join(dir, modulo, 'src', 'main', 'java', ...paquete.split('.'), archivo);
  write(ruta, contenido);
}

/**
 * Proyecto ORQI mínimo con la forma canónica del arquetipo: tres módulos,
 * `MainRest`, `ClientVaultFactory`, `ApplicationServiceFactory`, un controller,
 * un cliente y un service.
 *
 * `sinService` omite `DisponibilidadServiceImpl` para probar el rechazo de un
 * proyecto no canónico. `defectos` agrega los defectos conocidos del demo:
 * `main.class` desalineado, una solicitud que hereda de `RespuestaStatus` y
 * `_.gitignore` inactivo.
 */
export async function createCanonicalProject(dir, opciones = {}) {
  const { sinService = false, defectos = false } = opciones;
  const base = PAQUETE_BASE_CANONICO;
  const paqueteApplication = `${base}.application`;
  const paqueteServices = `${base}.application.service`;
  const paqueteRest = `${base}.infraestructure.rest`;

  escribirJava(
    dir,
    'orqi.application',
    paqueteApplication,
    'ClientVaultFactory.java',
    `package ${paqueteApplication};

import bo.gob.sin.sen.onion.application.rest.ClientVault;
import bo.gob.sin.str.enumeradores.EnumArtefactos;

public class ClientVaultFactory {

    private ClientVaultFactory() {
    }

    private static ClientVault disponibilidad;

    public static ClientVault persona() {
        if (disponibilidad == null) {
            disponibilidad = new ClientVault(EnumArtefactos.STR_MON_STT_REST, Boolean.TRUE);
        }
        return disponibilidad;
    }
}
`,
  );

  escribirJava(
    dir,
    'orqi.application',
    `${paqueteApplication}.orquestadores`,
    'IDisponibilidadService.java',
    `package ${paqueteApplication}.orquestadores;

import bo.gob.sin.sen.app.orqi.orqi.application.clients.disponibilidad.DisponibilidadDto;
import bo.gob.sin.sen.app.orqi.orqi.application.clients.disponibilidad.RespuestaDisponibilidad;

import java.util.concurrent.CompletableFuture;

public interface IDisponibilidadService {

    CompletableFuture<RespuestaDisponibilidad> registrarDisponibilidadAsync(DisponibilidadDto pDisponibilidad);
}
`,
  );

  escribirJava(
    dir,
    'orqi.application.services',
    paqueteServices,
    'ApplicationServiceFactory.java',
    `package ${paqueteServices};

import ${paqueteApplication}.orquestadores.IDisponibilidadService;
import ${paqueteServices}.disponibilidad.DisponibilidadServiceImpl;

public class ApplicationServiceFactory {

    private ApplicationServiceFactory() {
    }

    public static IDisponibilidadService getDisponibilidadService() {
        return new DisponibilidadServiceImpl();
    }
}
`,
  );

  escribirJava(
    dir,
    'orqi.application.services',
    `${paqueteServices}.clients`,
    'DisponibilidadClient.java',
    `package ${paqueteServices}.clients;

import bo.gob.sin.sen.app.orqi.orqi.application.clients.disponibilidad.DisponibilidadDto;
import bo.gob.sin.sen.app.orqi.orqi.application.clients.disponibilidad.RespuestaDisponibilidad;

import java.util.concurrent.CompletableFuture;

public class DisponibilidadClient {

    private DisponibilidadClient() {
    }

    public static DisponibilidadClient create() {
        return new DisponibilidadClient();
    }

    public CompletableFuture<RespuestaDisponibilidad> registrarDisponibilidadAsync(DisponibilidadDto pDisponibilidad) {
        return CompletableFuture.completedFuture(new RespuestaDisponibilidad());
    }
}
`,
  );

  if (!sinService) {
    escribirJava(
      dir,
      'orqi.application.services',
      `${paqueteServices}.disponibilidad`,
      'DisponibilidadServiceImpl.java',
      `package ${paqueteServices}.disponibilidad;

import bo.gob.sin.sen.app.orqi.orqi.application.clients.disponibilidad.DisponibilidadDto;
import bo.gob.sin.sen.app.orqi.orqi.application.clients.disponibilidad.RespuestaDisponibilidad;
import bo.gob.sin.sen.app.orqi.orqi.application.orquestadores.IDisponibilidadService;

import java.util.concurrent.CompletableFuture;

public class DisponibilidadServiceImpl implements IDisponibilidadService {

    @Override
    public CompletableFuture<RespuestaDisponibilidad> registrarDisponibilidadAsync(DisponibilidadDto pDisponibilidad) {
        return CompletableFuture.completedFuture(new RespuestaDisponibilidad());
    }
}
`,
    );
  }

  escribirJava(
    dir,
    'orqi.infraestructure.rest',
    `${paqueteRest}.controller.disponibilidad`,
    'DisponibilidadController.java',
    `package ${paqueteRest}.controller.disponibilidad;

import spark.Route;

public final class DisponibilidadController {

    public static final Route registrarDisponibilidadOrquestado = (request, response) -> null;
}
`,
  );

  escribirJava(
    dir,
    'orqi.infraestructure.rest',
    paqueteRest,
    'MainRest.java',
    `package ${paqueteRest};

import ${paqueteRest}.controller.disponibilidad.DisponibilidadController;
import bo.gob.sin.sen.onion.infraestructure.rest.Application;
import bo.gob.sin.sen.onion.infraestructure.rest.JsonTransformer;
import bo.gob.sin.str.enumeradores.EnumArtefactos;

import static spark.Spark.*;

public class MainRest {

    public static void main(String... args) {
        Application.init(EnumArtefactos.STR_MON_STT_ORQI_REST);

        path("/rest/disponibilidad", () -> {
            post("/orquestado", DisponibilidadController.registrarDisponibilidadOrquestado, JsonTransformer.getInstance());
        });

        awaitInitialization();
    }
}
`,
  );

  if (defectos) {
    write(
      join(dir, 'pom.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>bo.gob.sin.sen.app.orqi</groupId>
  <artifactId>orqi</artifactId>
  <version>1.0.0</version>
  <packaging>pom</packaging>
  <properties>
    <main.class>bo.gob.sin.sen.arq.orqi.infraestructure.rest.MainRest</main.class>
  </properties>
</project>
`,
    );

    escribirJava(
      dir,
      'orqi.application',
      `${paqueteApplication}.clients.disponibilidad`,
      'SolicitudListaDisponibilidad.java',
      `package ${paqueteApplication}.clients.disponibilidad;

import bo.gob.sin.sen.onion.application.impl.RespuestaStatus;

public class SolicitudListaDisponibilidad extends RespuestaStatus {

    private String aplicacion;

    public String getAplicacion() {
        return aplicacion;
    }

    public void setAplicacion(String aplicacion) {
        this.aplicacion = aplicacion;
    }
}
`,
    );

    write(join(dir, '_.gitignore'), 'target/\n.idea/\n');
  }
}
