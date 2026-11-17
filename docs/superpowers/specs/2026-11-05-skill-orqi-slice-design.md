# Skill `orqi-slice` — Diseño

**Estado:** aprobado (2026-11-05)
**Fecha:** 2026-11-05
**Repo:** `sia-skill-onion` — `git@git.impuestos.gob.bo:rolando.quispe/sia-skill-onion.git`
**Autores:** equipo ORQI + agente

---

## 1. Intención

Hoy un ORQI se arma copiando el ejemplo de `disponibilidad` y ajustando a mano: DTOs, cliente, orquestador, factory, controller y rutas. Eso tarda, produce diferencias entre proyectos y arrastra defectos del ejemplo (`main.class` desalineado, paquete duplicado, `Solicitud... extends RespuestaStatus`, `.gitignore` inactivo).

Este skill le da a un agente el conocimiento y las herramientas para hacerlo en dos situaciones:

- **`nuevo`**: crear un proyecto ORQI desde el arquetipo Onion 4.0.0 y dejarlo con su primera rebanada compilando.
- **`agregar`**: sumar un servicio/entidad a un ORQI que ya existe, sin romper lo que ya tiene.

El agente aporta lo que no es mecánico (mapeos, validaciones, manejo de errores); el skill aporta el esqueleto determinista, las convenciones y la verificación.

## 2. Objetivos

1. Convertir un pedido como «hazme el orquestador de productos» en una rebanada vertical compilando, en minutos.
2. Soportar `nuevo` y `agregar` con el mismo contrato de insumos.
3. No inventar nunca `EnumArtefactos`, claves de Vault ni rutas: si faltan, detenerse y preguntar.
4. Ser idempotente: correr dos veces no duplica métodos, rutas ni archivos.
5. Detectar colisiones antes de escribir.
6. Dejar documentación en el repo del skill y en el proyecto destino.
7. Distribuir versiones con `npx skills` desde GitLab, sin instalador propio.

## 3. No-objetivos

- Generar lógica de negocio completa (mapeos, reglas, validaciones): se dejan stubs con `TODO` y el agente las completa.
- Generar pruebas unitarias del servicio (queda para el equipo; el skill solo verifica compilación).
- Aprovisionar Git, Vault, base de datos o puertos.
- Reemplazar el arquetipo, el CI o el Dockerfile.
- Soportar proyectos con estilos distintos al canónico del arquetipo en v0.1 (ver decisión D1).
- Generar endpoints `proxy` o `externo` en v0.1 (ver decisión D2).
- Publicar el skill como paquete npm o artefacto de Nexus en v0.1: se instala con `npx skills add` desde GitLab.

## 4. Anti-objetivos

- Duplicar en plantillas la estructura que ya genera el arquetipo.
- Reescribir o refactorizar archivos existentes no relacionados.
- Adivinar enums, claves o artefactos.
- Entregar un proyecto que no compile o con rutas/métodos duplicados.
- Publicar el skill solo como binario en Nexus, sin fuente versionada en Git.

## 5. Restricciones

- Java 25, Maven, Onion 4.0.0, Spark Java, Vault, Nexus, GitLab CI, imagen distroless.
- Arquetipo: `bo.gob.sin.sen.arq:arq-orqi-archetype:4.0.0` (verificado en `~/.m2`).
- Las plantillas del arquetipo generan `package ${package}.orqi...`; el default de `package` es `bo.gob.sin.sen.app.orqi`. Por eso el paquete sale duplicado si no se pasa `-Dpackage`.
- `EnumArtefactos` vive en `bo.gob.sin.str:enum-onion:2.0.0-SNAPSHOT`, una dependencia externa: el proyecto no puede agregar constantes. Ya existen `STR_MON_STT_REST`, `STR_MON_STT_ORQI_REST` y `STR_MON_STT_EXT_REST`; no existen `PROD_*`.
- `ClientVault` se construye con `(EnumArtefactos, boolean)`: `true` selecciona la sección interna y `false` la externa. Las claves `vault.data`/`vault.internos` no aparecen en el código Java: son configuración de Vault y documentación.
- El generador corre con Node.js 20+ y sin dependencias externas: scripts `.mjs`, manifiesto JSON y tests con `node --test`.
- El skill se instala con `npx skills add` (CLI de vercel-labs/skills) en `~/.agents/skills/` o `.agents/skills/`; no hay instalador propio.

