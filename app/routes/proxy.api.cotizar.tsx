import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { exigirProxy } from "../lib/security/proxy.server";
import { claveDePeticion, permitido } from "../lib/security/limite.server";
import { obtenerOCrearTienda } from "../lib/shopify/tienda.server";
import { cotizarParaTienda } from "../lib/rates/consulta.server";

/**
 * Cotización para el formulario del comprador.
 * Usa exactamente la misma función que el callback del CarrierService, así que
 * el precio que ve aquí es el que verá en el checkout.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = exigirProxy(request);

  if (!permitido(claveDePeticion(request, "cotizar"), 120)) {
    return json({ error: "Demasiadas peticiones" }, { status: 429 });
  }

  const cuerpo = await request.json().catch(() => null);
  const ubigeo = String(cuerpo?.ubigeo ?? "");
  const subtotal = Number(cuerpo?.subtotal ?? 0);

  if (!/^\d{6}$/.test(ubigeo)) return json({ error: "UBIGEO inválido", opciones: [] }, { status: 400 });
  if (!Number.isFinite(subtotal) || subtotal < 0) return json({ error: "Subtotal inválido", opciones: [] }, { status: 400 });

  const tienda = await obtenerOCrearTienda(shop);
  const resultado = await cotizarParaTienda(tienda.id, ubigeo, Math.round(subtotal));

  return json({
    encontrada: resultado.encontrada,
    opciones: resultado.opciones.map((o) => ({
      tipo: o.tipo,
      etiqueta: o.etiqueta,
      descripcion: o.descripcion,
      costo: o.costo,
      gratis: o.gratis,
      diasMin: o.diasMin,
      diasMax: o.diasMax,
    })),
  });
};
