import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import {
  aTarifaCarrier,
  MONEDA_TARIFAS,
  subtotalDePeticion,
  type PeticionCarrier,
  type TarifaCarrier,
} from "../lib/shopify/carrier.server";
import { cotizarParaTienda } from "../lib/rates/consulta.server";
import { resolver as resolverUbigeo } from "../lib/ubigeo/catalogo";
import { separarAddress2 } from "../lib/ubigeo/direccion";
import { verificarHmacCuerpo } from "../lib/security/proxy.server";
import { registrarEvento } from "../lib/shopify/tienda.server";

/**
 * Callback del CarrierService. Shopify hace POST aquí durante el checkout con
 * el destino y el contenido del carrito, y espera { rates: [...] }.
 *
 * Restricciones que impone Shopify y que respetamos:
 *  - Hay que responder rápido (unos pocos segundos) o Shopify descarta la
 *    respuesta y muestra las tarifas manuales de la tienda.
 *  - Los precios van en CÉNTIMOS y como texto.
 *  - Una lista vacía significa "no hay envío disponible a esta dirección",
 *    que es exactamente lo que queremos para un distrito sin cobertura.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const inicio = Date.now();
  const cuerpo = await request.text();

  // Shopify firma el cuerpo. Sin firma válida no atendemos.
  if (!verificarHmacCuerpo(cuerpo, request.headers.get("X-Shopify-Hmac-Sha256"))) {
    return new Response("Firma inválida", { status: 401 });
  }

  const dominio = request.headers.get("X-Shopify-Shop-Domain");
  if (!dominio) return new Response("Falta la tienda", { status: 400 });

  const tienda = await prisma.shop.findUnique({ where: { dominio } });
  if (!tienda) return json({ rates: [] });

  let peticion: PeticionCarrier;
  try {
    peticion = JSON.parse(cuerpo);
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }

  const destino = peticion.rate?.destination;
  if (!destino || (destino.country && destino.country !== "PE")) {
    return json({ rates: [] }); // esta app solo cubre Perú
  }

  try {
    /**
     * De la dirección de Shopify al UBIGEO.
     * `province` trae el departamento y `city` suele traer el distrito. Como no
     * siempre es fiable, si el comprador pasó por nuestro formulario usamos el
     * UBIGEO exacto que guardamos en los atributos del carrito.
     */
    const atributoUbigeo = peticion.rate.items
      ?.map((i) => i.properties?.["_ubigeo"])
      .find(Boolean);

    /**
     * Cómo encontrar el distrito, de más fiable a menos:
     *
     *  1. El UBIGEO exacto que dejó el formulario en los atributos del carrito.
     *  2. El "neighborhood" que Shopify guarda dentro de address2: es el campo
     *     Distrito del checkout.
     *  3. La ciudad, por si alguien llegó sin pasar por el formulario y escribió
     *     ahí su distrito.
     */
    const { distrito: distritoDeDireccion } = separarAddress2(destino.address2);

    const resuelto =
      (atributoUbigeo ? resolverUbigeo({ ubigeo: atributoUbigeo }) : null) ??
      (distritoDeDireccion
        ? resolverUbigeo({
            departamento: destino.province ?? undefined,
            provincia: destino.city ?? undefined,
            distrito: distritoDeDireccion,
          })
        : null) ??
      resolverUbigeo({
        departamento: destino.province ?? undefined,
        distrito: destino.city ?? undefined,
      });

    if (!resuelto) {
      await registrarEvento(
        tienda.id,
        "carrier.sin_ubigeo",
        `No se pudo mapear "${destino.city}" / "${destino.province}" a un distrito`,
        { destino },
        "WARN",
      );
      return json({ rates: [] });
    }

    const subtotal = subtotalDePeticion(peticion);

    /**
     * Método elegido en el formulario previo.
     *
     * Viaja en las propiedades de línea del carrito. Si lo encontramos,
     * devolvemos SOLO esa opción: el checkout muestra una única tarifa y queda
     * seleccionada sola, que es justo lo que el comprador ya decidió. Ofrecerle
     * las tres otra vez invita a que cambie de idea y a que el pedido no
     * coincida con lo que eligió.
     *
     * Si no viene (por ejemplo, alguien que fue directo al checkout saltándose
     * el formulario), devolvemos todas las disponibles.
     */
    const metodoElegido = peticion.rate.items
      ?.map((i) => i.properties?.["_metodo"])
      .find(Boolean) as "ESTANDAR" | "EXPRESS" | "RECOJO" | undefined;

    /**
     * Recojo: la tarifa sale de la sede, no del distrito.
     *
     * Si dependiéramos de la tarifa del distrito donde está la tienda, bastaría
     * con que ese distrito estuviera desactivado para que el comprador se
     * quedara sin poder recoger, que no tiene ningún sentido: el recojo no es
     * un envío.
     */
    const sedeId = peticion.rate.items?.map((i) => i.properties?.["_sede_id"]).find(Boolean);
    if (metodoElegido === "RECOJO" && sedeId) {
      const punto = await prisma.puntoRecojo.findFirst({
        where: { id: String(sedeId), shopId: tienda.id, activo: true },
      });
      if (punto) {
        const centimos = Math.round(Number(punto.costo) * 100);
        const rates = [
          aTarifaCarrier(
            {
              tipo: "RECOJO",
              etiqueta: `Recojo en tienda — ${punto.nombre}`,
              descripcion: [punto.direccion, punto.horario].filter(Boolean).join(" · "),
              costo: centimos,
            },
            MONEDA_TARIFAS,
          ),
        ];
        await registrarEvento(
          tienda.id,
          "carrier.rate",
          `Recojo en ${punto.nombre} en ${Date.now() - inicio} ms`,
          { sede: punto.nombre, costo: centimos },
          "DEBUG",
        );
        return json({ rates });
      }
    }

    const { opciones } = await cotizarParaTienda(tienda.id, resuelto.ubigeo, subtotal);

    const seleccionadas = metodoElegido
      ? opciones.filter((o) => o.tipo === metodoElegido)
      : opciones.filter((o) => o.tipo !== "RECOJO");

    // Si el método elegido ya no está disponible (cambió la tarifa entre medias),
    // mejor ofrecer lo que haya que dejar el checkout sin opciones de envío.
    const finales = seleccionadas.length > 0 ? seleccionadas : opciones;

    /**
     * Si el comprador eligió recojo, añadimos la sede al texto de la tarifa.
     * Así el pedido llega diciendo dónde hay que dejarlo preparado, sin que
     * nadie tenga que abrir los atributos para averiguarlo.
     */
    const sede = peticion.rate.items?.map((i) => i.properties?.["_sede"]).find(Boolean);

    const rates: TarifaCarrier[] = finales.map((o) => {
      const conSede =
        o.tipo === "RECOJO" && sede
          ? { ...o, descripcion: `${sede} · ${o.descripcion}` }
          : o;
      return aTarifaCarrier(conSede, MONEDA_TARIFAS);
    });

    await registrarEvento(
      tienda.id,
      "carrier.rate",
      `${resuelto.distrito}: ${rates.length} tarifa(s) en ${Date.now() - inicio} ms`,
      { ubigeo: resuelto.ubigeo, subtotal, metodoElegido: metodoElegido ?? "(ninguno)" },
      "DEBUG",
    );

    return json({ rates });
  } catch (e) {
    // Ante cualquier error devolvemos lista vacía: nunca un 500, porque eso
    // deja el checkout del comprador en un estado feo.
    await registrarEvento(tienda.id, "carrier.error", (e as Error).message, undefined, "ERROR");
    return json({ rates: [] });
  }
};

export const loader = () => new Response("Método no permitido", { status: 405 });
