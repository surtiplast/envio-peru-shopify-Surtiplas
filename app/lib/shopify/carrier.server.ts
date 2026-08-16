/**
 * Registro y uso del CarrierService.
 *
 * ¿Por qué CarrierService y no "modificar el checkout"?
 * Shopify NO permite inyectar precios de envío arbitrarios desde el frontend.
 * La única vía oficial para que una tarifa calculada por nosotros aparezca en
 * el checkout es registrar un carrier service: Shopify llama a nuestro
 * callback con el destino y el carrito, y nosotros devolvemos las tarifas.
 *
 * Requisito de Shopify: la tienda necesita "envío calculado por terceros".
 * Lo tienen los planes Advanced y Plus; el plan Grow (antes llamado "Shopify")
 * lo activa automáticamente al pasar a facturación ANUAL, o pagando el
 * complemento mensual. Las tiendas de desarrollo lo traen siempre.
 *
 * Si la tienda no cumple, la mutación falla: lo detectamos, lo marcamos como
 * NO_ELEGIBLE y la app cae al modo de atributos de carrito
 * (ver docs/ARQUITECTURA.md, sección 4).
 */
import prisma from "../../db.server";
import { registrarEvento } from "./tienda.server";

const CREAR = `#graphql
  mutation crearCarrier($input: DeliveryCarrierServiceCreateInput!) {
    carrierServiceCreate(input: $input) {
      carrierService { id name callbackUrl active supportsServiceDiscovery }
      userErrors { field message }
    }
  }
`;

const ACTUALIZAR = `#graphql
  mutation actualizarCarrier($input: DeliveryCarrierServiceUpdateInput!) {
    carrierServiceUpdate(input: $input) {
      carrierService { id name callbackUrl active }
      userErrors { field message }
    }
  }
`;

const LISTAR = `#graphql
  query carriers {
    carrierServices(first: 50) {
      nodes { id name callbackUrl active }
    }
  }
`;

const TIENDA = `#graphql
  query info { shop { name email myshopifyDomain plan { displayName partnerDevelopment shopifyPlus } currencyCode } }
`;

