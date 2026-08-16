/**
 * URL pública de la aplicación.
 *
 * Resuelve una dependencia circular molesta al desplegar: Shopify necesita
 * saber la URL pública para el OAuth, el App Proxy y el callback de tarifas,
 * pero esa URL no existe hasta que la plataforma ha creado el servicio.
 *
 * Render publica automáticamente `RENDER_EXTERNAL_URL` con el dominio asignado,
 * así que la usamos como respaldo. Resultado práctico: el primer despliegue
 * arranca sin que hayas configurado nada, y luego puedes fijar SHOPIFY_APP_URL
 * a mano si usas un dominio propio.
 */
export function urlDeLaApp(): string {
  const configurada = process.env.SHOPIFY_APP_URL?.trim();
  if (configurada) return configurada.replace(/\/+$/, "");

  // Render (y varias plataformas similares) inyectan esta variable.
  const dePlataforma = process.env.RENDER_EXTERNAL_URL?.trim();
  if (dePlataforma) return dePlataforma.replace(/\/+$/, "");

  throw new Error(
    "No se pudo determinar la URL pública de la app. Define SHOPIFY_APP_URL " +
      "con el dominio completo, por ejemplo https://envio-peru.onrender.com",
  );
}

/** Igual que la anterior, pero devuelve "" en vez de fallar. Para plantillas. */
export function urlDeLaAppOpcional(): string {
  try {
    return urlDeLaApp();
  } catch {
    return "";
  }
}
