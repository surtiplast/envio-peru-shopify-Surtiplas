/**
 * Motor de cálculo de tarifas. Funciones PURAS: sin base de datos, sin red,
 * sin fecha del sistema. Todo lo que necesita entra por parámetros, de forma
 * que el mismo código se ejecuta en el callback del CarrierService, en el
 * formulario del cliente y en el Probador del admin, y siempre da lo mismo.
 */
import type {
  Cotizacion,
  MetodoTarifa,
  OpcionesCotizacion,
  ProblemaRangos,
  RangoTarifa,
  TarifaResuelta,
  TipoMetodo,
} from "./tipos";

const ETIQUETAS_BASE: Record<TipoMetodo, { etiqueta: string; descripcion: string }> = {
  ESTANDAR: { etiqueta: "Envío estándar", descripcion: "Entrega en 2 a 5 días hábiles" },
  EXPRESS: { etiqueta: "Envío express", descripcion: "Entrega rápida" },
  RECOJO: { etiqueta: "Recojo en tienda", descripcion: "Sin costo de envío" },
};

const ORDEN_PRESENTACION: TipoMetodo[] = ["ESTANDAR", "EXPRESS", "RECOJO"];

/**
 * Convierte un importe en soles (número, string o Decimal de Prisma) a céntimos.
 * Redondea al céntimo más cercano; "10.005" -> 1001.
 */
