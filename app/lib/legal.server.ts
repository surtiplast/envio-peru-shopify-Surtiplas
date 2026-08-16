/**
 * Páginas legales públicas: política de privacidad y plan de respuesta a
 * incidentes.
 *
 * Se sirven como HTML plano, sin Polaris ni App Bridge, por tres razones:
 * son públicas (Shopify y cualquier comerciante deben poder abrirlas sin
 * iniciar sesión), tienen que seguir en pie aunque la base de datos esté
 * caída, y su URL se pega en el formulario de la App Store, así que no puede
 * depender de una sesión embebida.
 *
 * Los datos de contacto se leen del entorno para no tener que tocar el código
 * al cambiar de razón social o de correo.
 */

export const EMPRESA = process.env.LEGAL_EMPRESA ?? "InnovaSoft";
export const CORREO_CONTACTO = process.env.LEGAL_CORREO ?? "surtiplast.pe@gmail.com";
export const APP = "InnovaSoft Shipping Perú";
export const ACTUALIZADO = "14 de agosto de 2026";

export function paginaLegal(titulo: string, cuerpo: string): Response {
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titulo} — ${APP}</title>
<style>
  :root{ color-scheme: light; }
  body{
    margin:0; padding:48px 20px;
    background:#f6f6f7; color:#1a1a1a;
    font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  }
  main{ max-width:760px; margin:0 auto; background:#fff; padding:48px; border-radius:12px;
        box-shadow:0 1px 3px rgba(0,0,0,.08); }
  h1{ font-size:28px; margin:0 0 4px; }
  h2{ font-size:19px; margin:36px 0 10px; padding-top:4px; }
  h3{ font-size:16px; margin:22px 0 6px; }
  p,li{ color:#303030; }
  ul{ padding-left:22px; }
  li{ margin-bottom:6px; }
  code{ background:#f1f1f1; padding:1px 5px; border-radius:4px; font-size:14px; }
  .fecha{ color:#6d7175; font-size:14px; margin:0 0 8px; }
  table{ border-collapse:collapse; width:100%; margin:14px 0; font-size:15px; }
  th,td{ border:1px solid #e1e3e5; padding:9px 11px; text-align:left; vertical-align:top; }
  th{ background:#fafbfb; font-weight:600; }
  footer{ margin-top:44px; padding-top:18px; border-top:1px solid #e1e3e5; color:#6d7175; font-size:14px; }
  a{ color:#005bd3; }
</style>
</head>
<body>
<main>
<h1>${titulo}</h1>
<p class="fecha">${APP} · Última actualización: ${ACTUALIZADO}</p>
${cuerpo}
<footer>
  ${EMPRESA} · <a href="mailto:${CORREO_CONTACTO}">${CORREO_CONTACTO}</a><br>
  <a href="/privacidad">Política de privacidad</a> · <a href="/seguridad">Respuesta a incidentes</a>
</footer>
</main>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Media hora de caché: cambian poquísimo y las abre gente de fuera.
      "Cache-Control": "public, max-age=1800",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
