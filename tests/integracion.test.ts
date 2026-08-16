/**
 * Prueba de extremo a extremo de la parte que no necesita base de datos:
 * CSV real (1.874 distritos) -> detección de columnas -> transformación ->
 * motor de tarifas. Si esto pasa, el importador y el cálculo funcionan sobre
 * el archivo real del comerciante.
 */
import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { detectarColumnas, mapeoPorDefecto, validarMapeo } from "../app/lib/csv/mapeo";
import { transformarFila } from "../app/lib/csv/filas";
import { resolver as resolverUbigeo, totales } from "../app/lib/ubigeo/catalogo";
import { aCentimos, cotizar } from "../app/lib/rates/motor";
import type { TarifaResuelta } from "../app/lib/rates/tipos";

const CSV = path.join(__dirname, "..", "data", "tarifas-ejemplo.csv");
const CSV_ERRORES = path.join(__dirname, "..", "data", "tarifas-con-errores.csv");

function leer(ruta: string) {
  const contenido = fs.readFileSync(ruta, "utf8");
  const r = Papa.parse<Record<string, string>>(contenido, { header: true, skipEmptyLines: "greedy" });
  return { filas: r.data, encabezados: r.meta.fields ?? [] };
}

describe("importación del archivo completo", () => {
  const { filas, encabezados } = leer(CSV);
  const columnas = detectarColumnas(encabezados, filas.slice(0, 5));
  const mapeo = mapeoPorDefecto(columnas);

  it("el archivo cubre todos los distritos del país", () => {
    expect(filas.length).toBe(totales().distritos);
  });

  it("el mapeo automático es válido sin intervención humana", () => {
    expect(validarMapeo(mapeo)).toEqual([]);
    expect(columnas.filter((c) => c.campo === "extra")).toEqual([]);
  });

  it("todas las filas se transforman sin errores", () => {
    const errores: string[] = [];
    const ubigeos = new Set<string>();

    filas.forEach((fila, i) => {
      const r = transformarFila(fila, i + 2, { mapeo, resolver: resolverUbigeo });
      if (!r.ok) errores.push(`fila ${i + 2}: ${r.errores[0]?.mensaje}`);
      else ubigeos.add(r.tarifa!.ubigeo);
    });

    expect(errores.slice(0, 5)).toEqual([]);
    expect(ubigeos.size).toBe(filas.length); // sin duplicados
  });

  it("el ejemplo del enunciado da exactamente S/ 10.00", () => {
    const fila = filas.find((f) => f.ubigeo === "150120")!;
    const t = transformarFila(fila, 2, { mapeo, resolver: resolverUbigeo }).tarifa!;

    const tarifa: TarifaResuelta = {
      ubigeo: t.ubigeo,
      departamento: t.nombreDep,
      provincia: t.nombreProv,
      distrito: t.nombreDist,
      activo: t.activo,
      metodos: t.metodos,
    };

    const opciones = cotizar(tarifa, { subtotal: aCentimos(150) });
    const estandar = opciones.find((o) => o.tipo === "ESTANDAR")!;

    expect(t.nombreDep).toBe("Lima");
    expect(t.nombreProv).toBe("Lima");
    expect(t.nombreDist).toBe("Magdalena del Mar");
    expect(estandar.costo).toBe(1000); // S/ 10.00
    expect(estandar.rango?.orden).toBe(2);
  });

  it("la escalera completa de Magdalena del Mar se comporta como se pidió", () => {
    const fila = filas.find((f) => f.ubigeo === "150120")!;
    const t = transformarFila(fila, 2, { mapeo, resolver: resolverUbigeo }).tarifa!;
    const tarifa: TarifaResuelta = {
      ubigeo: t.ubigeo, departamento: t.nombreDep, provincia: t.nombreProv,
      distrito: t.nombreDist, activo: true, metodos: t.metodos,
    };

    const costoEstandar = (soles: number) =>
      cotizar(tarifa, { subtotal: aCentimos(soles) }).find((o) => o.tipo === "ESTANDAR")!;

    expect(costoEstandar(50).costo).toBe(1500);
    expect(costoEstandar(150).costo).toBe(1000);
    expect(costoEstandar(250).costo).toBe(500);
    expect(costoEstandar(350).gratis).toBe(true);
    expect(costoEstandar(350).costo).toBe(0);
  });

  it("las provincias tienen tarifas más altas que Lima metropolitana", () => {
    const lima = transformarFila(filas.find((f) => f.ubigeo === "150120")!, 2, { mapeo, resolver: resolverUbigeo }).tarifa!;
    const provincia = transformarFila(filas.find((f) => f.codDep === "01" || f.ubigeo === "010101")!, 2, { mapeo, resolver: resolverUbigeo }).tarifa!;

    const costo = (t: typeof lima) =>
      t.metodos.find((m) => m.tipo === "ESTANDAR")!.rangos[0].costo;

    expect(costo(provincia)).toBeGreaterThan(costo(lima));
  });
});

describe("archivo con errores intencionados", () => {
  const { filas, encabezados } = leer(CSV_ERRORES);
  const mapeo = mapeoPorDefecto(detectarColumnas(encabezados, filas));

  it("detecta cada problema en su fila y sigue procesando el resto", () => {
    const resultados = filas.map((f, i) => transformarFila(f, i + 2, { mapeo, resolver: resolverUbigeo }));

    // Distrito inexistente
    expect(resultados[0].ok).toBe(false);
    expect(resultados[0].errores[0].codigo).toBe("UBIGEO_NO_ENCONTRADO");

    // UBIGEO mal formado pero con nombres correctos: se recupera por la terna
    expect(resultados[1].ok).toBe(true);
    expect(resultados[1].tarifa!.nombreDist).toBe("Miraflores");

    // Importe no numérico
    expect(resultados[2].errores.some((e) => e.codigo === "IMPORTE_INVALIDO")).toBe(true);

    // Errata en el nombre: se resuelve por aproximación
    expect(resultados[5].ok).toBe(true);
    expect(resultados[5].tarifa!.nombreDist).toBe("Magdalena del Mar");
  });

  it("un archivo con errores no impide importar las filas buenas", () => {
    const validas = filas
      .map((f, i) => transformarFila(f, i + 2, { mapeo, resolver: resolverUbigeo }))
      .filter((r) => r.ok);
    expect(validas.length).toBeGreaterThan(0);
    expect(validas.length).toBeLessThan(filas.length);
  });
});
