import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { componerAddress2, separarAddress2 } from "../lib/ubigeo/direccion";
import { registrarEvento } from "../lib/shopify/tienda.server";

/**
 * Webhooks. `authenticate.webhook` ya verifica el HMAC; si falla, lanza 401.
 * Todos los manejadores son idempotentes: Shopify reintenta y puede duplicar.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload, admin } = await authenticate.webhook(request);
  const tienda = await prisma.shop.findUnique({ where: { dominio: shop } });

  switch (topic) {
    case "APP_UNINSTALLED": {
      // No borramos las tarifas: si reinstala, las recupera. Solo cortamos acceso.
      await prisma.session.deleteMany({ where: { shop } });
      if (tienda) {
        await prisma.shop.update({
          where: { id: tienda.id },
          data: { instalada: false, desinstaladaEn: new Date(), carrierServiceEstado: "NO_REGISTRADO" },
        });
        await registrarEvento(tienda.id, "app.uninstall", `Desinstalada de ${shop}`);
      }
      break;
    }

    case "APP_SUBSCRIPTIONS_UPDATE": {
      const estadoShopify = (payload as any)?.app_subscription?.status;
      const mapa: Record<string, any> = {
        ACTIVE: "ACTIVA",
        CANCELLED: "CANCELADA",
        EXPIRED: "VENCIDA",
        DECLINED: "RECHAZADA",
        FROZEN: "CONGELADA",
        PENDING: "PENDIENTE",
      };
      if (tienda && mapa[estadoShopify]) {
        await prisma.suscripcion.upsert({
          where: { shopId: tienda.id },
          create: { shopId: tienda.id, estado: mapa[estadoShopify] },
          update: { estado: mapa[estadoShopify] },
        });
        await registrarEvento(tienda.id, "billing.webhook", `Suscripción: ${estadoShopify}`);
      }
      break;
    }

    case "ORDERS_CREATE": {
      const atributos: Array<{ name: string; value: string }> = (payload as any)?.note_attributes ?? [];

      // Marcamos la sesión de envío como usada y la vinculamos al pedido.
      const token = atributos.find((a) => a.name === "_envio_token")?.value;
      if (tienda && token) {
        await prisma.sesionEnvio.updateMany({
          where: { shopId: tienda.id, token },
          data: { usada: true },
        });
      }

      /**
       * Fecha de nacimiento → metacampo estándar del cliente.
       *
       * `facts.birth_date` es una definición estándar de Shopify, de tipo
       * `date` y en formato ISO 8601. Al ser estándar, el comerciante la ve en
       * la ficha del cliente y puede segmentar por cumpleaños sin configurar
       * nada.
       *
       * Se hace aquí y no antes porque el cliente no existe hasta que se crea
       * el pedido: en el formulario todavía es un visitante anónimo.
       */
      /**
       * Reponer el distrito en la dirección del pedido.
       *
       * El distrito peruano viaja dentro de `address2`, separado por un
       * carácter invisible. Al precargar el checkout por parámetros de URL,
       * Shopify descarta esa parte y el campo Distrito llega vacío: se ve en el
       * checkout y, lo que importa, en el pedido y en la etiqueta de envío.
       *
       * Aquí lo reponemos sobre el pedido ya creado, que es donde de verdad
       * hace falta para repartir. El campo del checkout seguirá saliendo vacío
       * durante la compra —eso no lo controlamos—, pero el pedido queda bien.
       */
      const distritoAtributo = atributos.find((a) => a.name === "Distrito")?.value;
      const envio = (payload as any)?.shipping_address;
      const pedidoId = (payload as any)?.id;

      if (distritoAtributo && envio && pedidoId && admin) {
        const address2Actual: string = envio.address2 ?? "";
        const { distrito: yaLoTiene, referencia } = separarAddress2(address2Actual);

        if (!yaLoTiene) {
          try {
            const respuesta = await admin.graphql(
              `#graphql
                mutation reponerDistrito($input: OrderInput!) {
                  orderUpdate(input: $input) {
                    userErrors { field message }
                  }
                }`,
              {
                variables: {
                  input: {
                    id: `gid://shopify/Order/${pedidoId}`,
                    shippingAddress: {
                      // Se reenvía la dirección entera: mandar solo address2
                      // podría borrar el resto.
                      address1: envio.address1 ?? "",
                      address2: componerAddress2(referencia ?? address2Actual ?? null, distritoAtributo),
                      city: envio.city ?? "",
                      province: envio.province ?? "",
                      zip: envio.zip ?? "",
                      countryCode: "PE",
                      firstName: envio.first_name ?? "",
                      lastName: envio.last_name ?? "",
                      phone: envio.phone ?? "",
                    },
                  },
                },
              },
            );

            const errores = (await respuesta.json())?.data?.orderUpdate?.userErrors ?? [];
            await registrarEvento(
              tienda?.id ?? null,
              "pedido.distrito",
              errores.length
                ? `No se pudo reponer el distrito: ${errores.map((e: any) => e.message).join("; ")}`
                : `Distrito repuesto en el pedido: ${distritoAtributo}`,
              undefined,
              errores.length ? "WARN" : "DEBUG",
            );
          } catch (e) {
            await registrarEvento(
              tienda?.id ?? null,
              "pedido.distrito",
              `Error al reponer el distrito: ${(e as Error).message}`,
              undefined,
              "WARN",
            );
          }
        }
      }

      const cumple = atributos.find((a) => a.name === "_cumple")?.value;
      const clienteId = (payload as any)?.customer?.id;

      if (cumple && clienteId && admin) {
        try {
          const respuesta = await admin.graphql(
            `#graphql
              mutation guardarCumple($metafields: [MetafieldsSetInput!]!) {
                metafieldsSet(metafields: $metafields) {
                  userErrors { field message }
                }
              }`,
            {
              variables: {
                metafields: [
                  {
                    ownerId: `gid://shopify/Customer/${clienteId}`,
                    namespace: "facts",
                    key: "birth_date",
                    type: "date",
                    value: cumple,
                  },
                ],
              },
            },
          );
          const errores = (await respuesta.json())?.data?.metafieldsSet?.userErrors ?? [];
          if (errores.length) {
            await registrarEvento(
              tienda?.id ?? null,
              "cliente.cumple",
              `No se pudo guardar la fecha: ${errores.map((e: any) => e.message).join("; ")}`,
              undefined,
              "WARN",
            );
          }
        } catch (e) {
          // Nunca dejamos que esto tumbe el webhook: el pedido ya está hecho.
          await registrarEvento(
            tienda?.id ?? null,
            "cliente.cumple",
            `Error al guardar la fecha de nacimiento: ${(e as Error).message}`,
            undefined,
            "WARN",
          );
        }
      }

      /**
       * Consentimientos de marketing → suscripción real del cliente.
       *
       * Shopify no deja marcar desde fuera sus casillas del checkout: no hay
       * parámetro de URL ni atributo de carrito que lo haga. Lo que sí se puede
       * es preguntar en nuestro formulario y registrar el consentimiento en la
       * ficha del cliente en cuanto existe, que es aquí.
       *
       * Solo suscribimos, nunca damos de baja: si el comprador dejó la casilla
       * vacía puede ser que ya estuviera suscrito de antes, y borrarle esa
       * preferencia sin que lo pida sería incorrecto.
       */
      const quiereEmail = atributos.find((a) => a.name === "_mkt_email")?.value === "1";
      const quiereSms = atributos.find((a) => a.name === "_mkt_sms")?.value === "1";

      if ((quiereEmail || quiereSms) && clienteId && admin) {
        const idCliente = `gid://shopify/Customer/${clienteId}`;
        // Momento exacto del consentimiento: es lo que hay que poder demostrar
        // si alguien reclama por qué recibe estos mensajes.
        const cuando = new Date().toISOString();

        const suscribir = async (canal: "email" | "sms") => {
          const consulta =
            canal === "email"
              ? `#graphql
                  mutation suscribirEmail($input: CustomerEmailMarketingConsentUpdateInput!) {
                    customerEmailMarketingConsentUpdate(input: $input) {
                      userErrors { field message }
                    }
                  }`
              : `#graphql
                  mutation suscribirSms($input: CustomerSmsMarketingConsentUpdateInput!) {
                    customerSmsMarketingConsentUpdate(input: $input) {
                      userErrors { field message }
                    }
                  }`;

          const consentimiento = {
            marketingState: "SUBSCRIBED",
            // Opt-in simple: el comprador marcó la casilla en la tienda. Si el
            // comerciante necesitara doble confirmación por correo, aquí iría
            // CONFIRMED_OPT_IN y un envío de verificación.
            marketingOptInLevel: "SINGLE_OPT_IN",
            consentUpdatedAt: cuando,
          };

          const respuesta = await admin.graphql(consulta, {
            variables: {
              input:
                canal === "email"
                  ? { customerId: idCliente, emailMarketingConsent: consentimiento }
                  : { customerId: idCliente, smsMarketingConsent: consentimiento },
            },
          });

          const cuerpo = await respuesta.json();
          const errores =
            cuerpo?.data?.customerEmailMarketingConsentUpdate?.userErrors ??
            cuerpo?.data?.customerSmsMarketingConsentUpdate?.userErrors ??
            [];

          if (errores.length) {
            await registrarEvento(
              tienda?.id ?? null,
              "cliente.marketing",
              `No se pudo suscribir por ${canal}: ${errores.map((e: any) => e.message).join("; ")}`,
              undefined,
              "WARN",
            );
          }
        };

        try {
          // El cliente necesita correo para el consentimiento por email y
          // teléfono para el de SMS; si falta, Shopify devuelve userError y
          // queda anotado en el registro.
          if (quiereEmail) await suscribir("email");
          if (quiereSms) await suscribir("sms");
        } catch (e) {
          await registrarEvento(
            tienda?.id ?? null,
            "cliente.marketing",
            `Error al registrar el consentimiento: ${(e as Error).message}`,
            undefined,
            "WARN",
          );
        }
      }

      break;
    }

    // --- Obligatorios para la App Store (GDPR / Ley de protección de datos) ---
    case "CUSTOMERS_DATA_REQUEST": {
      await registrarEvento(tienda?.id ?? null, "gdpr.data_request", `Solicitud de datos de ${shop}`);
      break;
    }
    case "CUSTOMERS_REDACT": {
      // Solo guardamos datos del comprador en SesionEnvio, y expiran solas.
      const email = (payload as any)?.customer?.email;
      if (tienda && email) {
        const sesiones = await prisma.sesionEnvio.findMany({ where: { shopId: tienda.id } });
        const aBorrar = sesiones.filter((s) => (s.datos as any)?.email === email).map((s) => s.id);
        if (aBorrar.length) await prisma.sesionEnvio.deleteMany({ where: { id: { in: aBorrar } } });
      }
      await registrarEvento(tienda?.id ?? null, "gdpr.customer_redact", `Datos del comprador borrados`);
      break;
    }
    case "SHOP_REDACT": {
      if (tienda) {
        await prisma.shop.delete({ where: { id: tienda.id } }); // en cascada borra todo lo suyo
      }
      break;
    }

    default:
      await registrarEvento(tienda?.id ?? null, "webhook.desconocido", `Topic sin manejar: ${topic}`, undefined, "WARN");
  }

  return new Response(null, { status: 200 });
};