## 6. Cómo funciona hoy (contexto)

Tres módulos Maven:

- `orqi.application`: contratos, DTOs, `ClientVaultFactory`, interfaces de orquestadores.
- `orqi.application.services`: implementaciones de orquestadores, clientes REST, `ApplicationServiceFactory`.
- `orqi.infraestructure.rest`: `MainRest`, controllers Spark, recursos.

Flujo de una llamada orquestada:

```
Controller → ApplicationServiceFactory → ServiceImpl → Client → ClientVault → API interna
```

Patrones que el ejemplo muestra: proxy directo (`/rest/disponibilidad/por-cliente`), orquestado (`/rest/disponibilidad/orquestado`) y externo by-pass (`/secure/demo/externo`). En v0.1 el skill solo genera el orquestado; los otros dos quedan documentados como patrón manual.

Defectos y hechos verificados del ejemplo/arquetipo:

- `main.class` en el pom raíz apunta a `bo.gob.sin.sen.arq.orqi...`, que no existe.
- El paquete `bo.gob.sin.sen.app.orqi.orqi` no viene de `groupId + artifactId`: las plantillas hacen `package ${package}.orqi` y el `package` por defecto ya es `bo.gob.sin.sen.app.orqi`. Pasar `-Dpackage=bo.gob.sin.sen.app` (o la base sin `.orqi`) lo deja limpio.
- `name.artifact` es `sen-arq-oni-rest`, genérico del arquetipo.
- `SolicitudListaDisponibilidad` hereda de `RespuestaStatus` (una solicitud no es una respuesta).
- `ClientVaultFactory.persona()` devuelve el campo `disponibilidad` (copy-paste).
- `.gitignore` se llama `_.gitignore`, así que no está activo.
- El endpoint «externo» del demo es solo una forma de exposición: sigue llamando al servicio interno con `Boolean.TRUE`; un externo real usaría `Boolean.FALSE` y la sección `externos` de Vault.

## 7. Enfoques considerados

1. **Skill de receta con plantillas, sin generador.** El agente lee las convenciones y escribe los archivos. Ventaja: flexible; desventaja: más lento, más tokens y cada agente puede desviarse.
2. **Skill + generador determinista (elegido).** El agente valida insumos y arma un manifiesto; el generador emite los archivos y parchea los tres puntos compartidos; el agente completa la lógica y verifica. Ventaja: rápido y consistente; desventaja: hay que mantener generador y plantillas, y lo que se salga del molde se hace a mano.
3. **Extender el arquetipo Maven.** Descartado: el arquetipo genera proyectos completos, no rebanadas dentro de uno existente, y evolucionarlo es más lento que un skill.

**Decisión:** enfoque 2, con el arquetipo como base solo para `nuevo`. El arquetipo sigue siendo la fuente de verdad de la estructura; el skill no la duplica.

### Decisiones cerradas tras el builder check

- **D1 — Forma canónica en v0.1.** `agregar` solo opera sobre proyectos con la forma del arquetipo (tres módulos, `ClientVaultFactory`, `ApplicationServiceFactory`, `MainRest`, controller→service→client). Si el descubrimiento no la reconoce, se detiene y el agente sigue las referencias a mano. Las variantes de estilo quedan para v0.2.
- **D2 — Solo `orquestado` en v0.1.** El manifiesto exige `tipo: "orquestado"`. `proxy` y `externo` se documentan como patrones manuales.
- **D3 — Operaciones abiertas.** Cada operación declara `parametros`, `request` y `response`; no hay vocabulario CRUD fijo. El nombre del método se deriva de `id` + entidad (`listarProducto`), o se toma de `metodoJava` si viene.
- **D4 — Arquetipo 4.0.0 tal cual.** `nuevo` pasa `-Dpackage=bo.gob.sin.sen.app.<proyecto>` y verifica. La corrección en origen (4.0.1) se pide como ticket, no bloquea v0.1.
- **D5 — Ejemplo con constantes de demo.** El ejemplo `productos` usa `STR_MON_STT_REST`/`STR_MON_STT_ORQI_REST`, ya existentes. El documento aclara que son de demo; cada proyecto real pide las suyas.
- **D6 — `artefacto` y `vault`.** El artefacto propio se consume en `MainRest` (`Application.init`): `agregar` lo valida y `nuevo` lo fija. `vault.data`/`internos` son solo documentación/verificación; no generan código.
- **D7 — Distribución con `npx skills` y runtime Node.** El skill se instala con `npx skills add` desde GitLab (soporta repos privados) y el generador corre en Node.js, sin Python ni instalador propio. Nexus no se usa para el skill.

