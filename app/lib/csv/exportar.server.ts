/**
 * Exportación de tarifas.
 *
 * El archivo generado usa EXACTAMENTE los mismos encabezados que espera el
 * importador, de modo que exportar → editar en Excel → importar es un ciclo
 * cerrado sin pérdida de datos (los campos no reconocidos vuelven desde
 * `extras` a sus columnas originales).
 */
import prisma from "../../db.server";
import type { Prisma } from "@prisma/client";

export interface FiltroExportacion {
  codDep?: string;
  codProv?: string;
  ubigeo?: string;
  activo?: boolean;
  soloIds?: string[];
  busqueda?: string;
}

export function condicionesDe(shopId: string, filtro: FiltroExportacion): Prisma.TarifaWhereInput {
  const where: Prisma.TarifaWhereInput = { shopId };
  if (filtro.codDep) where.codDep = filtro.codDep;
  if (filtro.codProv) where.codProv = filtro.codProv;
  if (filtro.ubigeo) where.ubigeo = filtro.ubigeo;
  if (filtro.activo !== undefined) where.activo = filtro.activo;
  if (filtro.soloIds?.length) where.id = { in: filtro.soloIds };
  if (filtro.busqueda) {
    where.OR = [
      { nombreDist: { contains: filtro.busqueda, mode: "insensitive" } },
      { nombreProv: { contains: filtro.busqueda, mode: "insensitive" } },
      { nombreDep: { contains: filtro.busqueda, mode: "insensitive" } },
      { ubigeo: { contains: filtro.busqueda } },
      { codShopify: { contains: filtro.busqueda, mode: "insensitive" } },
    ];
  }
  return where;
}

function celda(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function importe(v: Prisma.Decimal | null | undefined): string {
  return v === null || v === undefined ? "" : Number(v).toFixed(2);
}

export async function exportarCsv(shopId: string, filtro: FiltroExportacion): Promise<string> {
  const tarifas = await prisma.tarifa.findMany({
    where: condicionesDe(shopId, filtro),
    include: { metodos: { include: { rangos: { orderBy: { orden: "asc" } } } } },
    orderBy: { ubigeo: "asc" },
  });

  // Nº de rangos = el máximo encontrado, para no truncar a nadie.
  const maxRangos = tarifas.reduce(
    (max, t) => Math.max(max, ...t.metodos.map((m) => m.rangos.reduce((x, r) => Math.max(x, r.orden), 0)), 0),
    1,
  );

  // Columnas "extra" que traía el archivo original y que hay que devolver.
  const columnasExtra = [...new Set(tarifas.flatMap((t) => Object.keys((t.extras as Record<string, string>) ?? {})))]
    .filter((c) => !["id_origen", "storename"].includes(c))
    .sort();

  const encabezados = ["id", "storename", "codshopify", "departamento", "provincia", "distrito", "ubigeo", "activo"];
  for (let i = 1; i <= maxRangos; i++) {
    encabezados.push(`rango${i}_min`, `rango${i}_max`, `rango${i}_costo`, `rango${i}_costo2`, `rango${i}_costo3`);
  }
  encabezados.push(
    "texto", "texto_description", "texto2", "texto2_description",
    "texto3", "texto3_description", "texto_collect", "texto_collect_description",
    ...columnasExtra,
  );

  const lineas = [encabezados.join(",")];

  for (const t of tarifas) {
    const extras = (t.extras as Record<string, string>) ?? {};
    const estandar = t.metodos.find((m) => m.tipo === "ESTANDAR");
    const express = t.metodos.find((m) => m.tipo === "EXPRESS");
    const recojo = t.metodos.find((m) => m.tipo === "RECOJO");

    const fila: Record<string, unknown> = {
      id: extras.id_origen ?? "",
      storename: extras.storename ?? "",
      codshopify: t.codShopify ?? "",
      departamento: t.nombreDep,
      provincia: t.nombreProv,
      distrito: t.nombreDist,
      ubigeo: t.ubigeo,
      activo: t.activo ? "1" : "0",
      texto: estandar?.etiqueta ?? "",
      texto_description: estandar?.descripcion ?? "",
      texto2: express?.etiqueta ?? "",
      texto2_description: express?.descripcion ?? "",
      texto3: extras.texto3 ?? "",
      texto3_description: extras.texto3_description ?? "",
      texto_collect: recojo?.etiqueta ?? "",
      texto_collect_description: recojo?.descripcion ?? "",
    };

    for (let i = 1; i <= maxRangos; i++) {
      const re = estandar?.rangos.find((r) => r.orden === i);
      const rx = express?.rangos.find((r) => r.orden === i);
      fila[`rango${i}_min`] = re ? importe(re.montoMin) : rx ? importe(rx.montoMin) : "";
      fila[`rango${i}_max`] = re ? importe(re.montoMax) : rx ? importe(rx.montoMax) : "";
      fila[`rango${i}_costo`] = re ? (re.gratis ? "GRATIS" : importe(re.costo)) : "";
      fila[`rango${i}_costo2`] = rx ? importe(rx.costo) : "";
      fila[`rango${i}_costo3`] = re ? importe(re.costoAlt1) : "";
    }

    for (const c of columnasExtra) fila[c] = extras[c] ?? "";
    lineas.push(encabezados.map((h) => celda(fila[h])).join(","));
  }

  // BOM para que Excel en Windows abra los acentos correctamente.
  return "﻿" + lineas.join("\n") + "\n";
}

/** Exportación a XLSX. Usa exceljs, que hace streaming y aguanta 100k filas. */
export async function exportarXlsx(shopId: string, filtro: FiltroExportacion): Promise<Buffer> {
  const { default: ExcelJS } = await import("exceljs");
  const csv = await exportarCsv(shopId, filtro);
  const [cabecera, ...filas] = csv.replace(/^﻿/, "").trim().split("\n");

  const libro = new ExcelJS.Workbook();
  libro.creator = "Envío Perú";
  const hoja = libro.addWorksheet("Tarifas", { views: [{ state: "frozen", ySplit: 1 }] });

  const encabezados = cabecera.split(",");
  hoja.addRow(encabezados);
  hoja.getRow(1).font = { bold: true };
  hoja.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF3F8" } };

  const partir = (linea: string) => {
    const salida: string[] = [];
    let actual = "";
    let entreComillas = false;
    for (let i = 0; i < linea.length; i++) {
      const c = linea[i];
      if (c === '"') {
        if (entreComillas && linea[i + 1] === '"') { actual += '"'; i++; }
        else entreComillas = !entreComillas;
      } else if (c === "," && !entreComillas) { salida.push(actual); actual = ""; }
      else actual += c;
    }
    salida.push(actual);
    return salida;
  };

  for (const linea of filas) hoja.addRow(partir(linea));
  hoja.columns.forEach((c) => { c.width = 18; });
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: encabezados.length } };

  return Buffer.from(await libro.xlsx.writeBuffer());
}