export function aCentimos(valor: number | string | null | undefined): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  const n = typeof valor === "number" ? valor : Number(String(valor).replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Céntimos -> string con dos decimales, listo para mostrar. */
export function aSoles(centimos: number): string {
  return (centimos / 100).toFixed(2);
}

export function formatearSoles(centimos: number): string {
  return `S/ ${aSoles(centimos)}`;
}

/**
 * Busca el rango que cubre el subtotal.
 *
 * Reglas:
 *  - Los dos extremos son inclusivos: un rango 0–99.99 y otro 100–199.99 no se
 *    pisan porque trabajamos en céntimos (0–9999 y 10000–19999).
 *  - Si dos rangos se solapan gana el de menor `orden`. Es el comportamiento
 *    que espera el comerciante que numeró sus rangos 1, 2, 3 en el CSV.
 *  - `montoMax: null` significa "sin límite" (el clásico "S/ 300 a más").
 */
export function buscarRango(rangos: RangoTarifa[], subtotal: number): RangoTarifa | null {
  const ordenados = [...rangos].sort((a, b) => a.orden - b.orden);
  for (const r of ordenados) {
    const dentroDelPiso = subtotal >= r.montoMin;
    const dentroDelTecho = r.montoMax === null || r.montoMax === undefined || subtotal <= r.montoMax;
    if (dentroDelPiso && dentroDelTecho) return r;
  }
  return null;
}

function elegirCosto(rango: RangoTarifa, columna: 0 | 1 | 2): number {
  if (columna === 1 && rango.costoAlt1 !== null && rango.costoAlt1 !== undefined) return rango.costoAlt1;
  if (columna === 2 && rango.costoAlt2 !== null && rango.costoAlt2 !== undefined) return rango.costoAlt2;
  return rango.costo;
}

/** Cotiza un solo método. */
export function cotizarMetodo(metodo: MetodoTarifa, opciones: OpcionesCotizacion): Cotizacion {
  const columna = opciones.columnaCosto ?? 0;
  const base =
    opciones.etiquetasPorDefecto?.[metodo.tipo] ?? ETIQUETAS_BASE[metodo.tipo];
  const etiqueta = metodo.etiqueta?.trim() || base.etiqueta;
  const descripcion = metodo.descripcion?.trim() || base.descripcion;
  const comun = {
    tipo: metodo.tipo,
    etiqueta,
    descripcion,
    diasMin: metodo.diasMin ?? null,
    diasMax: metodo.diasMax ?? null,
  };

  // 1. Umbral de envío gratis: manda sobre cualquier rango.
  if (
    metodo.umbralEnvioGratis !== null &&
    metodo.umbralEnvioGratis !== undefined &&
    opciones.subtotal >= metodo.umbralEnvioGratis
  ) {
    return { ...comun, costo: 0, gratis: true, disponible: true, motivo: "UMBRAL_GRATIS" };
  }

  // 2. Rango que cubra el subtotal.
  const rango = buscarRango(metodo.rangos, opciones.subtotal);
  if (rango) {
    const gratis = Boolean(rango.gratis);
    return {
      ...comun,
      costo: gratis ? 0 : elegirCosto(rango, columna),
      gratis,
      disponible: true,
      motivo: gratis ? "RANGO_GRATIS" : "RANGO",
      rango: { orden: rango.orden, montoMin: rango.montoMin, montoMax: rango.montoMax ?? null },
    };
  }

  // 3. Sin rango: decide la política de la tienda.
  if (opciones.politicaSinTarifa === "COSTO_FIJO" && opciones.costoPorDefecto != null) {
    return {
      ...comun,
      costo: opciones.costoPorDefecto,
      gratis: opciones.costoPorDefecto === 0,
      disponible: true,
      motivo: "COSTO_FIJO",
    };
  }

  return { ...comun, costo: 0, gratis: false, disponible: false, motivo: "SIN_COBERTURA" };
}

/**
 * Cotiza todos los métodos de un distrito y devuelve solo los ofrecibles,
 * en el orden en que deben mostrarse al comprador.
 */
export function cotizar(tarifa: TarifaResuelta | null, opciones: OpcionesCotizacion): Cotizacion[] {
  if (!tarifa || !tarifa.activo) {
    if (opciones.politicaSinTarifa === "COSTO_FIJO" && opciones.costoPorDefecto != null) {
      return [
        {
          ...ETIQUETAS_BASE.ESTANDAR,
          tipo: "ESTANDAR",
          costo: opciones.costoPorDefecto,
          gratis: opciones.costoPorDefecto === 0,
          disponible: true,
          motivo: "COSTO_FIJO",
        },
      ];
    }
    return [];
  }

  const permitidos = opciones.soloMetodos;
  return tarifa.metodos
    .filter((m) => m.activo)
    .filter((m) => !permitidos || permitidos.includes(m.tipo))
    .map((m) => cotizarMetodo(m, opciones))
    .filter((c) => c.disponible)
    .sort((a, b) => ORDEN_PRESENTACION.indexOf(a.tipo) - ORDEN_PRESENTACION.indexOf(b.tipo));
}

/**
 * Revisa la escalera de rangos y reporta huecos, solapamientos e inconsistencias.
 * Se usa en el editor de tarifas y en la validación del importador: es mucho
 * mejor avisar al comerciante que dejarle un carrito sin opciones de envío.
 */
export function validarRangos(rangos: RangoTarifa[]): ProblemaRangos[] {
  const problemas: ProblemaRangos[] = [];
  if (rangos.length === 0) {
    return [{ nivel: "aviso", codigo: "SIN_RANGOS", mensaje: "El método no tiene ningún rango configurado." }];
  }

  const ordenados = [...rangos].sort((a, b) => a.montoMin - b.montoMin);

  for (const r of ordenados) {
    if (r.montoMin < 0 || r.costo < 0) {
      problemas.push({
        nivel: "error",
        codigo: "NEGATIVO",
        orden: r.orden,
        mensaje: `Rango ${r.orden}: los importes no pueden ser negativos.`,
      });
    }
    if (r.montoMax !== null && r.montoMax !== undefined && r.montoMax < r.montoMin) {
      problemas.push({
        nivel: "error",
        codigo: "INVERTIDO",
        orden: r.orden,
        mensaje: `Rango ${r.orden}: el monto máximo (${aSoles(r.montoMax)}) es menor que el mínimo (${aSoles(r.montoMin)}).`,
      });
    }
  }

  for (let i = 0; i < ordenados.length - 1; i++) {
    const actual = ordenados[i];
    const siguiente = ordenados[i + 1];
    if (actual.montoMax === null || actual.montoMax === undefined) {
      problemas.push({
        nivel: "aviso",
        codigo: "SOLAPADO",
        orden: actual.orden,
        mensaje: `Rango ${actual.orden} es "sin límite" pero hay rangos posteriores: nunca se usarán.`,
      });
      continue;
    }
    if (siguiente.montoMin <= actual.montoMax) {
      problemas.push({
        nivel: "aviso",
        codigo: "SOLAPADO",
        orden: siguiente.orden,
        mensaje: `Los rangos ${actual.orden} y ${siguiente.orden} se solapan. Se aplicará el de menor número.`,
      });
    } else if (siguiente.montoMin > actual.montoMax + 1) {
      problemas.push({
        nivel: "aviso",
        codigo: "HUECO",
        orden: siguiente.orden,
        mensaje: `Hueco entre S/ ${aSoles(actual.montoMax)} y S/ ${aSoles(siguiente.montoMin)}: esos carritos se quedarían sin tarifa.`,
      });
    }
  }

  const primero = ordenados[0];
  if (primero.montoMin > 0) {
    problemas.push({
      nivel: "aviso",
      codigo: "HUECO",
      orden: primero.orden,
      mensaje: `El primer rango empieza en S/ ${aSoles(primero.montoMin)}. Los carritos menores no tendrán tarifa.`,
    });
  }
  const ultimo = ordenados[ordenados.length - 1];
  if (ultimo.montoMax !== null && ultimo.montoMax !== undefined) {
    problemas.push({
      nivel: "aviso",
      codigo: "SIN_TECHO",
      orden: ultimo.orden,
      mensaje: `Ningún rango cubre importes mayores a S/ ${aSoles(ultimo.montoMax)}. Deja el último "sin límite".`,
    });
  }

  return problemas;
}
