/**
 * Transformación y validación de una fila del CSV a una tarifa lista para guardar.
 * Puro: recibe el resolvedor de UBIGEO como parámetro, así se prueba sin base de datos.
 */
import { aCentimos, validarRangos } from "../rates/motor";
import type { RangoTarifa, TipoMetodo } from "../rates/tipos";
import { contarRangos, type MapeoColumnas } from "./mapeo";

export interface UbigeoResuelto {
  ubigeo: string;
  codDep: string;
  codProv: string;
  departamento: string;
  provincia: string;
  distrito: string;
}

/** Busca un distrito por UBIGEO o por la terna de nombres. Devuelve null si no existe. */
export type ResolverUbigeo = (entrada: {
  ubigeo?: string;
  departamento?: string;
  provincia?: string;
  distrito?: string;
}) => UbigeoResuelto | null;

/**
 * Cómo se reparten las tres columnas de costo del CSV.
 *  - METODOS      : costo → Estándar, costo2 → Express, costo3 → alternativa del Estándar.
 *  - ALTERNATIVOS : las tres columnas son variantes de precio del Envío Estándar.
 */
export type ModoCostos = "METODOS" | "ALTERNATIVOS";

export interface OpcionesFila {
  mapeo: MapeoColumnas;
  resolver: ResolverUbigeo;
  modoCostos?: ModoCostos;
  /** Trata los rangos vacíos (sin costo) como "no configurado" en vez de como error. */
  ignorarRangosVacios?: boolean;
}

export interface MetodoImportado {
  tipo: TipoMetodo;
  activo: boolean;
  etiqueta: string | null;
  descripcion: string | null;
  rangos: RangoTarifa[];
}

export interface FilaTarifa {
  ubigeo: string;
  codDep: string;
  codProv: string;
  nombreDep: string;
  nombreProv: string;
  nombreDist: string;
  codShopify: string | null;
  activo: boolean;
  metodos: MetodoImportado[];
  extras: Record<string, string>;
}

export interface ErrorFila {
  fila: number;
  columna?: string;
  codigo: "UBIGEO_NO_ENCONTRADO" | "SIN_RANGOS" | "IMPORTE_INVALIDO" | "RANGOS_INCONSISTENTES" | "DUPLICADO";
  mensaje: string;
  valor?: string;
}

export interface ResultadoFila {
  ok: boolean;
  tarifa?: FilaTarifa;
  errores: ErrorFila[];
  avisos: ErrorFila[];
}

const VERDADEROS = new Set(["1", "true", "si", "sí", "yes", "y", "activo", "habilitado", "on"]);
const FALSOS = new Set(["0", "false", "no", "n", "inactivo", "deshabilitado", "off"]);

function esVacio(v: string | undefined | null): boolean {
  return v === undefined || v === null || String(v).trim() === "";
}

/**
 * Convierte un texto de importe a céntimos. Acepta "S/ 1,234.50", "1.234,50",
 * "15", "gratis", "free", "0". Devuelve null si no se puede interpretar.
 */
