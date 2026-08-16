import { describe, expect, it } from "vitest";
import {
  contarRangos,
  detectarColumnas,
  mapeoPorDefecto,
  normalizarEncabezado,
  validarMapeo,
} from "../app/lib/csv/mapeo";
import { esSinLimite, importeACentimos, transformarFila } from "../app/lib/csv/filas";
import { resolver as resolverUbigeo } from "../app/lib/ubigeo/catalogo";

const ENCABEZADOS = [
  "id", "storename", "codshopify", "departamento", "provincia", "distrito", "ubigeo",
  "rango1_min", "rango1_max", "rango1_costo", "rango1_costo2", "rango1_costo3",
  "rango2_min", "rango2_max", "rango2_costo", "rango2_costo2", "rango2_costo3",
  "rango3_min", "rango3_max", "rango3_costo", "rango3_costo2", "rango3_costo3",
  "rango4_min", "rango4_max", "rango4_costo", "rango4_costo2", "rango4_costo3",
  "texto", "texto_description", "texto2", "texto2_description",
  "texto3", "texto3_description", "texto_collect", "texto_collect_description",
];

const FILA: Record<string, string> = {
  id: "1",
  storename: "Surtiplast",
  codshopify: "SP-150120",
  departamento: "Lima",
  provincia: "Lima",
  distrito: "Magdalena del Mar",
  ubigeo: "150120",
  rango1_min: "0", rango1_max: "99.99", rango1_costo: "15", rango1_costo2: "20", rango1_costo3: "12",
  rango2_min: "100", rango2_max: "199.99", rango2_costo: "10", rango2_costo2: "18", rango2_costo3: "8",
  rango3_min: "200", rango3_max: "299.99", rango3_costo: "5", rango3_costo2: "15", rango3_costo3: "4",
  rango4_min: "300", rango4_max: "", rango4_costo: "0", rango4_costo2: "12", rango4_costo3: "0",
  texto: "Envío estándar", texto_description: "Entrega en 2 a 5 días hábiles",
  texto2: "Envío express", texto2_description: "Entrega en 24 horas",
  texto3: "Envío programado", texto3_description: "Elige el día",
  texto_collect: "Recojo en tienda", texto_collect_description: "Sin costo",
};

const opciones = { mapeo: mapeoPorDefecto(detectarColumnas(ENCABEZADOS)), resolver: resolverUbigeo };

describe("normalización de encabezados", () => {
  it("unifica separadores y tildes", () => {
    expect(normalizarEncabezado("Departamento")).toBe("departamento");
    expect(normalizarEncabezado(" Rango 1 - Min ")).toBe("rango_1_min");
    expect(normalizarEncabezado("Código Shopify")).toBe("codigo_shopify");
  });
});

describe("detección de columnas", () => {
  it("reconoce todas las columnas del archivo del comerciante", () => {
    const cols = detectarColumnas(ENCABEZADOS, [FILA]);
    const sinReconocer = cols.filter((c) => c.campo === "extra");
    expect(sinReconocer).toEqual([]);
    expect(cols.every((c) => c.confianza >= 0.9)).toBe(true);
  });

  it("cuenta los rangos correctamente", () => {
    expect(contarRangos(mapeoPorDefecto(detectarColumnas(ENCABEZADOS)))).toBe(4);
  });

  it("acepta variantes de nombre de columna", () => {
    const cols = detectarColumnas(["Dpto", "Prov", "District", "Rango 1 Desde", "rango1 hasta", "r1_costo"]);
    expect(cols.map((c) => c.campo)).toEqual([
      "departamento", "provincia", "distrito", "rango1_min", "rango1_max", "rango1_costo",
    ]);
  });

  it("conserva como extra lo que no reconoce", () => {
    const cols = detectarColumnas(["distrito", "peso_maximo_kg", "rango1_costo"]);
    expect(cols[1].campo).toBe("extra");
  });

  it("adjunta ejemplos para la vista previa", () => {
    const cols = detectarColumnas(["distrito"], [FILA]);
    expect(cols[0].ejemplos).toEqual(["Magdalena del Mar"]);
  });
});

describe("validación del mapeo", () => {
  it("acepta un mapeo completo", () => {
    expect(validarMapeo(opciones.mapeo)).toEqual([]);
  });

  it("exige ubigeo o la terna geográfica", () => {
    const problemas = validarMapeo({ rango1_costo: "rango1_costo", a: "distrito" });
    expect(problemas.some((p) => p.includes("UBIGEO"))).toBe(true);
  });

  it("exige al menos un rango", () => {
    const problemas = validarMapeo({ a: "ubigeo" });
    expect(problemas.some((p) => p.includes("rango"))).toBe(true);
  });

  it("detecta un campo asignado dos veces", () => {
    const problemas = validarMapeo({ ubigeo: "ubigeo", cod: "ubigeo", r: "rango1_costo" });
    expect(problemas.some((p) => p.includes("dos columnas") || p.includes("2 columnas"))).toBe(true);
  });
});

