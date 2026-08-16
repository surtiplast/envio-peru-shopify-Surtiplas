/**
 * Contrato del proveedor de verificación de documentos (DNI / RUC).
 *
 * Decisión explícita: NO se hace scraping de RENIEC ni de SUNAT. Se consume
 * una API de un proveedor autorizado, configurada por variables de entorno.
 * Las credenciales viven solo en el servidor.
 */

export type TipoDocumento = "DNI" | "RUC";

export interface DatosDni {
  tipo: "DNI";
  numero: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  nombreCompleto: string;
}

export interface DatosRuc {
  tipo: "RUC";
  numero: string;
  razonSocial: string;
  nombreComercial?: string | null;
  direccionFiscal?: string | null;
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  ubigeo?: string | null;
  estado?: string | null;
  condicion?: string | null;
}

export type DatosDocumento = DatosDni | DatosRuc;

export type ResultadoConsulta =
  | { ok: true; datos: DatosDocumento }
  | { ok: false; codigo: "INVALIDO" | "NO_ENCONTRADO" | "NO_CONFIGURADO" | "LIMITE" | "ERROR_PROVEEDOR"; mensaje: string };

export interface ProveedorDocumentos {
  readonly nombre: string;
  disponible(): boolean;
  consultarDni(numero: string): Promise<ResultadoConsulta>;
  consultarRuc(numero: string): Promise<ResultadoConsulta>;
}

// --- Validaciones locales (baratas, evitan gastar cuota del proveedor) ------

export function dniValido(numero: string): boolean {
  return /^\d{8}$/.test(numero);
}

/**
 * RUC: 11 dígitos, prefijo válido (10 persona natural, 15, 16, 17, 20 empresas)
 * y dígito verificador correcto según el algoritmo módulo 11 de SUNAT.
 */
export function rucValido(numero: string): boolean {
  if (!/^\d{11}$/.test(numero)) return false;
  if (!["10", "15", "16", "17", "20"].includes(numero.slice(0, 2))) return false;

  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let suma = 0;
  for (let i = 0; i < 10; i++) suma += Number(numero[i]) * pesos[i];
  const resto = suma % 11;
  const esperado = (11 - resto) % 10;
  return Number(numero[10]) === esperado;
}

/** Para la bitácora: nunca guardamos el documento completo. */
export function ultimosDigitos(numero: string): string {
  return numero.slice(-3).padStart(3, "0");
}