export function importeACentimos(texto: string | undefined | null): number | null {
  if (esVacio(texto)) return null;
  const t = String(texto).trim().toLowerCase();
  if (["gratis", "free", "libre", "sin costo", "0.00", "0"].includes(t)) return 0;

  let limpio = t.replace(/s\/\.?/g, "").replace(/[^\d.,-]/g, "").trim();
  if (limpio === "") return null;

  const tieneComa = limpio.includes(",");
  const tienePunto = limpio.includes(".");
  if (tieneComa && tienePunto) {
    // El último separador que aparece es el decimal.
    limpio = limpio.lastIndexOf(",") > limpio.lastIndexOf(".")
      ? limpio.replace(/\./g, "").replace(",", ".")
      : limpio.replace(/,/g, "");
  } else if (tieneComa) {
    // "1,50" es decimal; "1,500" con 3 dígitos es separador de miles.
    const partes = limpio.split(",");
    limpio = partes[partes.length - 1].length === 3 && partes.length === 2
      ? limpio.replace(",", "")
      : limpio.replace(",", ".");
  }

  const n = Number(limpio);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** "sin límite", "-", "999999" o vacío significan "sin techo". */
export function esSinLimite(texto: string | undefined | null): boolean {
  if (esVacio(texto)) return true;
  const t = String(texto).trim().toLowerCase();
  return ["-", "*", "sin limite", "sin límite", "ilimitado", "infinito", "a mas", "a más", "+"].includes(t);
}

function leerBooleano(v: string | undefined, porDefecto = true): boolean {
  if (esVacio(v)) return porDefecto;
  const t = String(v).trim().toLowerCase();
  if (VERDADEROS.has(t)) return true;
  if (FALSOS.has(t)) return false;
  return porDefecto;
}

/** Invierte el mapeo: campo interno -> valor de la fila. */
function valoresPorCampo(fila: Record<string, string>, mapeo: MapeoColumnas) {
  const porCampo = new Map<string, string>();
  const extras: Record<string, string> = {};
  for (const [columna, campo] of Object.entries(mapeo)) {
    const valor = fila[columna];
    if (campo === "ignorar") continue;
    if (campo === "extra") {
      if (!esVacio(valor)) extras[columna] = String(valor).trim();
      continue;
    }
    if (!esVacio(valor)) porCampo.set(campo, String(valor).trim());
  }
  return { porCampo, extras };
}

export function transformarFila(
  fila: Record<string, string>,
  numeroFila: number,
  opciones: OpcionesFila,
): ResultadoFila {
  const { mapeo, resolver, modoCostos = "METODOS" } = opciones;
  const errores: ErrorFila[] = [];
  const avisos: ErrorFila[] = [];
  const { porCampo, extras } = valoresPorCampo(fila, mapeo);

  // --- 1. Identificar el distrito -----------------------------------------
  const ubigeoTexto = porCampo.get("ubigeo");
  const resuelto = resolver({
    ubigeo: ubigeoTexto,
    departamento: porCampo.get("departamento"),
    provincia: porCampo.get("provincia"),
    distrito: porCampo.get("distrito"),
  });

  if (!resuelto) {
    errores.push({
      fila: numeroFila,
      codigo: "UBIGEO_NO_ENCONTRADO",
      mensaje: `No se encontró el distrito "${porCampo.get("distrito") ?? ""}" (${porCampo.get("provincia") ?? ""}, ${porCampo.get("departamento") ?? ""}) ni el UBIGEO "${ubigeoTexto ?? ""}".`,
      valor: ubigeoTexto ?? porCampo.get("distrito"),
    });
    return { ok: false, errores, avisos };
  }

  // --- 2. Leer la escalera de rangos --------------------------------------
  const total = contarRangos(mapeo);
  const rangosEstandar: RangoTarifa[] = [];
  const rangosExpress: RangoTarifa[] = [];

  for (let i = 1; i <= total; i++) {
    const minTexto = porCampo.get(`rango${i}_min`);
    const maxTexto = porCampo.get(`rango${i}_max`);
    const costoTexto = porCampo.get(`rango${i}_costo`);
    const costo2Texto = porCampo.get(`rango${i}_costo2`);
    const costo3Texto = porCampo.get(`rango${i}_costo3`);

    const todoVacio = [minTexto, maxTexto, costoTexto, costo2Texto, costo3Texto].every(esVacio);
    if (todoVacio) continue; // rango no usado en esta fila: es normal

    const min = importeACentimos(minTexto) ?? 0;
    const max = esSinLimite(maxTexto) ? null : importeACentimos(maxTexto);
    const costo = importeACentimos(costoTexto);
    const costo2 = importeACentimos(costo2Texto);
    const costo3 = importeACentimos(costo3Texto);

    if (!esVacio(costoTexto) && costo === null) {
      errores.push({
        fila: numeroFila,
        columna: `rango${i}_costo`,
        codigo: "IMPORTE_INVALIDO",
        mensaje: `El costo del rango ${i} ("${costoTexto}") no es un importe válido.`,
        valor: costoTexto,
      });
      continue;
    }

    const esGratis = (costoTexto ?? "").trim().toLowerCase() === "gratis" || costo === 0;

    if (costo !== null) {
      rangosEstandar.push({
        orden: i,
        montoMin: min,
        montoMax: max,
        costo,
        costoAlt1: modoCostos === "ALTERNATIVOS" ? costo2 : costo3,
        costoAlt2: modoCostos === "ALTERNATIVOS" ? costo3 : null,
        gratis: esGratis,
      });
    }

    if (modoCostos === "METODOS" && costo2 !== null) {
      rangosExpress.push({
        orden: i,
        montoMin: min,
        montoMax: max,
        costo: costo2,
        gratis: costo2 === 0,
      });
    }
  }

  if (rangosEstandar.length === 0 && rangosExpress.length === 0) {
    if (opciones.ignorarRangosVacios) {
      avisos.push({
        fila: numeroFila,
        codigo: "SIN_RANGOS",
        mensaje: `${resuelto.distrito}: la fila no trae ningún rango con costo. Se creará desactivada.`,
      });
    } else {
      errores.push({
        fila: numeroFila,
        codigo: "SIN_RANGOS",
        mensaje: `${resuelto.distrito}: la fila no trae ningún rango con costo.`,
      });
      return { ok: false, errores, avisos };
    }
  }

  // --- 3. Avisos de consistencia (no bloquean la importación) -------------
  for (const problema of validarRangos(rangosEstandar)) {
    if (problema.codigo === "SIN_RANGOS") continue;
    avisos.push({
      fila: numeroFila,
      codigo: "RANGOS_INCONSISTENTES",
      mensaje: `${resuelto.distrito}: ${problema.mensaje}`,
    });
  }

  // --- 4. Etiquetas -------------------------------------------------------
  const metodos: MetodoImportado[] = [
    {
      tipo: "ESTANDAR",
      activo: rangosEstandar.length > 0,
      etiqueta: porCampo.get("texto") ?? null,
      descripcion: porCampo.get("texto_description") ?? null,
      rangos: rangosEstandar,
    },
  ];

  if (rangosExpress.length > 0) {
    metodos.push({
      tipo: "EXPRESS",
      activo: true,
      etiqueta: porCampo.get("texto2") ?? null,
      descripcion: porCampo.get("texto2_description") ?? null,
      rangos: rangosExpress,
    });
  }

  const etiquetaRecojo = porCampo.get("texto_collect");
  if (etiquetaRecojo) {
    metodos.push({
      tipo: "RECOJO",
      activo: true,
      etiqueta: etiquetaRecojo,
      descripcion: porCampo.get("texto_collect_description") ?? null,
      rangos: [{ orden: 1, montoMin: 0, montoMax: null, costo: 0, gratis: true }],
    });
  }

  // texto3 no tiene método propio en el modelo: se conserva en extras para no perderlo.
  if (porCampo.get("texto3")) extras["texto3"] = porCampo.get("texto3")!;
  if (porCampo.get("texto3_description")) extras["texto3_description"] = porCampo.get("texto3_description")!;
  if (porCampo.get("id")) extras["id_origen"] = porCampo.get("id")!;
  if (porCampo.get("storename")) extras["storename"] = porCampo.get("storename")!;

  return {
    ok: true,
    errores,
    avisos,
    tarifa: {
      ubigeo: resuelto.ubigeo,
      codDep: resuelto.codDep,
      codProv: resuelto.codProv,
      nombreDep: resuelto.departamento,
      nombreProv: resuelto.provincia,
      nombreDist: resuelto.distrito,
      codShopify: porCampo.get("codshopify") ?? null,
      activo: leerBooleano(porCampo.get("activo"), true),
      metodos,
      extras,
    },
  };
}