## 8. Arquitectura del skill

```
sia-skill-onion/
├── skills/orqi-slice/
│   ├── SKILL.md
│   ├── references/
│   │   ├── contrato-insumos.md
│   │   ├── descubrimiento.md
│   │   ├── convenciones.md
│   │   ├── arquetipo.md
│   │   ├── verificacion.md
│   │   └── ejemplo-productos.md
│   ├── templates/
│   │   ├── Dto.java.tpl
│   │   ├── SolicitudLista.java.tpl
│   │   ├── Respuesta.java.tpl
│   │   ├── RespuestaLista.java.tpl
│   │   ├── IClient.java.tpl
│   │   ├── Client.java.tpl
│   │   ├── IService.java.tpl
│   │   ├── ServiceImpl.java.tpl
│   │   └── Controller.java.tpl
│   ├── scripts/
│   │   ├── descubrir.mjs
│   │   ├── generar.mjs
│   │   ├── parchear.mjs
│   │   └── verificar.mjs
│   └── examples/productos/manifiesto.json
├── docs/
│   ├── uso.md
│   ├── diseño.md
│   └── distribucion.md
├── tests/
├── package.json
├── .gitlab-ci.yml
├── README.md
└── CHANGELOG.md
```

`SKILL.md` se carga siempre y es corto: cuándo usarlo, modos, reglas duras, flujo y definición de terminado. El detalle vive en `references/` y se lee solo cuando hace falta (divulgación progresiva).

### Componentes

- `descubrir.mjs`: escanea el proyecto destino, valida la forma canónica y escribe `mapa-proyecto.json`.
- `generar.mjs`: renderiza los archivos nuevos desde plantillas y el manifiesto; usa el mapa para validar paquete y nombres.
- `parchear.mjs`: inserta métodos, imports y rutas en los tres archivos compartidos, de forma idempotente.
- `verificar.mjs`: corre chequeos estáticos sobre el proyecto y el manifiesto.

## 9. Contrato de insumos

| Insumo | Ejemplo | Si falta |
|---|---|---|
| Modo | `nuevo` / `agregar` | Preguntar |
| Proyecto destino (solo `agregar`) | `/ruta/orqi-productos` | Preguntar |
| Coordenadas del arquetipo (solo `nuevo`) | `bo.gob.sin.sen.arq:arq-orqi-archetype:4.0.0` | Usar el default de `references/arquetipo.md` |
| `package` base (solo `nuevo`) | `bo.gob.sin.sen.app.productos` | Preguntar; el resultado será `<package>.orqi` |
| Entidad y campos | `Producto`: id, nombre, precio, stock, estado | Preguntar; nunca inferir tipos |
| API destino | ruta del proyecto o `openapi.yaml` | Si no está, pedir rutas y JSON de ejemplo |
| Artefacto del servicio | `STR_MON_STT_REST` (demo) | Detenerse; no inventar |
| Artefacto del orquestador | `STR_MON_STT_ORQI_REST` (demo) | Detenerse para un proyecto real |
| Vault | `data/producto`, `internos/producto-api` | Detenerse en un proyecto real; en el ejemplo se marcan como pendientes |
| Rutas públicas | `GET /rest/producto/lista`, `GET /rest/producto/:id`, `POST /rest/producto` | Preguntar |
| Tipo de endpoint | `orquestado` | v0.1 solo acepta `orquestado` |

Regla dura: si un insumo falta, el agente pregunta y espera. No hay valores por defecto para enums, Vault ni rutas. Para el ejemplo reproducible se permiten las constantes de demo y claves de Vault marcadas como pendientes.

## 10. Modo `nuevo`

1. Validar insumos y coordenadas del arquetipo.
2. Generar:

