import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { ultimosErrores } from "../lib/errores.server";
import { proveedorGeo } from "../lib/geo/index.server";

/**
 * Diagnóstico de configuración. Nunca muestra secretos: informa de la *forma*
 * de cada variable (longitud, prefijo, si parece lo que debería), jamás de su
 * contenido.
 *
 * Existe porque un panel embebido en blanco no dice nada: el iframe se queda
 * vacío y el error real se pierde. Esto lo saca a la luz sin tener que rebuscar
 * en los registros del servidor.
 *
 * PROTEGIDA CON CLAVE. Aunque no haya secretos, sí revela cuántas tiendas
 * tienen la app, qué permisos pide, qué proveedores usa y los últimos errores.
 * Para una app publicada eso es información operativa que no debe estar al
 * alcance de cualquiera. Se accede con ?clave=… y el valor sale de la variable
 * de entorno DIAGNOSTICO_CLAVE; sin ella definida, la ruta no existe.
 */
function claveValida(request: Request): boolean {
  const esperada = process.env.DIAGNOSTICO_CLAVE?.trim();
  if (!esperada) return false;
  const recibida = new URL(request.url).searchParams.get("clave") ?? "";
  // Longitudes distintas: fuera. Iguales: comparamos entera para no filtrar
  // información por el tiempo que tarda.
  if (recibida.length !== esperada.length) return false;
  let iguales = 0;
  for (let i = 0; i < esperada.length; i++) {
    iguales |= esperada.charCodeAt(i) ^ recibida.charCodeAt(i);
  }
  return iguales === 0;
}

