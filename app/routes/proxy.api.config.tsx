import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { exigirProxy } from "../lib/security/proxy.server";
import { ajustesDe, aparienciaDe, obtenerOCrearTienda } from "../lib/shopify/tienda.server";
import { listarDepartamentos } from "../lib/ubigeo/catalogo";
import { proveedorDocumentos } from "../lib/documents/index.server";
import { proveedorGeo } from "../lib/geo/index.server";
import { urlCorreo, urlWhatsapp } from "../lib/contacto";

/**
 * Configuración del formulario, para cuando va incrustado en el tema.
 *
 * En la página propia (`/apps/envio`) la configuración viaja dentro del HTML.
 * Pero si el comerciante coloca el formulario en su página de carrito, ese HTML
 * no existe: el script se carga suelto y tiene que pedir la configuración aquí.
 *
 * Va por el App Proxy, así que Shopify firma la petición y sabemos de qué
 * tienda es sin necesidad de que el tema lo diga.
 */
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

  return json(
    {
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
      assets: process.env.SHOPIFY_APP_URL?.replace(/\/+$/, "") ?? process.env.RENDER_EXTERNAL_URL ?? "",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
};
