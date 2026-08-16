import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { exigirProxy } from "../lib/security/proxy.server";
import { claveDePeticion, permitido } from "../lib/security/limite.server";
import { obtenerOCrearTienda } from "../lib/shopify/tienda.server";
import { MENSAJE_DEGRADADO, consultarDocumento } from "../lib/documents/index.server";

/**
 * Consulta DNI / RUC.
 *
 * Nunca devolvemos más de lo que el comprador necesita para completar el
 * formulario, y las credenciales del proveedor jamás salen del servidor.
 * Si algo falla respondemos 200 con ok:false y un mensaje amable: bloquear la
 * compra por una API caída sería el peor resultado posible.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = exigirProxy(request);

  // Límite estricto: evita que alguien use el endpoint para minar datos.
  if (!permitido(claveDePeticion(request, "doc"), 10)) {
    return json({ ok: false, mensajeUsuario: "Demasiadas consultas. Espera un momento." }, { status: 429 });
  }

  const cuerpo = await request.json().catch(() => null);
  const tipo = String(cuerpo?.tipo ?? "").toUpperCase();
  const numero = String(cuerpo?.numero ?? "").replace(/\D/g, "");

  if (tipo !== "DNI" && tipo !== "RUC") {
    return json({ ok: false, codigo: "INVALIDO", mensaje: "Tipo de documento no válido." }, { status: 400 });
  }

  try {
    const tienda = await obtenerOCrearTienda(shop);
    const resultado = await consultarDocumento(tienda.id, tipo, numero);
    return json(resultado);
  } catch {
    return json({ ok: false, codigo: "ERROR_PROVEEDOR", mensajeUsuario: MENSAJE_DEGRADADO });
  }
};
