/**
 * Limitador de peticiones en memoria para los endpoints públicos
 * (geolocalización, consulta de documentos, cotización).
 *
 * Nota de despliegue: si corres más de una instancia, cámbialo por Redis.
 * La interfaz es la misma, solo cambia el almacén.
 */
const VENTANA = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
const MAXIMO = Number(process.env.RATE_LIMIT_MAX ?? 60);

const contadores = new Map<string, { hasta: number; usos: number }>();

export function permitido(clave: string, maximo = MAXIMO, ventana = VENTANA): boolean {
  const ahora = Date.now();
  const actual = contadores.get(clave);

  if (!actual || actual.hasta < ahora) {
    contadores.set(clave, { hasta: ahora + ventana, usos: 1 });
    return true;
  }
  actual.usos++;
  return actual.usos <= maximo;
}

/** Identificador razonable del cliente detrás de un proxy o CDN. */
export function claveDePeticion(request: Request, sufijo = ""): string {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "desconocida";
  return `${ip}:${sufijo}`;
}

/** Limpieza periódica para que el mapa no crezca sin control. */
if (typeof setInterval !== "undefined") {
  const temporizador = setInterval(() => {
    const ahora = Date.now();
    for (const [clave, valor] of contadores) if (valor.hasta < ahora) contadores.delete(clave);
  }, 5 * 60_000);
  (temporizador as unknown as { unref?: () => void }).unref?.();
}
