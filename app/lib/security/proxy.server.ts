/**
 * Verificación de firmas de Shopify.
 *
 * Sin estas comprobaciones cualquiera podría llamar a nuestros endpoints
 * haciéndose pasar por una tienda, cotizar envíos gratis o inyectar pedidos.
 */
import crypto from "node:crypto";

export interface PeticionProxy {
  shop: string;
  pathPrefix: string;
  loggedInCustomerId: string | null;
}

/**
 * App Proxy: Shopify firma cada petición con HMAC-SHA256 sobre los parámetros
 * ordenados alfabéticamente y concatenados como "clave=valor" sin separador.
 */
export function verificarFirmaProxy(
  request: Request,
  secreto = process.env.SHOPIFY_API_SECRET ?? "",
): PeticionProxy | null {
  const url = new URL(request.url);
  const parametros = new URLSearchParams(url.search);
  const firma = parametros.get("signature");
  if (!firma || !secreto) return null;
  parametros.delete("signature");

  const claves = [...new Set([...parametros.keys()])].sort();
  const cadena = claves.map((k) => `${k}=${parametros.getAll(k).join(",")}`).join("");
  const calculada = crypto.createHmac("sha256", secreto).update(cadena).digest("hex");

  const a = Buffer.from(calculada, "utf8");
  const b = Buffer.from(firma, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const shop = parametros.get("shop");
  if (!shop) return null;

  return {
    shop,
    pathPrefix: parametros.get("path_prefix") ?? "",
    loggedInCustomerId: parametros.get("logged_in_customer_id"),
  };
}

/** Igual que la anterior pero lanzando 401, para usar en loaders y actions. */
export function exigirProxy(request: Request): PeticionProxy {
  const datos = verificarFirmaProxy(request);
  if (!datos) throw new Response("Firma de App Proxy inválida", { status: 401 });
  return datos;
}

/**
 * HMAC del cuerpo: lo usan los webhooks y el callback del CarrierService
 * (cabecera X-Shopify-Hmac-Sha256, base64).
 */
export function verificarHmacCuerpo(
  cuerpo: string,
  hmacRecibido: string | null,
  secreto = process.env.SHOPIFY_API_SECRET ?? "",
): boolean {
  if (!hmacRecibido || !secreto) return false;
  const calculado = crypto.createHmac("sha256", secreto).update(cuerpo, "utf8").digest("base64");
  const a = Buffer.from(calculado);
  const b = Buffer.from(hmacRecibido);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Token opaco y firmado para la sesión de envío que viaja hasta el checkout. */
export function firmarToken(payload: string, secreto = process.env.SESSION_SIGNING_SECRET ?? ""): string {
  const firma = crypto.createHmac("sha256", secreto).update(payload).digest("base64url");
  return `${payload}.${firma}`;
}

export function verificarToken(token: string, secreto = process.env.SESSION_SIGNING_SECRET ?? ""): string | null {
  const corte = token.lastIndexOf(".");
  if (corte < 0) return null;
  const payload = token.slice(0, corte);
  const firma = token.slice(corte + 1);
  const esperada = crypto.createHmac("sha256", secreto).update(payload).digest("base64url");
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? payload : null;
}
