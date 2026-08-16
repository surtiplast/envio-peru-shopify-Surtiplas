import { describe, expect, it } from "vitest";
import { componerAddress2, separarAddress2 } from "../app/lib/ubigeo/direccion";

/**
 * Shopify guarda el distrito peruano DENTRO de address2, separado por un
 * carácter invisible. Estas pruebas fijan ese contrato: si el paquete de
 * Shopify cambia el formato, aquí nos enteramos.
 */
describe("distrito dentro de address2", () => {
  it("compone referencia y distrito", () => {
    const a2 = componerAddress2("Dpto. 401", "Magdalena del Mar");
    expect(a2).toContain("Dpto. 401");
    expect(a2).toContain("Magdalena del Mar");
  });

  it("hace el viaje de ida y vuelta sin perder nada", () => {
    const a2 = componerAddress2("Frente al parque", "Miraflores");
    expect(separarAddress2(a2)).toEqual({
      referencia: "Frente al parque",
      distrito: "Miraflores",
    });
  });

  it("funciona sin referencia", () => {
    const a2 = componerAddress2(null, "Huacar");
    expect(separarAddress2(a2).distrito).toBe("Huacar");
    expect(separarAddress2(a2).referencia).toBeNull();
  });

  it("lleva la marca invisible que Shopify usa para separar", () => {
    // U+2060 (word joiner). Sin ella el checkout no reconoce el distrito.
    expect(componerAddress2("Ref", "Surco")).toContain("⁠");
  });

  it("un address2 escrito a mano no inventa distrito", () => {
    // Quien escribe directo en el checkout no pone la marca: todo es referencia.
    expect(separarAddress2("Dpto 401, timbre 2")).toEqual({
      referencia: "Dpto 401, timbre 2",
      distrito: null,
    });
  });

  it("tolera vacío y nulo", () => {
    expect(separarAddress2(null)).toEqual({ referencia: null, distrito: null });
    expect(separarAddress2("")).toEqual({ referencia: null, distrito: null });
  });
});

describe("reposición del distrito en el pedido", () => {
  it("detecta que a la dirección le falta el distrito", () => {
    // Es lo que llega del checkout cuando Shopify descarta el separador: la
    // referencia sí, el distrito no.
    const { distrito, referencia } = separarAddress2("frente al parque");
    expect(distrito).toBeNull();
    expect(referencia).toBe("frente al parque");
  });

  it("recompone la dirección conservando la referencia", () => {
    const repuesta = componerAddress2("frente al parque", "Santiago de Surco");
    const partes = separarAddress2(repuesta);
    expect(partes.referencia).toBe("frente al parque");
    expect(partes.distrito).toBe("Santiago de Surco");
  });

  it("funciona aunque no hubiera referencia", () => {
    const repuesta = componerAddress2(null, "Carabayllo");
    expect(separarAddress2(repuesta).distrito).toBe("Carabayllo");
  });

  it("no vuelve a tocar una dirección que ya trae el distrito", () => {
    const buena = componerAddress2("Dpto 401", "Miraflores");
    expect(separarAddress2(buena).distrito).toBe("Miraflores");
  });
});
