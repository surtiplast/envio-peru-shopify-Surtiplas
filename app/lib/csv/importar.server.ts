/**
 * Importador de tarifas.
 *
 * Se divide en dos fases para que el comerciante confirme antes de escribir:
 *   analizar()  -> lee el archivo, propone mapeo, valida y devuelve el resumen
 *   ejecutar()  -> escribe en lotes, actualizando el progreso
 *
 * Nunca se hace un "borrar todo e insertar": se hace UPSERT por (shopId, ubigeo)
 * para no perder configuraciones manuales que el comerciante haya hecho.
 */
import Papa from "papaparse";
import prisma from "../../db.server";
import { resolver as resolverUbigeo } from "../ubigeo/catalogo";
import { detectarColumnas, mapeoPorDefecto, validarMapeo, type ColumnaDetectada, type MapeoColumnas } from "./mapeo";
import { transformarFila, type ErrorFila, type FilaTarifa, type ModoCostos } from "./filas";

const LOTE = 250;

export interface AnalisisImportacion {
  importacionId: string;
  columnas: ColumnaDetectada[];
  mapeo: MapeoColumnas;
  problemasMapeo: string[];
  totalFilas: number;
  vistaPrevia: Record<string, string>[];
  validos: number;
  nuevos: number;
  actualizaciones: number;
  duplicadosEnArchivo: number;
  errores: ErrorFila[];
  avisos: ErrorFila[];
}

function parsear(contenido: string): { filas: Record<string, string>[]; encabezados: string[] } {
  const resultado = Papa.parse<Record<string, string>>(contenido, {
    header: true,
    skipEmptyLines: "greedy",
    // Autodetecta coma, punto y coma o tabulador: los tres aparecen en exportaciones de Excel.
    delimiter: "",
    transformHeader: (h) => h.trim(),
  });
  return {
    filas: (resultado.data ?? []).filter((f) => Object.values(f).some((v) => String(v ?? "").trim() !== "")),
    encabezados: (resultado.meta.fields ?? []).map((h) => h.trim()),
  };
}

/** Fase 1: leer, mapear, validar. No escribe ninguna tarifa. */
export async function analizar(
  shopId: string,
  nombreArchivo: string,
  contenido: string,
  opciones?: { mapeo?: MapeoColumnas; modoCostos?: ModoCostos; ignorarRangosVacios?: boolean },
): Promise<AnalisisImportacion> {
  const { filas, encabezados } = parsear(contenido);
  const columnas = detectarColumnas(encabezados, filas.slice(0, 5));
  const mapeo = opciones?.mapeo ?? mapeoPorDefecto(columnas);
  const problemasMapeo = validarMapeo(mapeo);

  const errores: ErrorFila[] = [];
  const avisos: ErrorFila[] = [];
  const vistos = new Set<string>();
  let validos = 0;
  let duplicadosEnArchivo = 0;
  const ubigeosValidos: string[] = [];

  if (problemasMapeo.length === 0) {
    filas.forEach((fila, i) => {
      const numeroFila = i + 2; // +1 por el encabezado, +1 porque los humanos cuentan desde 1
      const r = transformarFila(fila, numeroFila, {
        mapeo,
        resolver: resolverUbigeo,
        modoCostos: opciones?.modoCostos,
        ignorarRangosVacios: opciones?.ignorarRangosVacios,
      });
      errores.push(...r.errores);
      avisos.push(...r.avisos);
      if (!r.ok || !r.tarifa) return;

      if (vistos.has(r.tarifa.ubigeo)) {
        duplicadosEnArchivo++;
        avisos.push({
          fila: numeroFila,
          codigo: "DUPLICADO",
          mensaje: `${r.tarifa.nombreDist} (${r.tarifa.ubigeo}) aparece más de una vez. Se usará la última fila.`,
        });
      } else {
        vistos.add(r.tarifa.ubigeo);
      }
      validos++;
      ubigeosValidos.push(r.tarifa.ubigeo);
    });
  }

  // Cuántos ya existen en la tienda -> serán actualizaciones, no altas.
  const existentes = ubigeosValidos.length
    ? await prisma.tarifa.findMany({
        where: { shopId, ubigeo: { in: [...new Set(ubigeosValidos)] } },
        select: { ubigeo: true },
      })
    : [];
  const setExistentes = new Set(existentes.map((e) => e.ubigeo));
  const unicos = [...vistos];
  const actualizaciones = unicos.filter((u) => setExistentes.has(u)).length;
  const nuevos = unicos.length - actualizaciones;

  const importacion = await prisma.importacion.create({
    data: {
      shopId,
      archivo: nombreArchivo,
      estado: problemasMapeo.length ? "FALLIDA" : "ESPERANDO_CONFIRMACION",
      mapeo: mapeo as object,
      totalFilas: filas.length,
      validos,
      nuevos,
      actualizados: actualizaciones,
      duplicados: duplicadosEnArchivo,
      errores: errores.length,
      detalleErrores: errores.slice(0, 5000) as unknown as object,
    },
  });

  return {
    importacionId: importacion.id,
    columnas,
    mapeo,
    problemasMapeo,
    totalFilas: filas.length,
    vistaPrevia: filas.slice(0, 10),
    validos,
    nuevos,
    actualizaciones,
    duplicadosEnArchivo,
    errores,
    avisos,
  };
}

