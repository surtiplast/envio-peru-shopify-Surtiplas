/**
 * Detección y mapeo de columnas del CSV de tarifas.
 *
 * El archivo del comerciante tiene la forma:
 *   id, storename, codshopify, departamento, provincia, distrito, ubigeo,
 *   rango1_min, rango1_max, rango1_costo, rango1_costo2, rango1_costo3,
 *   rango2_min, ...,
 *   texto, texto_description, texto2, texto2_description,
 *   texto3, texto3_description, texto_collect, texto_collect_description
 *
 * Nada se descarta: toda columna que no reconocemos se guarda tal cual en
 * Tarifa.extras, de modo que exportar → importar sea una ida y vuelta sin
 * pérdida de información.
 */

export type CampoInterno =
  | "id"
  | "storename"
  | "codshopify"
  | "departamento"
  | "provincia"
  | "distrito"
  | "ubigeo"
  | "activo"
  | "texto"
  | "texto_description"
  | "texto2"
  | "texto2_description"
  | "texto3"
  | "texto3_description"
  | "texto_collect"
  | "texto_collect_description"
  | `rango${number}_min`
  | `rango${number}_max`
  | `rango${number}_costo`
  | `rango${number}_costo2`
  | `rango${number}_costo3`
  | "ignorar"
  | "extra";

export interface ColumnaDetectada {
  /** Encabezado tal cual viene en el archivo. */
  original: string;
  /** Campo interno propuesto por la detección automática. */
  campo: CampoInterno;
  /** 0..1 — qué tan segura es la detección. Debajo de 0.6 pedimos confirmación. */
  confianza: number;
  /** Muestra de valores para la vista previa. */
  ejemplos: string[];
}

export type MapeoColumnas = Record<string, CampoInterno>;

/** Normaliza un encabezado: minúsculas, sin tildes, separadores unificados a "_". */
export function normalizarEncabezado(h: string): string {
  return String(h ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s.\-/]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Sinónimos aceptados para cada campo simple. */
const SINONIMOS: Record<string, CampoInterno> = {
  id: "id",
  codigo: "id",
  storename: "storename",
  store: "storename",
  tienda: "storename",
  nombre_tienda: "storename",
  shop: "storename",
  codshopify: "codshopify",
  cod_shopify: "codshopify",
  codigo_shopify: "codshopify",
  shopify_code: "codshopify",
  departamento: "departamento",
  depto: "departamento",
  dpto: "departamento",
  region: "departamento",
  department: "departamento",
  provincia: "provincia",
  prov: "provincia",
  province: "provincia",
  distrito: "distrito",
  dist: "distrito",
  district: "distrito",
  ciudad: "distrito",
  ubigeo: "ubigeo",
  cod_ubigeo: "ubigeo",
  codigo_ubigeo: "ubigeo",
  ubigeo_inei: "ubigeo",
  activo: "activo",
  estado: "activo",
  status: "activo",
  habilitado: "activo",
  texto: "texto",
  texto_description: "texto_description",
  texto_descripcion: "texto_description",
  texto2: "texto2",
  texto2_description: "texto2_description",
  texto2_descripcion: "texto2_description",
  texto3: "texto3",
  texto3_description: "texto3_description",
  texto3_descripcion: "texto3_description",
  texto_collect: "texto_collect",
  texto_recojo: "texto_collect",
  texto_collect_description: "texto_collect_description",
  texto_collect_descripcion: "texto_collect_description",
  texto_recojo_descripcion: "texto_collect_description",
};

/**
 * Reconoce columnas de rango en cualquiera de las formas habituales:
 *   rango1_min · rango_1_min · range1min · r1_min · rango1_monto_min
 */
const RE_RANGO = /^r(?:ango|ange)?_?(\d+)_?(min|max|minimo|maximo|desde|hasta|costo|costo2|costo3|cost|precio|tarifa|monto_min|monto_max)$/;

function campoDeRango(normalizado: string): CampoInterno | null {
  const m = normalizado.match(RE_RANGO);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n < 1 || n > 50) return null;
  const sufijo = m[2];
  if (["min", "minimo", "desde", "monto_min"].includes(sufijo)) return `rango${n}_min` as CampoInterno;
  if (["max", "maximo", "hasta", "monto_max"].includes(sufijo)) return `rango${n}_max` as CampoInterno;
  if (["costo", "cost", "precio", "tarifa"].includes(sufijo)) return `rango${n}_costo` as CampoInterno;
  if (sufijo === "costo2") return `rango${n}_costo2` as CampoInterno;
  if (sufijo === "costo3") return `rango${n}_costo3` as CampoInterno;
  return null;
}

/**
 * Propone un mapeo a partir de los encabezados y unas filas de muestra.
 * No decide nada por su cuenta: el comerciante confirma en el paso 02.
 */
export function detectarColumnas(
  encabezados: string[],
  filasMuestra: Record<string, string>[] = [],
): ColumnaDetectada[] {
  return encabezados.map((original) => {
    const n = normalizarEncabezado(original);
    const ejemplos = filasMuestra
      .map((f) => (f[original] ?? "").toString().trim())
      .filter((v) => v !== "")
      .slice(0, 3);

    const exacto = SINONIMOS[n];
    if (exacto) return { original, campo: exacto, confianza: 1, ejemplos };

    const rango = campoDeRango(n);
    if (rango) return { original, campo: rango, confianza: 0.95, ejemplos };

    // Coincidencia parcial: "nombre_del_distrito" -> distrito
    for (const [clave, campo] of Object.entries(SINONIMOS)) {
      if (clave.length >= 5 && n.includes(clave)) {
        return { original, campo, confianza: 0.6, ejemplos };
      }
    }

    // No reconocida: se conserva íntegra en `extras`.
    return { original, campo: "extra", confianza: 0, ejemplos };
  });
}

export function mapeoPorDefecto(columnas: ColumnaDetectada[]): MapeoColumnas {
  return Object.fromEntries(columnas.map((c) => [c.original, c.campo]));
}

/** Cuántos rangos distintos contempla un mapeo. */
export function contarRangos(mapeo: MapeoColumnas): number {
  let max = 0;
  for (const campo of Object.values(mapeo)) {
    const m = /^rango(\d+)_/.exec(campo);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

/** Campos sin los cuales no se puede importar. */
export const CAMPOS_REQUERIDOS: CampoInterno[] = ["distrito"];

export function validarMapeo(mapeo: MapeoColumnas): string[] {
  const usados = new Set(Object.values(mapeo));
  const problemas: string[] = [];

  if (!usados.has("ubigeo") && !(usados.has("distrito") && usados.has("provincia") && usados.has("departamento"))) {
    problemas.push(
      "Necesito la columna UBIGEO, o bien las tres columnas Departamento, Provincia y Distrito para poder identificar cada fila.",
    );
  }
  if (contarRangos(mapeo) === 0) {
    problemas.push("No se reconoció ninguna columna de rango (rango1_min, rango1_costo, ...).");
  }

  // Un mismo campo no puede venir de dos columnas distintas.
  const cuenta = new Map<string, number>();
  for (const campo of Object.values(mapeo)) {
    if (campo === "extra" || campo === "ignorar") continue;
    cuenta.set(campo, (cuenta.get(campo) ?? 0) + 1);
  }
  for (const [campo, n] of cuenta) {
    if (n > 1) problemas.push(`El campo "${campo}" está asignado a ${n} columnas. Debe ser una sola.`);
  }

  return problemas;
}
