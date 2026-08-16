import { describe, expect, it } from "vitest";
import {
  buscar,
  listarDepartamentos,
  listarDistritos,
  listarProvincias,
  obtenerDistrito,
  resolver,
  totales,
} from "../app/lib/ubigeo/catalogo";

describe("catálogo UBIGEO", () => {
  it("carga el país completo", () => {
    const t = totales();
    expect(t.departamentos).toBe(25);
    expect(t.provincias).toBeGreaterThan(190);
    expect(t.distritos).toBeGreaterThan(1800);
  });

  it("el selector es dependiente: Lima → 10 provincias → 43 distritos", () => {
    const lima = listarDepartamentos().find((d) => d.nombre === "Lima")!;
    expect(lima.codigo).toBe("15");
    const provincias = listarProvincias("15");
    expect(provincias.length).toBe(10);
    const distritosLima = listarDistritos("1501");
    expect(distritosLima.length).toBe(43);
    expect(distritosLima.some((d) => d.distrito === "Magdalena del Mar")).toBe(true);
  });

  it("no mezcla distritos de otras provincias", () => {
    expect(listarDistritos("1501").every((d) => d.codProv === "1501")).toBe(true);
  });

  it("obtiene un distrito por UBIGEO conservando ceros a la izquierda", () => {
    expect(obtenerDistrito("150120")?.distrito).toBe("Magdalena del Mar");
    expect(obtenerDistrito("010101")?.codDep).toBe("01");
  });
});

describe("resolución de distritos", () => {
  it("resuelve por UBIGEO", () => {
    const r = resolver({ ubigeo: "150120" })!;
    expect(r.distrito).toBe("Magdalena del Mar");
    expect(r.metodo).toBe("UBIGEO");
  });

  it("resuelve por la terna completa ignorando tildes y mayúsculas", () => {
    const r = resolver({ departamento: "LIMA", provincia: "lima", distrito: "magdalena del mar" })!;
    expect(r.ubigeo).toBe("150120");
    expect(r.metodo).toBe("TERNA");
  });

  it("aplica alias de geocodificación (Cercado de Lima → Lima)", () => {
    const r = resolver({ departamento: "Lima", provincia: "Lima", distrito: "Cercado de Lima" })!;
    expect(r.distrito).toBe("Lima");
  });

  it("resuelve Callao como provincia constitucional", () => {
    const r = resolver({ departamento: "Provincia Constitucional del Callao", provincia: "Callao", distrito: "Bellavista" })!;
    expect(r.codDep).toBe("07");
  });

  it("tolera erratas leves", () => {
    const r = resolver({ departamento: "Lima", provincia: "Lima", distrito: "Magdalena del Mr" })!;
    expect(r.distrito).toBe("Magdalena del Mar");
    expect(r.metodo).toBe("APROXIMADO");
    expect(r.confianza).toBeLessThan(1);
  });

  it("devuelve null ante un distrito homónimo sin contexto suficiente", () => {
    // "San Juan" existe en varios departamentos: no se debe adivinar.
    const r = resolver({ distrito: "San Jose" });
    expect(r).toBeNull();
  });

  it("resuelve un homónimo cuando se acota el departamento", () => {
    const r = resolver({ departamento: "Lima", distrito: "San Isidro" });
    expect(r?.ubigeo).toBe("150131");
  });

  it("devuelve null si el distrito no existe", () => {
    expect(resolver({ departamento: "Lima", provincia: "Lima", distrito: "Ciudad Inventada" })).toBeNull();
  });

  it("un UBIGEO inválido no rompe nada", () => {
    expect(resolver({ ubigeo: "999999" })).toBeNull();
    expect(resolver({ ubigeo: "abc" })).toBeNull();
  });
});

describe("autocompletado", () => {
  it("prioriza las coincidencias que empiezan por el texto", () => {
    const r = buscar("magdal");
    expect(r[0].distrito.toLowerCase().startsWith("magdal")).toBe(true);
  });

  it("no responde a textos demasiado cortos", () => {
    expect(buscar("m")).toEqual([]);
  });
});

describe("resolución desde los campos del checkout de Shopify", () => {
  /**
   * Reproduce lo que llega al CarrierService con la correspondencia actual:
   *   Región         → departamento
   *   Provincia      → provincia
   *   Código postal  → distrito
   */
  it("encuentra el distrito con la terna del checkout", () => {
    const r = resolver({ departamento: "Huanuco", provincia: "Ambo", distrito: "Huacar" })!;
    expect(r.ubigeo).toBe("100205");
    expect(r.provincia).toBe("Ambo");
  });

  it("el ejemplo de Lima sigue funcionando", () => {
    const r = resolver({ departamento: "Lima", provincia: "Lima", distrito: "Magdalena del Mar" })!;
    expect(r.ubigeo).toBe("150120");
  });

  it("da igual que el comprador escriba tildes de más o de menos", () => {
    // El catálogo del INEI guarda "Huanuco" sin tilde; el comprador escribirá
    // "Huánuco". La normalización tiene que hacer que ambos funcionen.
    expect(resolver({ departamento: "Huánuco", provincia: "Ambo", distrito: "Huácar" })?.ubigeo).toBe("100205");
    expect(resolver({ departamento: "Huanuco", provincia: "Ambo", distrito: "Huacar" })?.ubigeo).toBe("100205");
  });
});