function describir(valor: string | undefined, nombre: string) {
  if (!valor || valor.trim() === "") {
    return { nombre, definida: false, pista: "sin definir" };
  }
  const v = valor.trim();
  return {
    nombre,
    definida: true,
    longitud: v.length,
    empiezaPor: v.slice(0, 6) + "…",
    pista:
      v.startsWith("shpss_")
        ? "⚠ parece un SECRETO, no un Client ID"
        : v.startsWith("shpat_")
          ? "⚠ parece un token de acceso de admin"
          : /^[0-9a-f]{32}$/i.test(v)
            ? "✓ tiene forma de Client ID"
            : "formato no reconocido",
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (!claveValida(request)) {
    // 404 y no 403: así ni siquiera se confirma que la ruta existe.
    throw new Response("No encontrado", { status: 404 });
  }

  const apiKey = process.env.SHOPIFY_API_KEY;
  const secreto = process.env.SHOPIFY_API_SECRET;

  let baseDatos = "sin comprobar";
  let distritos: number | null = null;
  let tiendasInstaladas: number | null = null;
  let sesiones: number | null = null;

  try {
    [distritos, tiendasInstaladas, sesiones] = await Promise.all([
      prisma.distrito.count(),
      prisma.shop.count({ where: { instalada: true } }),
      prisma.session.count(),
    ]);
    baseDatos = "conectada";
  } catch (e) {
    baseDatos = `error: ${(e as Error).message.slice(0, 160)}`;
  }

  /** Últimas consultas DNI/RUC: solo el código de resultado, sin datos personales. */
  let consultasDoc: Array<Record<string, unknown>> = [];
  try {
    consultasDoc = (
      await prisma.consultaDocumento.findMany({
        orderBy: { creadoEn: "desc" },
        take: 5,
        select: { tipoDoc: true, ultimosDigitos: true, resultado: true, proveedor: true, duracionMs: true, creadoEn: true },
      })
    ).map((c) => ({ ...c, documento: `…${c.ultimosDigitos}`, ultimosDigitos: undefined }));
  } catch {
    consultasDoc = [];
  }

  /**
   * Últimos avisos de geolocalización.
   *
   * Van a la tabla de eventos, no al registro en memoria, así que sin esto no
   * había forma de ver por qué falló una detección de distrito: el comprador
   * solo veía "selecciónalo manualmente" y el motivo se perdía.
   */
  let eventosGeo: Array<Record<string, unknown>> = [];
  try {
    eventosGeo = await prisma.evento.findMany({
      where: { tipo: { in: ["geo.error", "checkout.direccion"] } },
      orderBy: { creadoEn: "desc" },
      take: 12,
      select: { tipo: true, mensaje: true, nivel: true, creadoEn: true },
    });
  } catch {
    eventosGeo = [];
  }

  const geo = proveedorGeo();

  return json(
    {
      geolocalizacion: {
        proveedorActivo: process.env.GEO_PROVIDER ?? "(sin definir)",
        proveedorCargado: geo.nombre,
        disponible: geo.disponible(),
        userAgentDefinido: Boolean(process.env.NOMINATIM_USER_AGENT),
        claveGoogleDefinida: Boolean(process.env.GOOGLE_MAPS_API_KEY),
        ultimosAvisos: eventosGeo.filter((e) => e.tipo === "geo.error"),
        /**
         * Qué se envió al checkout en las últimas confirmaciones.
         * `marca=true` significa que el distrito salió de aquí con el separador
         * correcto; si aun así llega vacío, el problema está en Shopify.
         */
        ultimasDirecciones: eventosGeo.filter((e) => e.tipo === "checkout.direccion"),
      },
      documentos: {
        proveedorActivo: process.env.DNI_RUC_PROVIDER ?? "(sin definir)",
        modoAuth: process.env.DNI_RUC_AUTH ?? "bearer",
        /** Se muestra la PLANTILLA sin el token, para ver si los marcadores están bien. */
        plantillaDni: (process.env.DNI_RUC_API_URL_DNI ?? "(sin definir)").replace(/token=[^&]*/i, "token=***"),
        plantillaRuc: (process.env.DNI_RUC_API_URL_RUC ?? "(sin definir)").replace(/token=[^&]*/i, "token=***"),
        tieneMarcadorNumeroDni: (process.env.DNI_RUC_API_URL_DNI ?? "").includes("{numero}"),
        tieneMarcadorNumeroRuc: (process.env.DNI_RUC_API_URL_RUC ?? "").includes("{numero}"),
        tokenDefinido: Boolean(process.env.DNI_RUC_API_KEY),
        ultimasConsultas: consultasDoc,
      },
      credenciales: {
        apiKey: describir(apiKey, "SHOPIFY_API_KEY"),
        secreto: {
          ...describir(secreto, "SHOPIFY_API_SECRET"),
          pista: !secreto
            ? "sin definir"
            : secreto.startsWith("shpss_")
              ? "✓ tiene forma de secreto"
              : "⚠ un secreto de Shopify empieza por shpss_",
        },
      },
      urls: {
        SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL ?? "(sin definir)",
        RENDER_EXTERNAL_URL: process.env.RENDER_EXTERNAL_URL ?? "(sin definir)",
        laQueUsaLaApp:
          process.env.SHOPIFY_APP_URL?.trim() ||
          process.env.RENDER_EXTERNAL_URL?.trim() ||
          "(ninguna: la app no arrancaría)",
      },
      scopes: process.env.SCOPES ?? "(sin definir)",
      baseDatos: { estado: baseDatos, distritos, tiendasInstaladas, sesiones },
      /**
       * Si `sesiones` es 0 pero la app aparece instalada en Shopify, significa
       * que el OAuth no llegó a guardar la sesión: casi siempre porque las
       * credenciales de Render no son las de la app instalada.
       */
      lectura:
        sesiones === 0
          ? "⚠ No hay ninguna sesión guardada. La app figura instalada en Shopify pero el servidor no completó el OAuth. Revisa que SHOPIFY_API_KEY y SHOPIFY_API_SECRET sean los de la app que instalaste."
          : "✓ Hay sesiones guardadas: el OAuth se completó correctamente.",
      /** Los errores reales que Remix oculta tras "Unexpected Server Error". */
      ultimosErrores: ultimosErrores(),
      hora: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
};