```bash
mvn -B archetype:generate \
  -DarchetypeGroupId=bo.gob.sin.sen.arq \
  -DarchetypeArtifactId=arq-orqi-archetype \
  -DarchetypeVersion=4.0.0 \
  -DgroupId=bo.gob.sin.sen.app.<proyecto>.orqi \
  -DartifactId=<proyecto> \
  -Dversion=1.0.0 \
  -Dpackage=bo.gob.sin.sen.app.<proyecto> \
  -DinteractiveMode=false
```

El código queda en `bo.gob.sin.sen.app.<proyecto>.orqi`. La convención de `groupId` es propuesta; lo que manda es `-Dpackage`.

3. Sanear y verificar:
   - `main.class` = `bo.gob.sin.sen.app.<proyecto>.orqi.infraestructure.rest.MainRest`.
   - `name.artifact` derivado de `<artifactId>` o pedido al equipo.
   - `_.gitignore` → `.gitignore`.
   - `Application.init(EnumArtefactos.<propio>)` en `MainRest`.
   - Confirmar que el paquete base no quedó duplicado.
4. Correr `agregar` para la primera rebanada.
5. Verificar que compile.
6. Recién entonces quitar el demo `disponibilidad`: controller, client, service, DTOs, entrada en el factory y rutas. Si el equipo prefiere, se deja como smoke test.
7. `git init` local y primer commit. La creación del repo remoto, Vault y base de datos sigue siendo del PO.

## 11. Modo `agregar`

### 11.1 Descubrimiento y validación canónica

`descubrir.mjs` lee el proyecto y produce `mapa-proyecto.json` con:

- módulos, `groupId`/`artifactId`, versiones de Java y Onion;
- paquete base real y paquetes existentes;
- clientes, orquestadores, servicios y controllers existentes;
- métodos de `ClientVaultFactory` y `ApplicationServiceFactory`;
- rutas registradas en `MainRest` y el artefacto de `Application.init`;
- estilo async (`CompletableFuture` / `FixedExecutorSingle`);
- defectos detectados (los de la sección 6).

Si el proyecto no tiene los tres módulos, los factories o el patrón controller→service→client, el script termina con un mensaje claro: «forma no canónica; usar el modo manual». No intenta adivinar variantes en v0.1. El mapa se usa para validar paquete y nombres, no para cambiar de plantillas.

### 11.2 Colisiones

Antes de escribir se verifica: paquete, nombres de clases, método del factory, campo y método de `ClientVaultFactory`, ruta base. Cualquier colisión detiene el proceso con un mensaje claro; no se sobrescribe nada.

### 11.3 Parches aditivos

Solo se tocan tres archivos:

- `ClientVaultFactory`: campo estático y método `producto()` + import del enum si faltara. El booleano debe ser `true` (interno) en v0.1.
- `ApplicationServiceFactory`: método `getProductoService()` + import de la interfaz.
- `MainRest`: bloque `path("/rest/producto", ...)` + import del controller. No se toca `Application.init`; se valida que use el artefacto esperado.

El parche es conservador: busca un ancla exacta, verifica que aparezca una sola vez, es idempotente (si el método o la ruta ya existen, no hace nada) y aborta si el ancla no está. Tiene `--dry-run` para mostrar el diff antes de aplicar.

### 11.4 Varios clientes

El manifiesto acepta `clientes: [...]`. El generador crea un cliente por entrada y un `ServiceImpl` que los compone; deja `TODO` en los mapeos y validaciones. Si el pedido no dice cómo se combinan, el agente pregunta.

### 11.5 Documentación en el proyecto

Se genera `docs/orqi/<servicio>.md` con: rutas, clientes, enum, claves de Vault, ejemplo de request/response y pendientes. Es opcional por manifiesto, pero por defecto se crea.

## 12. Plantillas y manifiesto

Manifiesto (`examples/productos/manifiesto.json`):

