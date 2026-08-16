import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { obtenerOCrearTienda } from "../lib/shopify/tienda.server";
import { registrarCarrierService, sincronizarInfoTienda } from "../lib/shopify/carrier.server";
import { urlDeLaApp } from "../lib/url.server";

/**
 * OAuth. Al terminar la instalación damos de alta la tienda, sincronizamos su
 * plan y registramos el CarrierService. Si el plan no es elegible no falla la
 * instalación: se marca NO_ELEGIBLE y la app funciona en modo alternativo.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await obtenerOCrearTienda(session.shop);

  await sincronizarInfoTienda(admin, shop.id).catch(() => null);
  await registrarCarrierService(admin, shop.id, urlDeLaApp()).catch(() => null);

  return null;
};