/** Escribe una tarifa (alta o actualización) con sus métodos y rangos. */
async function guardarTarifa(shopId: string, t: FilaTarifa) {
  const datosBase = {
    codDep: t.codDep,
    codProv: t.codProv,
    nombreDep: t.nombreDep,
    nombreProv: t.nombreProv,
    nombreDist: t.nombreDist,
    codShopify: t.codShopify,
    activo: t.activo,
    extras: t.extras as object,
  };

  const tarifa = await prisma.tarifa.upsert({
    where: { shopId_ubigeo: { shopId, ubigeo: t.ubigeo } },
    create: { shopId, ubigeo: t.ubigeo, ...datosBase },
    update: datosBase,
  });

  // Los métodos se reemplazan por completo: el CSV es la fuente de verdad de
  // esta importación y así no quedan rangos huérfanos de una carga anterior.
  await prisma.metodoEnvio.deleteMany({
    where: { tarifaId: tarifa.id, tipo: { in: t.metodos.map((m) => m.tipo) } },
  });

  for (const metodo of t.metodos) {
    await prisma.metodoEnvio.create({
      data: {
        tarifaId: tarifa.id,
        tipo: metodo.tipo,
        activo: metodo.activo,
        etiqueta: metodo.etiqueta,
        descripcion: metodo.descripcion,
        rangos: {
          create: metodo.rangos.map((r) => ({
            orden: r.orden,
            montoMin: (r.montoMin / 100).toFixed(2),
            montoMax: r.montoMax === null ? null : (r.montoMax / 100).toFixed(2),
            costo: (r.costo / 100).toFixed(2),
            costoAlt1: r.costoAlt1 == null ? null : (r.costoAlt1 / 100).toFixed(2),
            costoAlt2: r.costoAlt2 == null ? null : (r.costoAlt2 / 100).toFixed(2),
            gratis: Boolean(r.gratis),
          })),
        },
      },
    });
  }
}

export interface ResultadoImportacion {
  nuevos: number;
  actualizados: number;
  errores: number;
  duplicados: number;
  total: number;
}

/** Fase 2: escribir. Actualiza `progreso` para que la barra del admin avance. */
export async function ejecutar(
  shopId: string,
  importacionId: string,
  contenido: string,
  mapeo: MapeoColumnas,
  opciones?: { modoCostos?: ModoCostos; ignorarRangosVacios?: boolean },
): Promise<ResultadoImportacion> {
  // Comprobación de pertenencia: una tienda no puede ejecutar la importación de otra.
  const importacion = await prisma.importacion.findFirst({ where: { id: importacionId, shopId } });
  if (!importacion) throw new Response("Importación no encontrada", { status: 404 });

  await prisma.importacion.update({
    where: { id: importacionId },
    data: { estado: "IMPORTANDO", progreso: 0, mapeo: mapeo as object },
  });

  const { filas } = parsear(contenido);

  // Última fila gana en caso de duplicado dentro del archivo.
  const porUbigeo = new Map<string, FilaTarifa>();
  const errores: ErrorFila[] = [];

  filas.forEach((fila, i) => {
    const r = transformarFila(fila, i + 2, {
      mapeo,
      resolver: resolverUbigeo,
      modoCostos: opciones?.modoCostos,
      ignorarRangosVacios: opciones?.ignorarRangosVacios,
    });
    errores.push(...r.errores);
    if (r.ok && r.tarifa) porUbigeo.set(r.tarifa.ubigeo, r.tarifa);
  });

  const tarifas = [...porUbigeo.values()];
  const existentes = new Set(
    (
      await prisma.tarifa.findMany({
        where: { shopId, ubigeo: { in: tarifas.map((t) => t.ubigeo) } },
        select: { ubigeo: true },
      })
    ).map((e) => e.ubigeo),
  );

  let nuevos = 0;
  let actualizados = 0;

  for (let i = 0; i < tarifas.length; i += LOTE) {
    const lote = tarifas.slice(i, i + LOTE);
    for (const t of lote) {
      try {
        await guardarTarifa(shopId, t);
        if (existentes.has(t.ubigeo)) actualizados++;
        else nuevos++;
      } catch (e) {
        errores.push({
          fila: 0,
          codigo: "UBIGEO_NO_ENCONTRADO",
          mensaje: `No se pudo guardar ${t.nombreDist} (${t.ubigeo}): ${(e as Error).message}`,
        });
      }
    }
    await prisma.importacion.update({
      where: { id: importacionId },
      data: { progreso: Math.round(((i + lote.length) / Math.max(tarifas.length, 1)) * 100) },
    });
  }

  const resultado: ResultadoImportacion = {
    nuevos,
    actualizados,
    errores: errores.length,
    duplicados: filas.length - tarifas.length - errores.length,
    total: filas.length,
  };

  await prisma.importacion.update({
    where: { id: importacionId },
    data: {
      estado: "COMPLETADA",
      progreso: 100,
      nuevos,
      actualizados,
      errores: errores.length,
      detalleErrores: errores.slice(0, 5000) as unknown as object,
      finalizadaEn: new Date(),
    },
  });

  return resultado;
}

/** CSV descargable con el detalle de errores de una importación. */
export function erroresACsv(errores: ErrorFila[]): string {
  const filas = [["fila", "columna", "codigo", "mensaje", "valor"].join(",")];
  for (const e of errores) {
    filas.push(
      [e.fila, e.columna ?? "", e.codigo, `"${e.mensaje.replace(/"/g, '""')}"`, `"${(e.valor ?? "").replace(/"/g, '""')}"`].join(","),
    );
  }
  return filas.join("\n");
}
