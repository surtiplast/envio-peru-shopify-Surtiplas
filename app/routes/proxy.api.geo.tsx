import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { exigirProxy } from "../lib/security/proxy.server";
import { claveDePeticion, permitido } from "../lib/security/limite.server";
import { proveedorGeo, ubicacionPorCoordenadas, ubicacionPorReferencia } from "../lib/geo/index.server";
import { listarDistritos, listarProvincias } from "../lib/ubigeo/catalogo";
import { obtenerOCrearTienda, registrarEvento } from "../lib/shopify/tienda.server";

/**
 * Geolocalización. Todo pasa por el servidor: la API key del proveedor nunca
 * se expone al navegador. Si el proveedor falla, respondemos 200 con
 * `disponible: false` para que el formulario siga funcionando a mano.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = exigirProxy(request);

  // Estas llamadas cuestan dinero: límite más estricto.
  if (!permitido(claveDePeticion(request, "geo"), 30)) {
    return json({ error: "Demasiadas peticiones", disponible: true }, { status: 429 });
  }

  const cuerpo = await request.json().catch(() => null);
  const accion = String(cuerpo?.accion ?? "");
  const proveedor = proveedorGeo();

  if (!proveedor.disponible()) {
    return json({ disponible: false, sugerencias: [] });
  }

  try {
    if (accion === "inversa") {
      const lat = Number(cuerpo.lat);
      const lng = Number(cuerpo.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return json({ error: "Coordenadas inválidas" }, { status: 400 });
      }
      // Perú, con holgura: aprox. lat -18.5..0, lng -81.5..-68.5
      if (lat < -19 || lat > 0.5 || lng < -82 || lng > -68) {
        return json({ fueraDePeru: true, direccion: null, ubigeo: null, requiereConfirmacion: true });
      }
      const r = await ubicacionPorCoordenadas(lat, lng);
      return json(enriquecer(r));
    }

    if (accion === "autocompletar") {
      const texto = String(cuerpo?.texto ?? "").slice(0, 120);
      if (texto.length < 4) return json({ sugerencias: [] });
      return json({ sugerencias: await proveedor.autocompletar(texto, cuerpo?.sesion) });
    }

    if (accion === "detalle") {
      const referencia = String(cuerpo?.referencia ?? "").slice(0, 300);
      if (!referencia) return json({ error: "Falta la referencia" }, { status: 400 });
      const r = await ubicacionPorReferencia(referencia, cuerpo?.sesion);
      return json(enriquecer(r));
    }

    return json({ error: "Acción no reconocida" }, { status: 400 });
  } catch (e) {
    /**
     * Degradación elegante: nunca dejamos al comprador bloqueado.
     *
     * Pero el motivo sí queda anotado. Antes se perdía, y desde fuera el fallo
     * de un proveedor de mapas era indistinguible de un distrito que no
     * supimos reconocer: dos problemas muy distintos con el mismo mensaje.
     */
    try {
      const tienda = await obtenerOCrearTienda(shop);
      await registrarEvento(
        tienda.id,
        "geo.error",
        `${proveedor.nombre} falló en "${accion}": ${(e as Error).message}`,
        undefined,
        "WARN",
      );
    } catch {
      // Si ni siquiera podemos registrar, seguimos: el comprador es lo primero.
    }
    // "Ocupado" no es lo mismo que "no funciona": el comprador debe saber que
    // puede reintentar en unos segundos en vez de creer que su zona no existe.
    const limitado = (e as { codigo?: string })?.codigo === "LIMITE";

    return json({
      disponible: false,
      motivo: limitado ? "LIMITE" : "ERROR",
      direccion: null,
      ubigeo: null,
      requiereConfirmacion: true,
    });
  }
};

/** Añade las listas de provincias y distritos para que el formulario pueda
 *  preseleccionar los tres selectores de una sola vez. */
function enriquecer(r: Awaited<ReturnType<typeof ubicacionPorCoordenadas>>) {
  if (!r) return { direccion: null, ubigeo: null, requiereConfirmacion: true };
  return {
    direccion: r.direccion,
    ubigeo: r.ubigeo,
    requiereConfirmacion: r.requiereConfirmacion,
    provincias: r.ubigeo ? listarProvincias(r.ubigeo.codDep) : [],
    distritos: r.ubigeo ? listarDistritos(r.ubigeo.codProv) : [],
  };
}
