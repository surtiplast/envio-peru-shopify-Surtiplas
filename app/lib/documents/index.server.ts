/**
 * Punto de entrada de la consulta DNI/RUC.
 *
 * Reglas de producto:
 *  - Si el proveedor falla, NO se bloquea la compra. Se devuelve un mensaje
 *    amable y el comprador escribe sus datos a mano.
 *  - Del número consultado solo se guardan los 3 últimos dígitos en la bitácora.
 */
import prisma from "../../db.server";
import { ProveedorApiDocumentos } from "./api";
import type { ProveedorDocumentos, ResultadoConsulta, TipoDocumento } from "./proveedor";
import { ultimosDigitos } from "./proveedor";
import { registrarError } from "../errores.server";

class ProveedorInactivo implements ProveedorDocumentos {
  readonly nombre = "none";
  disponible() { return false; }
  async consultarDni(): Promise<ResultadoConsulta> {
    return { ok: false, codigo: "NO_CONFIGURADO", mensaje: "Consulta de documentos no configurada." };
  }
  async consultarRuc(): Promise<ResultadoConsulta> {
    return { ok: false, codigo: "NO_CONFIGURADO", mensaje: "Consulta de documentos no configurada." };
  }
}

let instancia: ProveedorDocumentos | null = null;

export function proveedorDocumentos(): ProveedorDocumentos {
  if (instancia) return instancia;
  instancia =
    (process.env.DNI_RUC_PROVIDER ?? "none").toLowerCase() === "api"
      ? new ProveedorApiDocumentos()
      : new ProveedorInactivo();
  return instancia;
}

/** Solo para pruebas: permite inyectar un doble. */
export function fijarProveedorDocumentos(p: ProveedorDocumentos | null) {
  instancia = p;
}

export const MENSAJE_DEGRADADO =
  "No pudimos consultar los datos automáticamente. Puedes completar tus datos manualmente.";

export async function consultarDocumento(
  shopId: string,
  tipo: TipoDocumento,
  numero: string,
): Promise<ResultadoConsulta & { mensajeUsuario?: string }> {
  const proveedor = proveedorDocumentos();
  const inicio = Date.now();

  const resultado =
    tipo === "DNI" ? await proveedor.consultarDni(numero) : await proveedor.consultarRuc(numero);

  try {
    await prisma.consultaDocumento.create({
      data: {
        shopId,
        tipoDoc: tipo,
        ultimosDigitos: ultimosDigitos(numero),
        resultado: resultado.ok ? "OK" : resultado.codigo,
        proveedor: proveedor.nombre,
        duracionMs: Date.now() - inicio,
      },
    });
  } catch {
    // La bitácora no debe romper la consulta.
  }

  if (resultado.ok) return resultado;
  if (resultado.codigo === "INVALIDO") return resultado;

  // Un fallo del proveedor no rompe la compra, pero sí queremos poder verlo.
  registrarError(
    new Error(`[${tipo}] ${resultado.codigo}: ${resultado.mensaje}`),
  );

  return { ...resultado, mensajeUsuario: MENSAJE_DEGRADADO };
}
