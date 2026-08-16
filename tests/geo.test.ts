import { describe, expect, it } from "vitest";
import { normalizar } from "../app/lib/geo/index.server";
import type { DireccionGeo } from "../app/lib/geo/proveedor";

const base: DireccionGeo = {
  direccionCompleta: "Jr. Grau 780, Magdalena del Mar, Lima, Perú",
  latitud: -12.0964,
  longitud: -77.0728,
};

describe("normalización de una dirección geocodificada", () => {
  it("resuelve cuando el distrito viene en el primer campo", () => {
    const r = normalizar({ ...base, departamento: "Lima", provincia: "Lima", distrito: "Magdalena del Mar" });
    expect(r.ubigeo?.distrito).toBe("Magdalena del Mar");
    expect(r.requiereConfirmacion).toBe(false);
  });

  it("prueba los demás candidatos cuando el primero es una urbanización", () => {
    // Caso real de Nominatim: `suburb` trae la urbanización, que no existe en
    // el catálogo del INEI, y el distrito aparece más abajo en `city`.
    const r = normalizar({
      ...base,
      departamento: "Lima",
      provincia: "Lima",
      distrito: "Urbanización Orbea",
      candidatosDistrito: ["Urbanización Orbea", "Magdalena del Mar"],
    });
    expect(r.ubigeo?.distrito).toBe("Magdalena del Mar");
  });

  it("resuelve aunque el departamento venga con otro nombre", () => {
    // "Lima Metropolitana" no es un departamento del INEI. Antes, ese nombre
    // descartaba al distrito correcto y el comprador tenía que elegirlo a mano.
    const r = normalizar({
      ...base,
      departamento: "Lima Metropolitana",
      provincia: null,
      distrito: "Magdalena del Mar",
    });
    expect(r.ubigeo?.distrito).toBe("Magdalena del Mar");
    expect(r.requiereConfirmacion).toBe(false);
  });

  it("pide confirmación si ningún candidato es un distrito", () => {
    // Preferimos un clic más que cobrar el envío equivocado.
    const r = normalizar({
      ...base,
      departamento: "Lima",
      distrito: "Zona industrial",
      candidatosDistrito: ["Zona industrial", "Parque las Leyendas"],
    });
    expect(r.ubigeo).toBeNull();
    expect(r.requiereConfirmacion).toBe(true);
  });

  it("no inventa cuando el nombre es ambiguo en varios departamentos", () => {
    // "San Juan" existe en varios sitios: sin más datos, no se elige uno.
    const r = normalizar({ ...base, departamento: null, provincia: null, distrito: "San Juan" });
    expect(r.requiereConfirmacion).toBe(true);
  });
});
