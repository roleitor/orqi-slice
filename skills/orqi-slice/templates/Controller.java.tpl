package {{paqueteBase}}.infraestructure.rest.controller.{{seg}};

import {{paqueteBase}}.application.clients.{{seg}}.{{clases.dto}};
import {{paqueteBase}}.application.service.ApplicationServiceFactory;
import {{paqueteBase}}.application.service.clients.{{clases.clientImpl}};
import bo.gob.sin.sen.onion.application.impl.JsonBuilder;
import bo.gob.sin.sen.onion.infraestructure.JWTValidator;
import bo.gob.sin.sen.onion.infraestructure.rest.RequestUtil;
import bo.gob.sin.str.logs.impl.Log;
import org.eclipse.jetty.http.HttpStatus;
import spark.Route;

/**
 * {{descripcionClase}}
 *
 * @author {{autor}}
 * @version {{version}}
 */
public final class {{clases.controller}} {
    private static final JsonBuilder jsonBuilder = JsonBuilder.create();

    public {{clases.controller}}() {
        super();
    }

{{routeFields}}
}