describe("lectura de importes", () => {
  it("acepta los formatos que aparecen en archivos reales", () => {
    expect(importeACentimos("15")).toBe(1500);
    expect(importeACentimos("15.50")).toBe(1550);
    expect(importeACentimos("15,50")).toBe(1550);
    expect(importeACentimos("S/ 1,234.50")).toBe(123450);
    expect(importeACentimos("1.234,50")).toBe(123450);
    expect(importeACentimos("GRATIS")).toBe(0);
    expect(importeACentimos("")).toBeNull();
    expect(importeACentimos("hola")).toBeNull();
  });

  it("reconoce el rango sin techo", () => {
    expect(esSinLimite("")).toBe(true);
    expect(esSinLimite("-")).toBe(true);
    expect(esSinLimite("sin límite")).toBe(true);
    expect(esSinLimite("299.99")).toBe(false);
  });
});

describe("transformación de filas", () => {
  it("convierte la fila de ejemplo en una tarifa completa", () => {
    const r = transformarFila(FILA, 2, opciones);
    expect(r.ok).toBe(true);
    const t = r.tarifa!;
    expect(t.ubigeo).toBe("150120");
    expect(t.nombreDist).toBe("Magdalena del Mar");
    expect(t.codShopify).toBe("SP-150120");

    const estandar = t.metodos.find((m) => m.tipo === "ESTANDAR")!;
    expect(estandar.rangos).toHaveLength(4);
    expect(estandar.rangos[0]).toMatchObject({ orden: 1, montoMin: 0, montoMax: 9999, costo: 1500 });
    expect(estandar.rangos[3]).toMatchObject({ orden: 4, montoMin: 30000, montoMax: null, costo: 0, gratis: true });
    expect(estandar.etiqueta).toBe("Envío estándar");

    const express = t.metodos.find((m) => m.tipo === "EXPRESS")!;
    expect(express.rangos[0].costo).toBe(2000);

    const recojo = t.metodos.find((m) => m.tipo === "RECOJO")!;
    expect(recojo.rangos[0].gratis).toBe(true);
  });

  it("no pierde información: texto3 y el id de origen quedan en extras", () => {
    const t = transformarFila(FILA, 2, opciones).tarifa!;
    expect(t.extras.texto3).toBe("Envío programado");
    expect(t.extras.id_origen).toBe("1");
    expect(t.extras.storename).toBe("Surtiplast");
  });

  it("en modo ALTERNATIVOS las tres columnas son variantes del estándar", () => {
    const t = transformarFila(FILA, 2, { ...opciones, modoCostos: "ALTERNATIVOS" }).tarifa!;
    expect(t.metodos.find((m) => m.tipo === "EXPRESS")).toBeUndefined();
    const estandar = t.metodos.find((m) => m.tipo === "ESTANDAR")!;
    expect(estandar.rangos[0]).toMatchObject({ costo: 1500, costoAlt1: 2000, costoAlt2: 1200 });
  });

  it("reporta el distrito inexistente sin detener el archivo", () => {
    const r = transformarFila({ ...FILA, ubigeo: "", distrito: "Distrito Fantasma" }, 7, opciones);
    expect(r.ok).toBe(false);
    expect(r.errores[0].codigo).toBe("UBIGEO_NO_ENCONTRADO");
    expect(r.errores[0].fila).toBe(7);
  });

  it("marca importe inválido en la columna exacta", () => {
    const r = transformarFila({ ...FILA, rango2_costo: "diez soles" }, 3, opciones);
    expect(r.errores.some((e) => e.codigo === "IMPORTE_INVALIDO" && e.columna === "rango2_costo")).toBe(true);
  });

  it("una fila sin ningún rango es un error", () => {
    const vacia: Record<string, string> = { ...FILA };
    for (const k of Object.keys(vacia)) if (k.startsWith("rango")) vacia[k] = "";
    expect(transformarFila(vacia, 4, opciones).ok).toBe(false);
  });

  it("con ignorarRangosVacios la fila pasa como aviso", () => {
    const vacia: Record<string, string> = { ...FILA };
    for (const k of Object.keys(vacia)) if (k.startsWith("rango")) vacia[k] = "";
    const r = transformarFila(vacia, 4, { ...opciones, ignorarRangosVacios: true });
    expect(r.ok).toBe(true);
    expect(r.avisos.some((a) => a.codigo === "SIN_RANGOS")).toBe(true);
  });

  it("avisa de huecos en la escalera sin bloquear", () => {
    const conHueco = { ...FILA, rango2_min: "150", rango2_max: "199.99" };
    const r = transformarFila(conHueco, 5, opciones);
    expect(r.ok).toBe(true);
    expect(r.avisos.some((a) => a.codigo === "RANGOS_INCONSISTENTES")).toBe(true);
  });

  it("respeta la columna activo", () => {
    expect(transformarFila({ ...FILA, activo: "no" }, 2, {
      ...opciones,
      mapeo: { ...opciones.mapeo, activo: "activo" },
    }).tarifa!.activo).toBe(false);
  });
});
