package {{paqueteBase}}.application.service.{{seg}};

import {{paqueteBase}}.application.clients.{{seg}}.{{clases.dto}};
import {{paqueteBase}}.application.clients.{{seg}}.{{clases.respuesta}};
import {{paqueteBase}}.application.orquestadores.{{clases.serviceInterface}};
import {{paqueteBase}}.application.service.clients.{{clases.clientImpl}};
import bo.gob.sin.sen.onion.application.FixedExecutorSingle;
import bo.gob.sin.sen.onion.application.restclient.ClientException;
import bo.gob.sin.sen.onion.domain.MensajeServicio;

import java.util.concurrent.CompletableFuture;

/**
 * {{descripcionClase}}
 *
 * @author {{autor}}
 * @version {{version}}
 */
public class {{clases.serviceImpl}} extends bo.gob.sin.sen.onion.application.service.ApplicationLogServiceImpl implements {{clases.serviceInterface}} {

    public {{clases.serviceImpl}}() {
        super();
    }

{{methods}}

    private {{clases.respuesta}} {{metodoPrivado}}( {{clases.dto}} p{{clases.dto}}) {
        try {
            {{clases.respuesta}} vRespuesta = null;
            //TODO: colocar validaciones si es necesario
            boolean isValid = Boolean.TRUE;

            if (isValid) { //llamar a servicio
                var v{{clases.clientImpl}} = {{clases.clientImpl}}.create();
                v{{clases.clientImpl}}.setToken(getToken());
                vRespuesta = v{{clases.clientImpl}}.{{metodoPrivado}}(p{{clases.dto}});

                if (vRespuesta.getExcepcion() != null) {
                    var vUUID = UUIDError("Error desde API al {{accion}}", vRespuesta.getExcepcion(), p{{clases.dto}}, vRespuesta);
                    vRespuesta.clean(vUUID);
                }
            }
            return vRespuesta;
        } catch (ClientException ex) {
            return {{clases.respuesta}}.builder()
                    .addMensaje(new MensajeServicio(ex.getCodigo(), ex.getMessage())).build();
        } catch (Exception ex) {
            return {{clases.respuesta}}.builder()
                    .addMensaje(new MensajeServicio(-1, ex.getMessage())).build();
        }
    }
}