import { describe, expect, it } from "vitest";
import {
  aCentimos,
  buscarRango,
  cotizar,
  cotizarMetodo,
  formatearSoles,
  validarRangos,
} from "../app/lib/rates/motor";
import type { MetodoTarifa, TarifaResuelta } from "../app/lib/rates/tipos";

/** La escalera del enunciado: 0–99.99 => 15, 100–199.99 => 10, 200–299.99 => 5, 300+ => gratis */
const rangosMagdalena = [
  { orden: 1, montoMin: 0, montoMax: 9999, costo: 1500 },
  { orden: 2, montoMin: 10000, montoMax: 19999, costo: 1000 },
  { orden: 3, montoMin: 20000, montoMax: 29999, costo: 500 },
  { orden: 4, montoMin: 30000, montoMax: null, costo: 0, gratis: true },
];

const estandar: MetodoTarifa = { tipo: "ESTANDAR", activo: true, rangos: rangosMagdalena };

const tarifaMagdalena: TarifaResuelta = {
  ubigeo: "150120",
  departamento: "Lima",
  provincia: "Lima",
  distrito: "Magdalena del Mar",
  activo: true,
  metodos: [
    estandar,
    { tipo: "EXPRESS", activo: true, rangos: [{ orden: 1, montoMin: 0, montoMax: null, costo: 1500 }] },
    { tipo: "RECOJO", activo: true, rangos: [{ orden: 1, montoMin: 0, montoMax: null, costo: 0, gratis: true }] },
  ],
};

describe("conversión de dinero", () => {
  it("convierte soles a céntimos sin errores de coma flotante", () => {
    expect(aCentimos(99.99)).toBe(9999);
    expect(aCentimos("10.10")).toBe(1010);
    expect(aCentimos("10,10")).toBe(1010); // coma decimal, común en CSV peruanos
    expect(aCentimos(0.1) + aCentimos(0.2)).toBe(aCentimos(0.3));
    expect(aCentimos(null)).toBe(0);
    expect(aCentimos("no es un número")).toBe(0);
  });

  it("formatea para el comprador", () => {
    expect(formatearSoles(1000)).toBe("S/ 10.00");
    expect(formatearSoles(0)).toBe("S/ 0.00");
  });
});

describe("buscarRango", () => {
  it("el ejemplo del enunciado: S/ 150 cae en el rango 2", () => {
    const r = buscarRango(rangosMagdalena, aCentimos(150));
    expect(r?.orden).toBe(2);
    expect(r?.costo).toBe(1000);
  });

  it("los dos extremos son inclusivos", () => {
    expect(buscarRango(rangosMagdalena, aCentimos(0))?.orden).toBe(1);
    expect(buscarRango(rangosMagdalena, aCentimos(99.99))?.orden).toBe(1);
    expect(buscarRango(rangosMagdalena, aCentimos(100))?.orden).toBe(2);
    expect(buscarRango(rangosMagdalena, aCentimos(199.99))?.orden).toBe(2);
    expect(buscarRango(rangosMagdalena, aCentimos(200))?.orden).toBe(3);
  });

  it("el rango sin techo cubre cualquier importe alto", () => {
    expect(buscarRango(rangosMagdalena, aCentimos(1_000_000))?.orden).toBe(4);
  });

  it("con rangos solapados gana el de menor orden", () => {
    const solapados = [
      { orden: 2, montoMin: 0, montoMax: 50000, costo: 800 },
      { orden: 1, montoMin: 0, montoMax: 10000, costo: 1500 },
    ];
    expect(buscarRango(solapados, aCentimos(50))?.orden).toBe(1);
  });

  it("devuelve null si ningún rango cubre el importe", () => {
    expect(buscarRango([{ orden: 1, montoMin: 10000, montoMax: 20000, costo: 500 }], aCentimos(5))).toBeNull();
  });
});

