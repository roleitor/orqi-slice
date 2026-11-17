package {{paqueteBase}}.application.clients.{{seg}};

import bo.gob.sin.sen.onion.application.impl.RespuestaStatus;
import bo.gob.sin.sen.onion.domain.MensajeServicio;

import java.util.List;

public class {{clases.respuesta}} extends RespuestaStatus {
{{fields}}

{{accessors}}

    public static {{clases.respuesta}}Builder builder() {
        return new {{clases.respuesta}}Builder();
    }

    public static final class {{clases.respuesta}}Builder {
        private final {{clases.respuesta}} {{camelRespuesta}};

        private {{clases.respuesta}}Builder() {
            {{camelRespuesta}} = new {{clases.respuesta}}();
        }

        public {{clases.respuesta}}Builder code(Integer code) {
            {{camelRespuesta}}.setCode(code);
            return this;
        }

        public {{clases.respuesta}}Builder excepcion(Exception excepcion) {
            {{camelRespuesta}}.setExcepcion(excepcion);
            return this;
        }

        public {{clases.respuesta}}Builder transaccion(Boolean transaccion) {
            {{camelRespuesta}}.setTransaccion(transaccion);
            return this;
        }

        public {{clases.respuesta}}Builder mensajes(List<MensajeServicio> mensajes) {
            {{camelRespuesta}}.setMensajes(mensajes);
            return this;
        }

        public {{clases.respuesta}}Builder addMensaje(MensajeServicio mensaje) {
            {{camelRespuesta}}.addMensaje(mensaje);
            return this;
        }

        public {{clases.respuesta}} build() {
            return {{camelRespuesta}};
        }
    }
}