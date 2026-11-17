package {{paqueteBase}}.application.clients.{{seg}};

import bo.gob.sin.sen.onion.application.impl.RespuestaStatus;
import bo.gob.sin.sen.onion.domain.MensajeServicio;

import java.util.List;

public class {{clases.respuestaLista}} extends RespuestaStatus {
{{fields}}

{{accessors}}

    public static {{clases.respuestaLista}}Builder builder() {
        return new {{clases.respuestaLista}}Builder();
    }

    public static final class {{clases.respuestaLista}}Builder {
        private final {{clases.respuestaLista}} {{camelRespuestaLista}};

        private {{clases.respuestaLista}}Builder() {
            {{camelRespuestaLista}} = new {{clases.respuestaLista}}();
        }

        public {{clases.respuestaLista}}Builder code(Integer code) {
            {{camelRespuestaLista}}.setCode(code);
            return this;
        }

        public {{clases.respuestaLista}}Builder excepcion(Exception excepcion) {
            {{camelRespuestaLista}}.setExcepcion(excepcion);
            return this;
        }

        public {{clases.respuestaLista}}Builder transaccion(Boolean transaccion) {
            {{camelRespuestaLista}}.setTransaccion(transaccion);
            return this;
        }

        public {{clases.respuestaLista}}Builder mensajes(List<MensajeServicio> mensajes) {
            {{camelRespuestaLista}}.setMensajes(mensajes);
            return this;
        }

        public {{clases.respuestaLista}} build() {
            return {{camelRespuestaLista}};
        }
    }
}