export interface ClienteAdmin {
  graphql: (query: string, opciones?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

const NOMBRE_SERVICIO = "Envío Perú por distrito";

export async function sincronizarInfoTienda(admin: ClienteAdmin, shopId: string) {
  const r = await admin.graphql(TIENDA);
  const { data } = await r.json();
  const shop = data?.shop;
  if (!shop) return null;

  await prisma.shop.update({
    where: { id: shopId },
    data: {
      nombre: shop.name,
      email: shop.email,
      moneda: shop.currencyCode ?? "PEN",
      planShopify: shop.plan?.displayName ?? null,
    },
  });
  return shop;
}

/**
 * Registra (o actualiza) el carrier service de la tienda.
 * Es idempotente: si ya existe uno con nuestra URL, lo reutiliza.
 */
/**
 * Convierte cualquier cosa que se haya lanzado en un mensaje legible.
 *
 * Hace falta porque el cliente de Shopify no lanza `Error` normales: ante un
 * 401 o un 403 lanza un `Response`, que no tiene `.message`. El código antiguo
 * hacía `(e as Error).message ?? "Error desconocido"` y por eso el comerciante
 * veía «Error desconocido» justo cuando el motivo real —falta de permiso, plan
 * no elegible— era lo único que necesitaba saber.
 */
async function mensajeDeError(e: unknown): Promise<string> {
  if (e instanceof Response) {
    let cuerpo = "";
    try {
      cuerpo = (await e.clone().text()).slice(0, 300);
    } catch {
      /* el cuerpo ya se había consumido */
    }
    return `HTTP ${e.status}${cuerpo ? ` — ${cuerpo}` : ""}`;
  }
  if (e instanceof Error && e.message) return e.message;

  // GraphqlQueryError del cliente de Shopify lleva el detalle en `body`.
  const cualquiera = e as { body?: unknown; message?: string };
  if (cualquiera?.body) {
    try {
      return JSON.stringify(cualquiera.body).slice(0, 400);
    } catch {
      /* body no serializable */
    }
  }
  if (cualquiera?.message) return cualquiera.message;

  const texto = String(e);
  return texto === "[object Object]" ? "Error sin detalle de Shopify" : texto;
}

/** Errores de GraphQL de nivel superior: los de permisos vienen por aquí. */
function erroresDeConsulta(respuesta: any): string | null {
  const errores = respuesta?.errors;
  if (!Array.isArray(errores) || errores.length === 0) return null;
  return errores.map((x: any) => x?.message).filter(Boolean).join("; ") || null;
}

export async function registrarCarrierService(admin: ClienteAdmin, shopId: string, appUrl: string) {
  const callbackUrl = `${appUrl.replace(/\/+$/, "")}/api/carrier-service`;

  try {
    const existentesRes = await admin.graphql(LISTAR);
    const listado = await existentesRes.json();
    const errListado = erroresDeConsulta(listado);
    if (errListado) throw new Error(errListado);

    const existentes = listado?.data?.carrierServices?.nodes ?? [];
    const mio = existentes.find((c: any) => c.name === NOMBRE_SERVICIO);

    if (mio) {
      const r = await admin.graphql(ACTUALIZAR, {
        variables: { input: { id: mio.id, active: true, callbackUrl } },
      });
      const respuesta = await r.json();
      const errConsulta = erroresDeConsulta(respuesta);
      if (errConsulta) throw new Error(errConsulta);
      const datos = respuesta?.data?.carrierServiceUpdate;
      if (datos?.userErrors?.length) throw new Error(datos.userErrors.map((e: any) => e.message).join("; "));

      await prisma.shop.update({
        where: { id: shopId },
        data: { carrierServiceGid: mio.id, carrierServiceEstado: "ACTIVO", carrierServiceError: null },
      });
      return { ok: true as const, id: mio.id };
    }

    const r = await admin.graphql(CREAR, {
      variables: {
        input: {
          name: NOMBRE_SERVICIO,
          callbackUrl,
          supportsServiceDiscovery: true,
          active: true,
        },
      },
    });
    const respuesta = await r.json();
    const errConsulta = erroresDeConsulta(respuesta);
    if (errConsulta) throw new Error(errConsulta);
    const datos = respuesta?.data?.carrierServiceCreate;
    if (datos?.userErrors?.length) throw new Error(datos.userErrors.map((e: any) => e.message).join("; "));

    const id = datos?.carrierService?.id;
    // Sin id no hubo alta, por mucho que no haya llegado un error explícito.
    // Antes se guardaba ACTIVO con el id vacío y el fallo salía mucho después,
    // cuando el checkout no ofrecía tarifas y nadie sabía por qué.
    if (!id) throw new Error("Shopify no devolvió el CarrierService creado");
    await prisma.shop.update({
      where: { id: shopId },
      data: { carrierServiceGid: id, carrierServiceEstado: "ACTIVO", carrierServiceError: null },
    });
    await registrarEvento(shopId, "carrier.registrado", `CarrierService activo en ${callbackUrl}`);
    return { ok: true as const, id };
  } catch (e) {
    const crudo = await mensajeDeError(e);

    /**
     * Traducir el fallo más común, que además es el que más confunde.
     *
     * Shopify solo permite tarifas calculadas por terceros si la tienda tiene
     * habilitado «Carrier Calculated Shipping». Cuando no lo está, responde de
     * dos formas distintas según la tienda:
     *
     *   - con el texto explícito «Carrier Calculated Shipping must be enabled»
     *   - o con un HTTP 403 de cuerpo vacío, sin ninguna explicación
     *
     * El segundo caso costó un día entero de diagnóstico: parecía un problema
     * de permisos o de credenciales, y era la tienda. Aquí se unifican los dos
     * en un mensaje que le dice al comerciante exactamente qué hacer.
     */
    // SOLO cuando Shopify lo dice con todas las letras. Un 403 a secas NO
    // significa esto: se ha visto el mismo 403 en una tienda de desarrollo con
    // plan Advanced, que sí cumple el requisito. Clasificarlo como «falta la
    // función» mandaba al comerciante a cambiar un plan que ya tenía.
    const faltaFuncion = /carrier calculated shipping/i.test(crudo);

    // Un 403 sin cuerpo: Shopify no dice por qué. No inventamos la causa.
    const prohibidoSinDetalle = !faltaFuncion && /^HTTP 403/.test(crudo);

    // Cortos a propósito: la explicación larga vive en la pantalla, no aquí.
    const mensaje = faltaFuncion
      ? "Esta tienda no tiene habilitadas las tarifas calculadas por terceros."
      : prohibidoSinDetalle
        ? "Shopify rechazó el registro (403) sin indicar el motivo."
        : crudo;

    // El texto crudo de Shopify sí se guarda, pero solo en la bitácora.
    await registrarEvento(shopId, "carrier.detalle", crudo.slice(0, 300), undefined, "DEBUG");

    // NO_ELEGIBLE solo cuando de verdad sabemos que la tienda no cumple. Un
    // 403 opaco se queda en ERROR: es honesto decir que no sabemos.
    const noElegible = faltaFuncion || /not eligible/i.test(crudo);

    await prisma.shop.update({
      where: { id: shopId },
      data: {
        carrierServiceEstado: noElegible ? "NO_ELEGIBLE" : "ERROR",
        carrierServiceError: mensaje.slice(0, 500),
      },
    });
    await registrarEvento(shopId, "carrier.error", mensaje, undefined, "WARN");
    return { ok: false as const, mensaje, noElegible };
  }
}

// --- Formato del callback --------------------------------------------------

export interface PeticionCarrier {
  rate: {
    origin: Record<string, unknown>;
    destination: {
      country: string;
      postal_code: string | null;
      province: string | null;
      city: string | null;
      address1: string | null;
      address2: string | null;
      company: string | null;
    };
    items: Array<{
      name: string;
      sku: string;
      quantity: number;
      grams: number;
      price: number; // en céntimos
      product_id: number;
      variant_id: number;
      properties?: Record<string, string> | null;
      requires_shipping?: boolean;
    }>;
    currency: string;
    locale: string;
  };
}

export interface TarifaCarrier {
  service_name: string;
  description: string;
  service_code: string;
  currency: string;
  /** Céntimos, como exige Shopify. */
  total_price: string;
  phone_required?: boolean;
  min_delivery_date?: string;
  max_delivery_date?: string;
}

/** Subtotal del carrito en céntimos, contando solo lo que requiere envío. */
export function subtotalDePeticion(peticion: PeticionCarrier): number {
  return peticion.rate.items.reduce((suma, i) => {
    if (i.requires_shipping === false) return suma;
    return suma + i.price * i.quantity;
  }, 0);
}

function fechaEntrega(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString();
}

/**
 * Moneda en la que el comerciante escribe sus tarifas.
 *
 * SIEMPRE soles, y no la moneda de la tienda. El tarifario se carga en soles
 * («Lima 15», «Callao 20»), así que el importe que devolvemos ESTÁ en soles.
 * Si lo etiquetáramos con la moneda de la tienda, una tienda que opere en
 * dólares recibiría "10" y entendería 10 DÓLARES: el comprador vería S/ 60 de
 * envío en lugar de S/ 10.
 *
 * Shopify admite una moneda distinta a la de la tienda y hace la conversión
 * (su propio ejemplo de respuesta mezcla CAD y USD). Declarando PEN, el
 * importe es correcto en cualquier tienda, opere en la moneda que opere.
 */
export const MONEDA_TARIFAS = "PEN";

export function aTarifaCarrier(
  cotizacion: { tipo: string; etiqueta: string; descripcion: string; costo: number; diasMin?: number | null; diasMax?: number | null },
  moneda: string = MONEDA_TARIFAS,
): TarifaCarrier {
  return {
    service_name: cotizacion.etiqueta,
    description: cotizacion.descripcion,
    service_code: `ENVIO_PERU_${cotizacion.tipo}`,
    currency: moneda,
    total_price: String(Math.round(cotizacion.costo)),
    phone_required: true,
    ...(cotizacion.diasMin ? { min_delivery_date: fechaEntrega(cotizacion.diasMin) } : {}),
    ...(cotizacion.diasMax ? { max_delivery_date: fechaEntrega(cotizacion.diasMax) } : {}),
  };
}
