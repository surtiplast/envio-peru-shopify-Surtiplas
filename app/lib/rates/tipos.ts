/**
 * Tipos del motor de tarifas.
 *
 * Todo el dinero se maneja en CÉNTIMOS (enteros). Nunca en float: 0.1 + 0.2
 * no es 0.3 y en un cálculo de envío eso significa un céntimo de diferencia
 * entre lo que muestra el formulario y lo que cobra el checkout.
 */

export type TipoMetodo = "ESTANDAR" | "EXPRESS" | "RECOJO";

export type PoliticaSinTarifa = "BLOQUEAR" | "COSTO_FIJO";

/** Un rango de subtotal con su costo. Ambos extremos son INCLUSIVOS. */
export interface RangoTarifa {
  orden: number;
  /** Subtotal mínimo del carrito, en céntimos. */
  montoMin: number;
  /** Subtotal máximo, en céntimos. `null` = sin límite superior. */
  montoMax: number | null;
  /** Costo principal, en céntimos. */
  costo: number;
  costoAlt1?: number | null;
  costoAlt2?: number | null;
  /** Si es true se ignora el costo y se cobra 0 mostrando "GRATIS". */
  gratis?: boolean;
}

export interface MetodoTarifa {
  tipo: TipoMetodo;
  activo: boolean;
  etiqueta?: string | null;
  descripcion?: string | null;
  diasMin?: number | null;
  diasMax?: number | null;
  /** Subtotal (céntimos) a partir del cual el envío es gratis pase lo que pase. */
  umbralEnvioGratis?: number | null;
  rangos: RangoTarifa[];
}

export interface TarifaResuelta {
  ubigeo: string;
  departamento: string;
  provincia: string;
  distrito: string;
  activo: boolean;
  metodos: MetodoTarifa[];
}

export interface OpcionesCotizacion {
  /** Subtotal del carrito en céntimos, ya con descuentos aplicados. */
  subtotal: number;
  /** Qué columna de costo del CSV usar: 0 = costo, 1 = costo2, 2 = costo3. */
  columnaCosto?: 0 | 1 | 2;
  /** Solo cotizar estos métodos. Por defecto, todos los activos. */
  soloMetodos?: TipoMetodo[];
  /** Etiquetas por defecto cuando la tarifa no define una. */
  etiquetasPorDefecto?: Partial<Record<TipoMetodo, { etiqueta: string; descripcion: string }>>;
  politicaSinTarifa?: PoliticaSinTarifa;
  /** Costo fijo (céntimos) cuando la política es COSTO_FIJO. */
  costoPorDefecto?: number | null;
}

export type MotivoCotizacion =
  | "RANGO" // se encontró un rango que cubre el subtotal
  | "RANGO_GRATIS" // el rango está marcado como gratis
  | "UMBRAL_GRATIS" // superó el umbral de envío gratis del método
  | "COSTO_FIJO" // no había rango y la política es COSTO_FIJO
  | "SIN_COBERTURA"; // no había rango y la política es BLOQUEAR

export interface Cotizacion {
  tipo: TipoMetodo;
  etiqueta: string;
  descripcion: string;
  /** Costo final en céntimos. */
  costo: number;
  gratis: boolean;
  disponible: boolean;
  motivo: MotivoCotizacion;
  /** Rango aplicado, para que el "Probador de tarifas" explique la decisión. */
  rango?: { orden: number; montoMin: number; montoMax: number | null };
  diasMin?: number | null;
  diasMax?: number | null;
}

/** Problemas detectados al validar la escalera de rangos de un método. */
export interface ProblemaRangos {
  nivel: "error" | "aviso";
  codigo: "SOLAPADO" | "HUECO" | "INVERTIDO" | "NEGATIVO" | "SIN_RANGOS" | "SIN_TECHO";
  mensaje: string;
  orden?: number;
}
