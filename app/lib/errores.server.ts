/**
 * Registro en memoria de los últimos errores del servidor.
 *
 * Remix oculta el mensaje real de los errores en producción y devuelve
 * "Unexpected Server Error". Es lo correcto de cara al público —un error puede
 * filtrar rutas de archivos o datos— pero deja al comerciante sin nada que
 * mirar. Aquí los guardamos para poder consultarlos en /diagnostico.
 *
 * Es memoria del proceso: se pierde al reiniciar, y en varias instancias cada
 * una tiene la suya. Es una herramienta de diagnóstico, no una bitácora.
 */

export interface ErrorRegistrado {
  cuando: string;
  ruta: string;
  mensaje: string;
  pila?: string;
}

const MAXIMO = 10;
const registro: ErrorRegistrado[] = [];

export function registrarError(error: unknown, request?: Request) {
  const e = error instanceof Error ? error : new Error(String(error));

  registro.unshift({
    cuando: new Date().toISOString(),
    ruta: request ? new URL(request.url).pathname : "(desconocida)",
    mensaje: e.message,
    pila: e.stack?.split("\n").slice(0, 12).join("\n"),
  });

  if (registro.length > MAXIMO) registro.length = MAXIMO;

  // También a la salida estándar, para quien sí mire los registros del servidor.
  console.error(`[error] ${request ? new URL(request.url).pathname : ""} → ${e.message}`);
}

export function ultimosErrores(): ErrorRegistrado[] {
  return registro;
}
