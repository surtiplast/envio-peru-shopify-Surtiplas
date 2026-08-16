import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { exigirProxy } from "../lib/security/proxy.server";
import { ajustesDe, obtenerOCrearTienda } from "../lib/shopify/tienda.server";
import { tarifaDeDistrito } from "../lib/rates/consulta.server";
import { obtenerDistrito } from "../lib/ubigeo/catalogo";
import { formatearSoles } from "../lib/rates/motor";
import { urlCorreo, urlWhatsapp } from "../lib/contacto";

/**
 * Tarifario público de un distrito, para la calculadora del comprador.
 *
 * A diferencia de /cotizar, que devuelve UN precio para UN carrito, aquí van
 * todos los rangos: "hasta S/ 99.99 son S/ 15, de S/ 100 a S/ 199.99 son
 * S/ 12…". Así el comprador sabe cuánto le costará el envío antes de tener
 * nada en el carrito, y ve a partir de qué monto le sale gratis.
 *
 * Solo devuelve precios y etiquetas: nada de datos de la tienda ni internos.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = exigirProxy(request);
  const url = new URL(request.url);
  const ubigeo = String(url.searchParams.get("ubigeo") ?? "");

  if (!/^\d{6}$/.test(ubigeo)) {
    return json({ error: "UBIGEO inválido" }, { status: 400 });
  }

  const distrito = obtenerDistrito(ubigeo);
  if (!distrito) return json({ error: "Distrito no encontrado" }, { status: 404 });

  const tienda = await obtenerOCrearTienda(shop);
  const [tarifa, ajustes, puntos] = await Promise.all([
    tarifaDeDistrito(tienda.id, ubigeo),
    ajustesDe(tienda.id),
    prisma.puntoRecojo.findMany({
      where: { shopId: tienda.id, activo: true },
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
      select: { nombre: true, direccion: true, horario: true, costo: true },
    }),
  ]);

  const etiquetasPorDefecto: Record<string, { etiqueta: string; descripcion: string }> = {
    ESTANDAR: { etiqueta: ajustes.etiquetaEstandar, descripcion: ajustes.descripcionEstandar },
    EXPRESS: { etiqueta: ajustes.etiquetaExpress, descripcion: ajustes.descripcionExpress },
    RECOJO: { etiqueta: ajustes.etiquetaRecojo, descripcion: ajustes.descripcionRecojo },
  };

  // Sin tarifa o desactivada: se responde con la lista vacía, y la calculadora
  // dice claramente que no hay reparto. Es mejor eso que un precio inventado.
  const disponible = Boolean(tarifa?.activo);

  const metodos = (disponible ? tarifa!.metodos : [])
    .filter((m) => m.activo && m.tipo !== "RECOJO")
    .map((m) => {
      const base = etiquetasPorDefecto[m.tipo];
      return {
        tipo: m.tipo,
        etiqueta: m.etiqueta?.trim() || base.etiqueta,
        descripcion: m.descripcion?.trim() || base.descripcion,
        umbralGratis:
          m.umbralEnvioGratis != null ? formatearSoles(m.umbralEnvioGratis) : null,
        rangos: [...m.rangos]
          .sort((a, b) => a.montoMin - b.montoMin)
          .map((r) => ({
            desde: formatearSoles(r.montoMin),
            hasta: r.montoMax === null || r.montoMax === undefined ? null : formatearSoles(r.montoMax),
            costo: r.gratis || r.costo === 0 ? null : formatearSoles(r.costo),
          })),
      };
    });

  return json(
    {
      distrito: {
        nombre: distrito.distrito,
        provincia: distrito.provincia,
        departamento: distrito.departamento,
      },
      disponible,
      metodos,
      contacto: {
        whatsapp: urlWhatsapp(ajustes.contactoWhatsapp),
        correo: ajustes.contactoEmail,
        correoUrl: urlCorreo(ajustes.contactoEmail),
      },
      recojo: puntos.map((p) => ({
        nombre: p.nombre,
        direccion: p.direccion,
        horario: p.horario,
        costo: Number(p.costo) === 0 ? null : formatearSoles(Math.round(Number(p.costo) * 100)),
      })),
    },
    // Los precios cambian poco y esta consulta la hará mucha gente: media hora
    // de caché quita carga sin que el comerciante note un desfase molesto.
    { headers: { "Cache-Control": "public, max-age=1800" } },
  );
};
