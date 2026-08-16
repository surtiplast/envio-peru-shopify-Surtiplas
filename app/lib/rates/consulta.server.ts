/**
 * Puente entre la base de datos y el motor de tarifas (puro).
 * Convierte los Decimal de Prisma a céntimos y arma la TarifaResuelta.
 */
import type { Prisma } from "@prisma/client";
import prisma from "../../db.server";
import { aCentimos, cotizar } from "./motor";
import type { Cotizacion, MetodoTarifa, TarifaResuelta, TipoMetodo } from "./tipos";

const INCLUDE = {
  metodos: { include: { rangos: { orderBy: { orden: "asc" } } } },
} satisfies Prisma.TarifaInclude;

function aDecimalCentimos(v: Prisma.Decimal | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return aCentimos(v.toString());
}

export function mapearTarifa(fila: any): TarifaResuelta {
  return {
    ubigeo: fila.ubigeo,
    departamento: fila.nombreDep,
    provincia: fila.nombreProv,
    distrito: fila.nombreDist,
    activo: fila.activo,
    metodos: (fila.metodos ?? []).map(
      (m: any): MetodoTarifa => ({
        tipo: m.tipo as TipoMetodo,
        activo: m.activo,
        etiqueta: m.etiqueta,
        descripcion: m.descripcion,
        diasMin: m.diasMin,
        diasMax: m.diasMax,
        umbralEnvioGratis: aDecimalCentimos(m.umbralEnvioGratis),
        rangos: (m.rangos ?? []).map((r: any) => ({
          orden: r.orden,
          montoMin: aCentimos(r.montoMin.toString()),
          montoMax: r.montoMax === null ? null : aCentimos(r.montoMax.toString()),
          costo: aCentimos(r.costo.toString()),
          costoAlt1: aDecimalCentimos(r.costoAlt1),
          costoAlt2: aDecimalCentimos(r.costoAlt2),
          gratis: r.gratis,
        })),
      }),
    ),
  };
}

/** Busca la tarifa de un distrito para UNA tienda concreta. */
export async function tarifaDeDistrito(shopId: string, ubigeo: string): Promise<TarifaResuelta | null> {
  const fila = await prisma.tarifa.findUnique({
    where: { shopId_ubigeo: { shopId, ubigeo } },
    include: INCLUDE,
  });
  return fila ? mapearTarifa(fila) : null;
}

export interface ResultadoCotizacion {
  encontrada: boolean;
  ubigeo: string;
  opciones: Cotizacion[];
  /** Explicación para el Probador del admin. */
  explicacion: string;
}

/**
 * Cotiza un carrito para un distrito. Es la ÚNICA función que deben usar el
 * CarrierService, el formulario del cliente y el Probador, para que los tres
 * den siempre el mismo número.
 */
export async function cotizarParaTienda(
  shopId: string,
  ubigeo: string,
  subtotalCentimos: number,
  opciones?: { soloMetodos?: TipoMetodo[] },
): Promise<ResultadoCotizacion> {
  const [tarifa, ajustes] = await Promise.all([
    tarifaDeDistrito(shopId, ubigeo),
    prisma.ajustes.findUnique({ where: { shopId } }),
  ]);

  const cotizaciones = cotizar(tarifa, {
    subtotal: subtotalCentimos,
    columnaCosto: (ajustes?.columnaCostoActiva ?? 0) as 0 | 1 | 2,
    soloMetodos: opciones?.soloMetodos,
    politicaSinTarifa: ajustes?.politicaSinTarifa ?? "BLOQUEAR",
    costoPorDefecto: ajustes?.costoPorDefecto ? aCentimos(ajustes.costoPorDefecto.toString()) : null,
    etiquetasPorDefecto: ajustes
      ? {
          ESTANDAR: { etiqueta: ajustes.etiquetaEstandar, descripcion: ajustes.descripcionEstandar },
          EXPRESS: { etiqueta: ajustes.etiquetaExpress, descripcion: ajustes.descripcionExpress },
          RECOJO: { etiqueta: ajustes.etiquetaRecojo, descripcion: ajustes.descripcionRecojo },
        }
      : undefined,
  });

  let explicacion: string;
  if (!tarifa) {
    explicacion =
      ajustes?.politicaSinTarifa === "COSTO_FIJO"
        ? "El distrito no tiene tarifa configurada; se aplicó el costo por defecto de la tienda."
        : "El distrito no tiene tarifa configurada y la política es bloquear el envío.";
  } else if (!tarifa.activo) {
    explicacion = "La tarifa de este distrito existe pero está desactivada.";
  } else if (cotizaciones.length === 0) {
    explicacion = "Ningún método cubre este subtotal. Revisa los rangos configurados.";
  } else {
    const principal = cotizaciones[0];
    explicacion =
      principal.motivo === "RANGO"
        ? `Se aplicó el rango ${principal.rango?.orden} del ${principal.etiqueta}.`
        : principal.motivo === "RANGO_GRATIS"
          ? `El rango ${principal.rango?.orden} está marcado como envío gratis.`
          : principal.motivo === "UMBRAL_GRATIS"
            ? "El subtotal superó el umbral de envío gratis del método."
            : "Se aplicó el costo por defecto de la tienda.";
  }

  return { encontrada: Boolean(tarifa), ubigeo, opciones: cotizaciones, explicacion };
}
