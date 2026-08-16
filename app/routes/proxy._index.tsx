import type { LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { exigirProxy } from "../lib/security/proxy.server";
import { aparienciaDe, ajustesDe, obtenerOCrearTienda } from "../lib/shopify/tienda.server";
import { listarDepartamentos } from "../lib/ubigeo/catalogo";
import { proveedorDocumentos } from "../lib/documents/index.server";
import { proveedorGeo } from "../lib/geo/index.server";
import { urlDeLaAppOpcional } from "../lib/url.server";
import { urlCorreo, urlWhatsapp } from "../lib/contacto";

/**
 * Formulario del cliente, servido a través del App Proxy de Shopify.
 *
 * ¿Por qué App Proxy y no una página en nuestro dominio?
 * Porque el carrito de Shopify vive en cookies de primera parte del dominio de
 * la tienda. Sirviendo desde /apps/envio podemos leer /cart.js y escribir
 * /cart/update.js sin problemas de terceros, que es lo que hace que los datos
 * lleguen intactos al checkout.
 *
 * Devolvemos HTML plano (sin React ni Polaris) para que la página cargue en
 * milisegundos también en un móvil con 3G, que es el caso real en Perú.
 */

/**
 * Marca de versión de los archivos estáticos del formulario.
 *
 * El navegador cachea `form.js` y `form.css` con fuerza. Sin un parámetro que
 * cambie, un comprador (o tú, probando) seguiría viendo la versión anterior
 * durante horas después de un despliegue. Se calcula al arrancar el proceso:
 * cambia con cada despliegue y se mantiene estable mientras tanto, que es
 * justo el comportamiento que queremos.
 */
const VERSION_ESTATICOS = Date.now().toString(36);

function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = exigirProxy(request);
  const tienda = await obtenerOCrearTienda(shop);

  const [apariencia, ajustes, puntos] = await Promise.all([
    aparienciaDe(tienda.id),
    ajustesDe(tienda.id),
    prisma.puntoRecojo.findMany({
      where: { shopId: tienda.id, activo: true },
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
      select: { id: true, nombre: true, direccion: true, horario: true, telefono: true, costo: true, referencia: true },
    }),
  ]);

  const config = {
    tienda: shop,
    base: "/apps/envio",
    apariencia: {
      logoUrl: apariencia.logoUrl,
      nombreEmpresa: apariencia.nombreEmpresa,
      colorPrincipal: apariencia.colorPrincipal,
      colorBoton: apariencia.colorBoton,
      colorTextoBoton: apariencia.colorTextoBoton,
      colorTexto: apariencia.colorTexto,
      colorFondo: apariencia.colorFondo,
      colorBorde: apariencia.colorBorde,
      juegoIconos: apariencia.juegoIconos,
      radio: apariencia.radio,
      titulo: apariencia.tituloEncabezado,
      subtitulo: apariencia.subtitulo,
      textoBoton: apariencia.textoBoton,
      mostrarExpress: apariencia.mostrarExpress,
      mostrarRecojo: apariencia.mostrarRecojo && puntos.length > 0,
      mostrarTelefono: apariencia.mostrarTelefono,
      mostrarReferencia: apariencia.mostrarReferencia,
      mostrarDocumento: apariencia.mostrarDocumento && proveedorDocumentos().disponible(),
      mostrarTerminos: apariencia.mostrarTerminos,
      mostrarGeolocalizacion: apariencia.mostrarGeolocalizacion && proveedorGeo().disponible(),
      mostrarBuscadorDireccion: apariencia.mostrarBuscadorDireccion && proveedorGeo().disponible(),
        mostrarCumpleanos: apariencia.mostrarCumpleanos,
        mostrarMarketingEmail: apariencia.mostrarMarketingEmail,
        mostrarMarketingSms: apariencia.mostrarMarketingSms,
    },
    contacto: {
      whatsapp: urlWhatsapp(ajustes.contactoWhatsapp),
      correo: ajustes.contactoEmail,
      correoUrl: urlCorreo(ajustes.contactoEmail),
    },
    terminos: {
      texto: ajustes.terminosTexto ?? "Acepto los términos y condiciones.",
      url: ajustes.terminosUrl,
      obligatorio: ajustes.terminosObligatorio,
    },
    departamentos: listarDepartamentos().map((d) => ({ codigo: d.codigo, nombre: d.nombre })),
    puntosRecojo: puntos.map((p) => ({ ...p, costo: Number(p.costo) })),
    assets: urlDeLaAppOpcional(),
  };

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>${escapar(apariencia.tituloEncabezado)}</title>
<link rel="stylesheet" href="${config.assets}/envio/form.css?v=${VERSION_ESTATICOS}">
<style>
  :root{
    --ep-primario:${escapar(apariencia.colorPrincipal)};
    --ep-boton:${escapar(apariencia.colorBoton)};
    --ep-boton-texto:${escapar(apariencia.colorTextoBoton)};
    --ep-radio:${Number(apariencia.radio)}px;
  }
</style>
</head>
<body class="ep-pagina">
<div id="ep-app" aria-busy="true">
  <div class="ep-cargando"><span class="ep-spinner"></span> Cargando tus opciones de entrega…</div>
</div>
<script id="ep-config" type="application/json">${JSON.stringify(config).replace(/</g, "\\u003c")}</script>
<script src="${config.assets}/envio/form.js?v=${VERSION_ESTATICOS}" defer></script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Frame-Options": "SAMEORIGIN",
      "Referrer-Policy": "same-origin",
    },
  });
};
