import { describe, expect, it } from "vitest";
import { fechaIsoValida } from "../app/lib/fecha";

describe("fecha de cumpleaños", () => {
  it("acepta una fecha real", () => {
    expect(fechaIsoValida("1990-05-17")).toBe(true);
    expect(fechaIsoValida("2024-02-29")).toBe(true); // año bisiesto
  });

  it("rechaza un día que no existe en ese mes", () => {
    // Tiene la forma correcta, así que la expresión regular sola la dejaba
    // pasar; Shopify la rechazaba después al guardar el metacampo.
    expect(fechaIsoValida("2025-02-31")).toBe(false);
    expect(fechaIsoValida("2025-04-31")).toBe(false);
    expect(fechaIsoValida("2025-02-29")).toBe(false); // 2025 no es bisiesto
  });

  it("rechaza meses y días fuera de rango", () => {
    expect(fechaIsoValida("2025-13-01")).toBe(false);
    expect(fechaIsoValida("2025-00-10")).toBe(false);
    expect(fechaIsoValida("2025-01-00")).toBe(false);
  });

  it("rechaza lo que no tiene el formato", () => {
    expect(fechaIsoValida("17/05/1990")).toBe(false);
    expect(fechaIsoValida("")).toBe(false);
    expect(fechaIsoValida(null)).toBe(false);
  });
});