```json
{
  "modo": "agregar",
  "proyecto": "/ruta/orqi-existente",
  "servicio": "Producto",
  "paqueteBase": "bo.gob.sin.sen.app.orqi.orqi",
  "tipo": "orquestado",
  "artefacto": "STR_MON_STT_ORQI_REST",
  "vault": { "data": "<pendiente>", "internos": "<pendiente>" },
  "clientes": [
    {
      "nombre": "Producto",
      "artefacto": "STR_MON_STT_REST",
      "operaciones": [
        {
          "id": "listar",
          "metodo": "GET",
          "path": "/rest/producto/lista",
          "parametros": [],
          "request": null,
          "response": "RespuestaListaProducto"
        },
        {
          "id": "obtener",
          "metodo": "GET",
          "path": "/rest/producto/{id}",
          "parametros": [{ "nombre": "id", "tipo": "Long", "en": "path" }],
          "request": null,
          "response": "RespuestaProducto"
        },
        {
          "id": "crear",
          "metodo": "POST",
          "path": "/rest/producto",
          "parametros": [],
          "request": "ProductoDto",
          "response": "RespuestaProducto"
        }
      ]
    }
  ],
  "entidad": {
    "nombre": "Producto",
    "campos": ["id:Long", "nombre:String", "precio:BigDecimal", "stock:Integer", "estado:String"]
  },
  "rutas": [
    { "metodo": "GET", "path": "/rest/producto/lista", "operacion": "listar" },
    { "metodo": "GET", "path": "/rest/producto/:id", "operacion": "obtener" },
    { "metodo": "POST", "path": "/rest/producto", "operacion": "crear" }
  ]
}
```

Notas:

- Las rutas del API usan `{id}` (OpenAPI); las rutas públicas de Spark usan `:id`.
- `paqueteBase` es el paquete Java real del proyecto (en la demo, `bo.gob.sin.sen.app.orqi.orqi`).
- Los nombres de método se derivan de `id` + entidad (`listarProducto`, `obtenerProducto`, `crearProducto`). Si el API no es CRUD, se puede declarar `metodoJava`.
- `vault` no se usa en código; se imprime en la documentación y se valida como pendiente.

Archivos nuevos (9 Java + 1 doc):

1. `application/clients/producto/ProductoDto.java`
2. `application/clients/producto/SolicitudListaProducto.java`
3. `application/clients/producto/RespuestaProducto.java`
4. `application/clients/producto/RespuestaListaProducto.java`
5. `application/clients/producto/IProductoClient.java`
6. `application/orquestadores/IProductoService.java`
7. `application.services/service/producto/ProductoServiceImpl.java`
8. `application.services/service/clients/ProductoClient.java`
9. `infraestructure.rest/controller/producto/ProductoController.java`
10. `docs/orqi/producto.md`

Archivos parcheados (3): `ClientVaultFactory`, `ApplicationServiceFactory`, `MainRest`.

## 13. Verificación

En el proyecto destino:

```bash
mvn -q -DskipTests package
node skills/orqi-slice/scripts/verificar.mjs --proyecto . --manifiesto manifiesto.json
```

Chequeos de `verificar.mjs`:

- existen los 9 archivos Java y el doc; los 3 parches están aplicados una sola vez;
- no hay rutas duplicadas en `MainRest`;
- no hay métodos duplicados en los factories;
- no quedan `{id}` en rutas Spark (deben ser `:id`);
- las solicitudes nuevas no heredan de `RespuestaStatus`;
- no se tocaron poms, Docker, CI ni `EnumArtefactos`;
- los `TODO` están solo donde se espera lógica de negocio;
- en `nuevo`: `main.class` existe, el paquete base es `<package>.orqi`, `Application.init` usa el artefacto esperado y no quedan restos del demo;
- en `agregar`: `Application.init` ya usaba el artefacto esperado y el booleano de `ClientVaultFactory` es `true`.

`test.layers` se lee si existe; se reporta, no se impone, porque no se conoce su consumidor.

## 14. Pruebas del skill

- `tests/generar.test.mjs`: manifiesto → conjunto exacto de archivos y contenido (golden).
- `tests/parchear.test.mjs`: idempotencia, ancla ausente → aborta, sin duplicados.
- `tests/descubrir.test.mjs`: fixture canónico → campos esperados del mapa; proyecto no canónico → error claro.
- `tests/e2e/`: corre `mvn package` sobre una copia de la demo con el ejemplo `productos` y las constantes `STR_*`; job manual en CI cuando Nexus esté disponible.

Se ejecutan con `node --test` desde un `package.json` privado (`type: module`, `engines.node >= 20`).

Los fixtures viven en `tests/fixtures/` y no dependen de rutas absolutas. La demo original no se modifica.