describe("cotizarMetodo", () => {
  it("aplica el rango correcto y explica por qué", () => {
    const c = cotizarMetodo(estandar, { subtotal: aCentimos(150) });
    expect(c.costo).toBe(1000);
    expect(c.motivo).toBe("RANGO");
    expect(c.rango?.orden).toBe(2);
    expect(c.disponible).toBe(true);
  });

  it("marca gratis cuando el rango es gratuito", () => {
    const c = cotizarMetodo(estandar, { subtotal: aCentimos(350) });
    expect(c.costo).toBe(0);
    expect(c.gratis).toBe(true);
    expect(c.motivo).toBe("RANGO_GRATIS");
  });

  it("el umbral de envío gratis manda sobre los rangos", () => {
    const conUmbral: MetodoTarifa = { ...estandar, umbralEnvioGratis: aCentimos(120) };
    const c = cotizarMetodo(conUmbral, { subtotal: aCentimos(150) });
    expect(c.costo).toBe(0);
    expect(c.motivo).toBe("UMBRAL_GRATIS");
  });

  it("usa la columna de costo alternativa cuando se pide", () => {
    const metodo: MetodoTarifa = {
      tipo: "ESTANDAR",
      activo: true,
      rangos: [{ orden: 1, montoMin: 0, montoMax: null, costo: 1500, costoAlt1: 1200, costoAlt2: 900 }],
    };
    expect(cotizarMetodo(metodo, { subtotal: 5000 }).costo).toBe(1500);
    expect(cotizarMetodo(metodo, { subtotal: 5000, columnaCosto: 1 }).costo).toBe(1200);
    expect(cotizarMetodo(metodo, { subtotal: 5000, columnaCosto: 2 }).costo).toBe(900);
  });

  it("si la columna alternativa está vacía cae al costo principal", () => {
    const metodo: MetodoTarifa = {
      tipo: "ESTANDAR",
      activo: true,
      rangos: [{ orden: 1, montoMin: 0, montoMax: null, costo: 1500, costoAlt1: null }],
    };
    expect(cotizarMetodo(metodo, { subtotal: 5000, columnaCosto: 1 }).costo).toBe(1500);
  });

  it("sin rango y política BLOQUEAR deja el método no disponible", () => {
    const metodo: MetodoTarifa = {
      tipo: "ESTANDAR",
      activo: true,
      rangos: [{ orden: 1, montoMin: 10000, montoMax: 20000, costo: 500 }],
    };
    const c = cotizarMetodo(metodo, { subtotal: aCentimos(5), politicaSinTarifa: "BLOQUEAR" });
    expect(c.disponible).toBe(false);
    expect(c.motivo).toBe("SIN_COBERTURA");
  });

  it("sin rango y política COSTO_FIJO usa el costo por defecto", () => {
    const metodo: MetodoTarifa = {
      tipo: "ESTANDAR",
      activo: true,
      rangos: [{ orden: 1, montoMin: 10000, montoMax: 20000, costo: 500 }],
    };
    const c = cotizarMetodo(metodo, {
      subtotal: aCentimos(5),
      politicaSinTarifa: "COSTO_FIJO",
      costoPorDefecto: aCentimos(20),
    });
    expect(c.disponible).toBe(true);
    expect(c.costo).toBe(2000);
    expect(c.motivo).toBe("COSTO_FIJO");
  });
});

describe("cotizar (distrito completo)", () => {
  it("devuelve los tres métodos en orden de presentación", () => {
    const opciones = cotizar(tarifaMagdalena, { subtotal: aCentimos(150) });
    expect(opciones.map((o) => o.tipo)).toEqual(["ESTANDAR", "EXPRESS", "RECOJO"]);
    expect(opciones[0].costo).toBe(1000);
    expect(opciones[1].costo).toBe(1500);
    expect(opciones[2].costo).toBe(0);
  });

  it("respeta el filtro de métodos (express desactivado por la tienda)", () => {
    const opciones = cotizar(tarifaMagdalena, {
      subtotal: aCentimos(150),
      soloMetodos: ["ESTANDAR", "RECOJO"],
    });
    expect(opciones.map((o) => o.tipo)).toEqual(["ESTANDAR", "RECOJO"]);
  });

  it("una tarifa desactivada no ofrece nada con política BLOQUEAR", () => {
    expect(cotizar({ ...tarifaMagdalena, activo: false }, { subtotal: 15000 })).toEqual([]);
  });

  it("un distrito sin tarifa devuelve el costo fijo si así se configuró", () => {
    const opciones = cotizar(null, {
      subtotal: 15000,
      politicaSinTarifa: "COSTO_FIJO",
      costoPorDefecto: aCentimos(25),
    });
    expect(opciones).toHaveLength(1);
    expect(opciones[0].costo).toBe(2500);
  });

  it("un método desactivado no se ofrece", () => {
    const tarifa: TarifaResuelta = {
      ...tarifaMagdalena,
      metodos: tarifaMagdalena.metodos.map((m) => (m.tipo === "EXPRESS" ? { ...m, activo: false } : m)),
    };
    expect(cotizar(tarifa, { subtotal: 15000 }).map((o) => o.tipo)).toEqual(["ESTANDAR", "RECOJO"]);
  });
});

describe("validarRangos", () => {
  it("la escalera del enunciado no tiene problemas", () => {
    expect(validarRangos(rangosMagdalena)).toEqual([]);
  });

  it("detecta huecos", () => {
    const p = validarRangos([
      { orden: 1, montoMin: 0, montoMax: 9999, costo: 1500 },
      { orden: 2, montoMin: 20000, montoMax: null, costo: 500 },
    ]);
    expect(p.some((x) => x.codigo === "HUECO")).toBe(true);
  });

  it("detecta solapamientos", () => {
    const p = validarRangos([
      { orden: 1, montoMin: 0, montoMax: 15000, costo: 1500 },
      { orden: 2, montoMin: 10000, montoMax: null, costo: 500 },
    ]);
    expect(p.some((x) => x.codigo === "SOLAPADO")).toBe(true);
  });

  it("detecta rangos invertidos", () => {
    const p = validarRangos([{ orden: 1, montoMin: 20000, montoMax: 10000, costo: 500 }]);
    expect(p.some((x) => x.codigo === "INVERTIDO")).toBe(true);
  });

  it("avisa cuando falta el rango sin techo", () => {
    const p = validarRangos([{ orden: 1, montoMin: 0, montoMax: 9999, costo: 1500 }]);
    expect(p.some((x) => x.codigo === "SIN_TECHO")).toBe(true);
  });

  it("avisa si no hay rangos", () => {
    expect(validarRangos([])[0].codigo).toBe("SIN_RANGOS");
  });
});
