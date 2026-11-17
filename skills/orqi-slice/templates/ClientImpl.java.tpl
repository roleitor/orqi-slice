package {{paqueteBase}}.application.service.clients;

import {{paqueteBase}}.application.ClientVaultFactory;
import {{paqueteBase}}.application.clients.{{seg}}.{{clases.dto}};
import {{paqueteBase}}.application.clients.{{seg}}.{{clases.clientInterface}};
import {{paqueteBase}}.application.clients.{{seg}}.{{clases.respuesta}};
import bo.gob.sin.sen.onion.application.rest.ClientService;
import bo.gob.sin.sen.onion.application.restclient.ClientException;

import java.util.concurrent.CompletableFuture;

/**
 * {{descripcionClase}}
 *
 * @author {{autor}}
 * @version {{version}}
 */
public class {{clases.clientImpl}} extends ClientService implements {{clases.clientInterface}} {

    private {{clases.clientImpl}}() throws ClientException {
        super(ClientVaultFactory.{{factories.clientVaultMethod}}());
    }

    public static {{clases.clientInterface}} create() throws ClientException {
        return new {{clases.clientImpl}}();
    }

{{methods}}

    private static final String {{camelServicio}}ApiPath = "{{rutaBase}}/";
}