/**
 * Proveedor genérico por HTTP para consulta de DNI / RUC.
 *
 * Cada proveedor peruano expone su API de forma distinta: unos ponen el número
 * en la ruta y otros como parámetro, unos autentican con cabecera Bearer y
 * otros con un token en la URL. En vez de escribir un adaptador por proveedor,
 * la URL se define como una PLANTILLA con marcadores:
 *
 *   {numero}  → el DNI o RUC consultado
 *   {token}   → el valor de DNI_RUC_API_KEY
 *
 * Ejemplos reales de configuración:
 *
 *   Número en la ruta y token en la URL:
 *     https://ejemplo.pe/api/v1/dni/{numero}?token={token}
 *
 *   Número como parámetro y token por cabecera Bearer:
 *     https://ejemplo.pe/v2/reniec/dni?numero={numero}
 *
 * Si la plantilla no contiene {numero}, se añade `?numero=…` al final, que es
 * el comportamiento más común.
 */
import type { ProveedorDocumentos, ResultadoConsulta } from "./proveedor";
import { dniValido, rucValido } from "./proveedor";

type ModoAuth = "bearer" | "query" | "header" | "none";

function primero(objeto: any, claves: string[]): string | null {
  for (const k of claves) {
    const v = objeto?.[k];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

export class ProveedorApiDocumentos implements ProveedorDocumentos {
  readonly nombre = "api";

  constructor(
    private readonly urlDni = process.env.DNI_RUC_API_URL_DNI ?? "",
    private readonly urlRuc = process.env.DNI_RUC_API_URL_RUC ?? "",
    private readonly apiKey = process.env.DNI_RUC_API_KEY ?? "",
    /** bearer (por defecto) · query · header · none */
    private readonly modoAuth = (process.env.DNI_RUC_AUTH ?? "bearer").toLowerCase() as ModoAuth,
    /** Nombre de la cabecera cuando modoAuth = header. */
    private readonly nombreCabecera = process.env.DNI_RUC_AUTH_HEADER ?? "X-Api-Key",
    /** Nombre del parámetro cuando modoAuth = query. */
    private readonly nombreParamToken = process.env.DNI_RUC_AUTH_PARAM ?? "token",
    private readonly timeoutMs = Number(process.env.DNI_RUC_TIMEOUT_MS ?? 6000),
    /** Respaldo: una sola base, se usará como base/dni y base/ruc. */
    private readonly urlBase = process.env.DNI_RUC_API_URL ?? "",
  ) {}

  disponible() {
    return Boolean((this.urlDni || this.urlRuc || this.urlBase) && this.apiKey);
  }

  private plantilla(tipo: "dni" | "ruc"): string {
    const especifica = tipo === "dni" ? this.urlDni : this.urlRuc;
    if (especifica) return especifica.trim();
    if (this.urlBase) return `${this.urlBase.trim().replace(/\/+$/, "")}/${tipo}`;
    return "";
  }

  private construir(tipo: "dni" | "ruc", numero: string): { url: string; cabeceras: Record<string, string> } {
    let url = this.plantilla(tipo);

    const teniaMarcadorNumero = url.includes("{numero}");
    url = url.replace(/\{numero\}/g, encodeURIComponent(numero));
    url = url.replace(/\{token\}/g, encodeURIComponent(this.apiKey));

    if (!teniaMarcadorNumero) {
      url += `${url.includes("?") ? "&" : "?"}numero=${encodeURIComponent(numero)}`;
    }

    const cabeceras: Record<string, string> = { Accept: "application/json" };

    if (this.modoAuth === "bearer") {
      cabeceras.Authorization = `Bearer ${this.apiKey}`;
    } else if (this.modoAuth === "header") {
      cabeceras[this.nombreCabecera] = this.apiKey;
    } else if (this.modoAuth === "query") {
      // Solo si la plantilla no colocó ya el token.
      if (!this.plantilla(tipo).includes("{token}")) {
        url += `${url.includes("?") ? "&" : "?"}${this.nombreParamToken}=${encodeURIComponent(this.apiKey)}`;
      }
    }

    return { url, cabeceras };
  }

  private async pedir(tipo: "dni" | "ruc", numero: string): Promise<any> {
    const { url, cabeceras } = this.construir(tipo, numero);
    if (!url) throw new Error("Endpoint no configurado");

    const respuesta = await fetch(url, {
      headers: cabeceras,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (respuesta.status === 404 || respuesta.status === 422) return null;
    if (respuesta.status === 401 || respuesta.status === 403) {
      throw Object.assign(new Error("credenciales rechazadas"), { codigo: "AUTH" });
    }
    if (respuesta.status === 429) throw Object.assign(new Error("limite"), { codigo: "LIMITE" });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status} en ${new URL(url).host}${new URL(url).pathname}`);

    const cuerpo = await respuesta.json();

    /**
     * Varios proveedores —APIsPERU entre ellos— responden 200 con
     * `{ success: false, message: "..." }` tanto si el documento no existe como
     * si el token es inválido. Ese `message` es la única pista de cuál de los
     * dos es, así que lo conservamos en vez de tratarlo todo como "no encontrado".
     */
    if (cuerpo?.success === false) {
      const detalle = String(cuerpo.message ?? "sin detalle");
      if (/token|autoriz|auth|credencial|expir|inv[aá]lid/i.test(detalle)) {
        throw Object.assign(new Error(detalle), { codigo: "AUTH" });
      }
      throw Object.assign(new Error(detalle), { codigo: "SIN_DATOS" });
    }

    // Otros envuelven el resultado en { data } o { result }.
    return cuerpo?.data ?? cuerpo?.result ?? cuerpo;
  }

  private fallo(e: any): ResultadoConsulta {
    // El `mensaje` no se muestra al comprador (ve el texto amable), pero sí se
    // guarda en el diagnóstico. Sin él, un fallo del proveedor es indistinguible
    // de un documento inexistente.
    const detalle = e?.message ? ` (${String(e.message).slice(0, 160)})` : "";

    if (e?.codigo === "SIN_DATOS") {
      return { ok: false, codigo: "NO_ENCONTRADO", mensaje: `El proveedor no devolvió datos${detalle}` };
    }
    if (e?.codigo === "LIMITE") {
      return { ok: false, codigo: "LIMITE", mensaje: `Cuota del proveedor agotada${detalle}` };
    }
    if (e?.codigo === "AUTH") {
      return { ok: false, codigo: "NO_CONFIGURADO", mensaje: `Credenciales rechazadas por el proveedor${detalle}` };
    }
    return { ok: false, codigo: "ERROR_PROVEEDOR", mensaje: `Fallo al consultar${detalle}` };
  }

  async consultarDni(numero: string): Promise<ResultadoConsulta> {
    if (!dniValido(numero)) return { ok: false, codigo: "INVALIDO", mensaje: "El DNI debe tener 8 dígitos." };
    if (!this.disponible()) return { ok: false, codigo: "NO_CONFIGURADO", mensaje: "Consulta de documentos no configurada." };

    try {
      const d = await this.pedir("dni", numero);
      if (!d) return { ok: false, codigo: "NO_ENCONTRADO", mensaje: "No encontramos ese DNI." };

      const nombres = primero(d, ["nombres", "first_name", "firstName", "name", "nombre"]) ?? "";
      const paterno = primero(d, ["apellidoPaterno", "apellido_paterno", "first_last_name", "paterno"]) ?? "";
      const materno = primero(d, ["apellidoMaterno", "apellido_materno", "second_last_name", "materno"]) ?? "";
      const completo =
        primero(d, ["nombreCompleto", "nombre_completo", "full_name"]) ??
        `${nombres} ${paterno} ${materno}`.replace(/\s+/g, " ").trim();

      if (!nombres && !completo) return { ok: false, codigo: "NO_ENCONTRADO", mensaje: "No encontramos ese DNI." };

      return {
        ok: true,
        datos: { tipo: "DNI", numero, nombres, apellidoPaterno: paterno, apellidoMaterno: materno, nombreCompleto: completo },
      };
    } catch (e) {
      return this.fallo(e);
    }
  }

  async consultarRuc(numero: string): Promise<ResultadoConsulta> {
    if (!rucValido(numero)) return { ok: false, codigo: "INVALIDO", mensaje: "El RUC no es válido (11 dígitos)." };
    if (!this.disponible()) return { ok: false, codigo: "NO_CONFIGURADO", mensaje: "Consulta de documentos no configurada." };

    try {
      const d = await this.pedir("ruc", numero);
      if (!d) return { ok: false, codigo: "NO_ENCONTRADO", mensaje: "No encontramos ese RUC." };

      const razonSocial = primero(d, ["razonSocial", "razon_social", "nombre", "business_name", "name"]) ?? "";
      if (!razonSocial) return { ok: false, codigo: "NO_ENCONTRADO", mensaje: "No encontramos ese RUC." };

      return {
        ok: true,
        datos: {
          tipo: "RUC",
          numero,
          razonSocial,
          nombreComercial: primero(d, ["nombreComercial", "nombre_comercial", "trade_name"]),
          direccionFiscal: primero(d, ["direccion", "direccionFiscal", "direccion_fiscal", "address", "domicilioFiscal"]),
          departamento: primero(d, ["departamento", "department"]),
          provincia: primero(d, ["provincia", "province"]),
          distrito: primero(d, ["distrito", "district"]),
          ubigeo: primero(d, ["ubigeo", "ubigeo_sunat"]),
          estado: primero(d, ["estado", "status", "estadoContribuyente"]),
          condicion: primero(d, ["condicion", "condition", "condicionDomicilio"]),
        },
      };
    } catch (e) {
      return this.fallo(e);
    }
  }
}
