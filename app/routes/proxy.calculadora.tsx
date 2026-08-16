import type { LoaderFunctionArgs } from "@remix-run/node";
import { exigirProxy } from "../lib/security/proxy.server";
import { aparienciaDe, obtenerOCrearTienda } from "../lib/shopify/tienda.server";
import { urlDeLaAppOpcional } from "../lib/url.server";

/**
 * Página propia de la calculadora de envíos: /apps/envio/calculadora
 *
 * Sirve para enlazarla desde el menú de la tienda o desde un correo. El mismo
 * widget se puede incrustar en cualquier página del tema con el fragmento de
 * DESPLEGAR-EXTENSION-TEMA.md; esta ruta es solo la versión con dirección fija.
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
  const apariencia = await aparienciaDe(tienda.id);

  const assets = urlDeLaAppOpcional() ?? "";

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Calcula el costo de tu envío</title>
<link rel="stylesheet" href="${assets}/envio/form.css?v=${VERSION_ESTATICOS}">
<style>
  :root{
    --ep-primario:${escapar(apariencia.colorPrincipal)};
    --ep-boton:${escapar(apariencia.colorBoton)};
    --ep-boton-texto:${escapar(apariencia.colorTextoBoton)};
    --ep-radio:${Number(apariencia.radio)}px;
  }
  body{ margin:0; padding:32px 16px; background:#f1f5f9; }
  .epc-envoltorio{ max-width:1400px; margin:0 auto; }
  .epc-cabecera{ margin-bottom:16px; }
  .epc-cabecera h1{ font-size:22px; margin:0 0 4px; color:#0f172a; }
  .epc-cabecera p{ margin:0; color:#64748b; font-size:15px; }
</style>
</head>
<body class="ep-pagina">
<div class="epc-envoltorio">
  <div class="epc-cabecera">
    <h1>Calcula el costo de tu envío</h1>
    <p>Elige tu distrito y verás cuánto cuesta llevarte el pedido.</p>
  </div>
  <div id="ep-calculadora"></div>
</div>
<script src="${assets}/envio/calculadora.js?v=${VERSION_ESTATICOS}" defer></script>
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
