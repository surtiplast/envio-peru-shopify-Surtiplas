/**
 * Selector de proveedor + capa de normalización contra el catálogo UBIGEO.
 *
 * Importante: la geocodificación NO devuelve UBIGEO. Devuelve nombres de lugar
 * que hay que reconciliar con la nomenclatura del INEI. Esa reconciliación es
 * este archivo, y por eso vive separada del proveedor.
 */
import { resolver as resolverUbigeo, type ResultadoResolucion } from "../ubigeo/catalogo";
import { ProveedorGoogle } from "./google";
import { ProveedorNominatim } from "./nominatim";
import type { DireccionGeo, ProveedorGeolocalizacion } from "./proveedor";
import { ErrorGeolocalizacion } from "./proveedor";

class ProveedorInactivo implements ProveedorGeolocalizacion {
  readonly nombre = "none";
  disponible() { return false; }
  async geocodificacionInversa() { throw new ErrorGeolocalizacion("Geolocalización desactivada", "NO_CONFIGURADO"); return null; }
  async autocompletar() { return []; }
  async detalle() { return null; }
}

let instancia: ProveedorGeolocalizacion | null = null;

export function proveedorGeo(): ProveedorGeolocalizacion {
  if (instancia) return instancia;
  switch ((process.env.GEO_PROVIDER ?? "none").toLowerCase()) {
    case "google":
      instancia = new ProveedorGoogle();
      break;
    case "nominatim":
      instancia = new ProveedorNominatim();
      break;
    default:
      instancia = new ProveedorInactivo();
  }
  return instancia;
}

/** Solo para pruebas: permite inyectar un doble. */
export function fijarProveedorGeo(p: ProveedorGeolocalizacion | null) {
  instancia = p;
}

export interface UbicacionNormalizada {
  direccion: DireccionGeo;
  ubigeo: ResultadoResolucion | null;
  /** true si hubo que pedirle al comprador que confirme el distrito. */
  requiereConfirmacion: boolean;
}

/**
 * Convierte una respuesta del proveedor en algo que la app entiende.
 * Si no logramos un UBIGEO fiable NO adivinamos: devolvemos
 * requiereConfirmacion y el formulario muestra los selectores para que el
 * comprador elija. Es preferible un clic más que cobrar el envío equivocado.
 */
export function normalizar(direccion: DireccionGeo): UbicacionNormalizada {
  /**
   * Se prueban todos los nombres candidatos, y además dos veces: primero
   * acotando por departamento y provincia, y si eso no da nada, solo con el
   * nombre del distrito.
   *
   * El motivo del segundo intento: los geocodificadores devuelven nombres
   * administrativos que no siempre coinciden con los del INEI ("Lima
   * Metropolitana" en vez de "Lima", o la provincia vacía). Acotar por un
   * departamento que no reconocemos descarta al distrito correcto. El nombre
   * del distrito solo se acepta si es único en el país, así que aflojar el
   * filtro no nos hace inventar respuestas.
   */
  const candidatos = [
    direccion.distrito,
    ...(direccion.candidatosDistrito ?? []),
  ].filter((v): v is string => Boolean(v && v.trim()));

  let ubigeo = null as ReturnType<typeof resolverUbigeo>;

  for (const nombre of candidatos) {
    ubigeo = resolverUbigeo({
      departamento: direccion.departamento,
      provincia: direccion.provincia,
      distrito: nombre,
    });
    if (ubigeo && ubigeo.confianza >= 0.9) break;
  }

  if (!ubigeo || ubigeo.confianza < 0.9) {
    for (const nombre of candidatos) {
      const suelto = resolverUbigeo({ distrito: nombre });
      if (suelto && suelto.confianza >= 0.9) {
        ubigeo = suelto;
        break;
      }
    }
  }

  return {
    direccion,
    ubigeo,
    requiereConfirmacion: !ubigeo || ubigeo.confianza < 0.9,
  };
}

export async function ubicacionPorCoordenadas(lat: number, lng: number): Promise<UbicacionNormalizada | null> {
  const direccion = await proveedorGeo().geocodificacionInversa(lat, lng);
  return direccion ? normalizar(direccion) : null;
}

export async function ubicacionPorReferencia(referencia: string, sesion?: string): Promise<UbicacionNormalizada | null> {
  const direccion = await proveedorGeo().detalle(referencia, sesion);
  return direccion ? normalizar(direccion) : null;
}
