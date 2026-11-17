# {{servicio}}

## Servicio
- **Nombre:** {{servicio}}
- **Entidad:** {{entidad}}
- **Ruta base:** `{{rutaBase}}`
- **Paquete base:** `{{paqueteBase}}`
- **Artefacto:** `{{artefacto}}`
- **Vault data:** `{{vaultData}}`
- **Vault internos:** `{{vaultInternos}}`

## Rutas públicas

{{rutasList}}

## Clientes

{{clientesList}}

## Artefactos generados

### orqi.application
- `application/clients/{{seg}}/{{dto}}.java`
- `application/clients/{{seg}}/{{solicitudLista}}.java`
- `application/clients/{{seg}}/{{respuesta}}.java`
- `application/clients/{{seg}}/{{respuestaLista}}.java`
- `application/clients/{{seg}}/{{clientInterface}}.java`
- `application/orquestadores/{{serviceInterface}}.java`

### orqi.application.services
- `application/service/{{seg}}/{{serviceImpl}}.java`
- `application/service/clients/{{clientImpl}}.java`

### orqi.infraestructure.rest
- `infraestructure/rest/controller/{{seg}}/{{controller}}.java`

## Vault
- **Data:** `{{vaultData}}`
- **Internos:** `{{vaultInternos}}`

## TODO
- [ ] Revisar y completar validaciones en `{{serviceImpl}}`
- [ ] Completar implementación de métodos en `{{clientImpl}}`
- [ ] Verificar rutas en `MainRest.java` (Task 6)
- [ ] Actualizar `ClientVaultFactory` y `ApplicationServiceFactory`