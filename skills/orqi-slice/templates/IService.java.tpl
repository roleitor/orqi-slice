package {{paqueteBase}}.application.orquestadores;

import {{paqueteBase}}.application.clients.{{seg}}.{{clases.dto}};
import {{paqueteBase}}.application.clients.{{seg}}.{{clases.respuesta}};

import java.util.concurrent.CompletableFuture;

public interface {{clases.serviceInterface}} extends bo.gob.sin.sen.onion.application.IApplicationService {
{{methods}}
}