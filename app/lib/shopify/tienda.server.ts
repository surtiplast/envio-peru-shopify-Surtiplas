/**
 * Acceso a la tienda (tenant) y garantías de aislamiento multi-tienda.
 *
 * REGLA DE ORO: ninguna consulta de negocio se hace sin shopId. Todas las
 * funciones de este archivo devuelven el shopId ya resuelto a partir de la
 * sesión autenticada de Shopify, nunca a partir de un parámetro del cliente.
 */
import prisma from "../../db.server";
import { totales } from "../ubigeo/catalogo";

/**
 * Obtiene la tienda, creándola si es la primera vez.
 *
 * Tiene que ser IDEMPOTENTE y resistente a llamadas simultáneas. Remix ejecuta
 * los loaders de la ruta padre y de la hija EN PARALELO, y ambos llaman aquí.
 * En una instalación nueva los dos ven que la tienda no existe y los dos
 * intentan crearla: con un `create` normal, el segundo choca contra el índice
 * único de `dominio` y tumba la petición con "Unexpected Server Error".
 *
 * Con `upsert` en todo, la carrera deja de importar: el que llegue segundo
 * simplemente actualiza en vez de fallar.
 */
export async function obtenerOCrearTienda(dominio: string) {
  const shop = await prisma.shop.upsert({
    where: { dominio },
    create: { dominio },
    update: { instalada: true, desinstaladaEn: null },
  });

  // Registros de configuración que toda tienda necesita. Con `upsert` se pueden
  // repetir sin consecuencias.
  await Promise.all([
    prisma.ajustes.upsert({ where: { shopId: shop.id }, create: { shopId: shop.id }, update: {} }),
    prisma.apariencia.upsert({ where: { shopId: shop.id }, create: { shopId: shop.id }, update: {} }),
    prisma.suscripcion.upsert({
      where: { shopId: shop.id },
      create: { shopId: shop.id, estado: "PENDIENTE" },
      update: {},
    }),
  ]);

  return shop;
}

export async function tiendaPorDominio(dominio: string) {
  return prisma.shop.findUnique({ where: { dominio } });
}

/** Lanza si la tienda no existe: evita consultas con shopId undefined. */
export async function exigirTienda(dominio: string) {
  const shop = await obtenerOCrearTienda(dominio);
  if (!shop) throw new Response("Tienda no encontrada", { status: 404 });
  return shop;
}

export async function ajustesDe(shopId: string) {
  return prisma.ajustes.upsert({ where: { shopId }, create: { shopId }, update: {} });
}

export async function aparienciaDe(shopId: string) {
  return prisma.apariencia.upsert({ where: { shopId }, create: { shopId }, update: {} });
}

/** Cifras del panel principal. Una sola ida a la base de datos por métrica. */
export async function resumenDashboard(shopId: string) {
  const [
    totalTarifas,
    tarifasActivas,
    departamentos,
    provincias,
    metodos,
    puntosRecojo,
    ultimaImportacion,
    ultimaActualizacion,
  ] = await Promise.all([
    prisma.tarifa.count({ where: { shopId } }),
    prisma.tarifa.count({ where: { shopId, activo: true } }),
    prisma.tarifa.findMany({ where: { shopId }, distinct: ["codDep"], select: { codDep: true } }),
    prisma.tarifa.findMany({ where: { shopId }, distinct: ["codProv"], select: { codProv: true } }),
    prisma.metodoEnvio.groupBy({
      by: ["tipo"],
      where: { activo: true, tarifa: { shopId } },
      _count: { _all: true },
    }),
    prisma.puntoRecojo.count({ where: { shopId, activo: true } }),
    prisma.importacion.findFirst({ where: { shopId }, orderBy: { iniciadaEn: "desc" } }),
    prisma.tarifa.findFirst({ where: { shopId }, orderBy: { actualizadaEn: "desc" }, select: { actualizadaEn: true } }),
  ]);

  const porTipo = Object.fromEntries(metodos.map((m) => [m.tipo, m._count._all]));
  const catalogo = totales();

  return {
    totalTarifas,
    tarifasActivas,
    departamentos: departamentos.length,
    provincias: provincias.length,
    distritosCubiertos: totalTarifas,
    coberturaPorcentaje: catalogo.distritos ? Math.round((totalTarifas / catalogo.distritos) * 1000) / 10 : 0,
    catalogo,
    enviosEstandar: porTipo.ESTANDAR ?? 0,
    enviosExpress: porTipo.EXPRESS ?? 0,
    recojos: porTipo.RECOJO ?? 0,
    puntosRecojo,
    ultimaImportacion,
    ultimaActualizacion: ultimaActualizacion?.actualizadaEn ?? null,
  };
}

export async function registrarEvento(
  shopId: string | null,
  tipo: string,
  mensaje: string,
  meta?: unknown,
  nivel: "DEBUG" | "INFO" | "WARN" | "ERROR" = "INFO",
) {
  try {
    await prisma.evento.create({
      data: { shopId, tipo, mensaje, nivel, meta: meta ? (meta as object) : undefined },
    });
  } catch {
    // La bitácora nunca debe tumbar una petición del comprador.
  }
}