## 15. Documentación

Repo del skill:

- `README.md`: qué es, instalación, uso rápido, compatibilidad.
- `docs/uso.md`: los dos modos paso a paso.
- `docs/diseño.md`: este documento.
- `docs/distribucion.md`: instalación con `npx skills`, versionado, rollback y proxy npm.
- `skills/orqi-slice/references/*`: contrato, descubrimiento, convenciones, arquetipo (incluida la corrección de `-Dpackage`), verificación, ejemplo.

Proyecto destino: `docs/orqi/<servicio>.md` por cada rebanada.

## 16. Distribución y versionado

- GitLab `sia-skill-onion` es la fuente de verdad. No se publica el skill en Nexus.
- Instalación con el CLI oficial de skills:
  - Global (DSH lee `~/.agents/skills`): `npx skills add git@git.impuestos.gob.bo:rolando.quispe/sia-skill-onion.git --skill orqi-slice -g -a codex -y`.
  - Por proyecto: sin `-g`; queda en `.agents/skills/`.
  - `codex`/`cline` comparten `.agents/skills`; `claude-code` usa `~/.claude/skills`.
- Repos privados: el CLI usa las credenciales git/SSH ya configuradas; también acepta `git@...` y URLs HTTPS.
- Actualización: `npx skills check` y `npx skills update orqi-slice`.
- Versión: tag `vX.Y.Z` en GitLab; para reproducibilidad, fijar el ref en la URL si el CLI lo soporta o usar el lock del CLI (validar en la prueba).
- El CLI `skills` se baja de npm; si la red corporativa bloquea npmjs, Nexus puede proxear el registry npm.
- Alternativa opcional, fuera de v0.1: publicar un paquete npm en Nexus y usar `npx skills experimental_sync`; es experimental y agrega mantenimiento.
- Matriz de compatibilidad: skill 1.x ↔ arquetipo 4.0.0 (con `-Dpackage`) ↔ Onion 4.0.0 ↔ Java 25 ↔ Node 20+.

## 17. Riesgos

| Riesgo | Mitigación |
|---|---|
| El arquetipo cambia o sus coordenadas no están claras | Coordenadas y comando en `references/arquetipo.md`; fallar ruidosamente |
| Los anclajes de parche son frágiles | Anclas mínimas, `--dry-run`, abortar si hay ambigüedad; tests contra fixture |
| Node.js < 20 en alguna máquina | Modo alternativo documentado: el agente aplica las plantillas a mano |
| Falta el enum o la clave de Vault | Detenerse y pedir; la compilación también lo detecta |
| El agente se desvía del patrón | `SKILL.md` con checklist y `verificar.mjs` como definición de terminado |
| Proyecto no canónico | Descubrimiento lo detecta y deriva al modo manual |
| Orquestaciones con lógica compleja | El generador solo hace stubs; el agente completa y el equipo revisa |
| Sin acceso a npm o GitLab | Instalar desde una copia local del repo; Nexus puede proxear npmjs |
| El CLI `skills` cambia o el pin de versión no es estable | Usar solo comandos estables (`add`, `update`, `check`) y validar el pin en la prueba |

## 18. Decisiones abiertas

1. Proxy npm en Nexus para el CLI `skills` si la red corporativa bloquea npmjs (infraestructura).
2. Validación final de la convención `groupId`/`package` con el equipo del arquetipo (propuesta: `groupId = <package>.orqi`, `package = bo.gob.sin.sen.app.<proyecto>`).
3. Ticket upstream para el arquetipo 4.0.1 (no bloquea v0.1).
4. Formato exacto para fijar la versión del skill (tag/ref en la URL o lock del CLI); validar en la prueba.
5. Proceso para que cada proyecto real obtenga sus constantes `EnumArtefactos` y claves de Vault.

## 19. Definición de terminado

- `SKILL.md` y referencias escritas y probadas con un pedido real.
- `generar.mjs`, `parchear.mjs`, `descubrir.mjs`, `verificar.mjs` con tests.
- Ejemplo `productos` reproducible sobre una copia de la demo, con `STR_*`.
- `npx skills add` probado desde GitLab, global y por proyecto.
- Documentación completa y versión `v0.1.0` publicada.
