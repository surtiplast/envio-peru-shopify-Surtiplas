/**
 * Implementación con Google Maps Platform (Geocoding + Places Autocomplete).
 *
 * La API key se lee de GOOGLE_MAPS_API_KEY y SOLO se usa aquí, en el servidor.
 * En Google Cloud Console debe restringirse por IP del servidor y por API.
 */
import type {
  DireccionGeo,
  ProveedorGeolocalizacion,
  SugerenciaDireccion,
} from "./proveedor";
import { ErrorGeolocalizacion } from "./proveedor";

const BASE = "https://maps.googleapis.com/maps/api";

function componente(componentes: any[], tipo: string): string | null {
  return componentes?.find((c) => c.types?.includes(tipo))?.long_name ?? null;
}

export class ProveedorGoogle implements ProveedorGeolocalizacion {
  readonly nombre = "google";
  constructor(private readonly apiKey = process.env.GOOGLE_MAPS_API_KEY ?? "") {}

  disponible() {
    return this.apiKey.length > 0;
  }

  private async pedir(url: string) {
    const respuesta = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!respuesta.ok) throw new ErrorGeolocalizacion(`Google respondió ${respuesta.status}`, "RED");
    const datos = await respuesta.json();
    if (datos.status === "OVER_QUERY_LIMIT") throw new ErrorGeolocalizacion("Cuota de Google agotada", "LIMITE");
    if (datos.status === "REQUEST_DENIED") throw new ErrorGeolocalizacion("Clave de Google rechazada", "NO_CONFIGURADO");
    return datos;
  }

  async geocodificacionInversa(lat: number, lng: number): Promise<DireccionGeo | null> {
    if (!this.disponible()) throw new ErrorGeolocalizacion("Falta GOOGLE_MAPS_API_KEY", "NO_CONFIGURADO");
    const url = `${BASE}/geocode/json?latlng=${lat},${lng}&language=es&region=pe&key=${this.apiKey}`;
    const datos = await this.pedir(url);
    const resultado = datos.results?.[0];
    if (!resultado) return null;
    const c = resultado.address_components ?? [];

    return {
      direccionCompleta: resultado.formatted_address,
      direccionCorta: componente(c, "route")
        ? [componente(c, "route"), componente(c, "street_number")].filter(Boolean).join(" ")
        : null,
      // En Perú: administrative_area_level_1 = departamento, level_2 = provincia, locality/level_3 = distrito.
      departamento: componente(c, "administrative_area_level_1"),
      provincia: componente(c, "administrative_area_level_2"),
      distrito: componente(c, "locality") ?? componente(c, "administrative_area_level_3"),
      via: componente(c, "route"),
      numero: componente(c, "street_number"),
      codigoPostal: componente(c, "postal_code"),
      latitud: resultado.geometry?.location?.lat ?? lat,
      longitud: resultado.geometry?.location?.lng ?? lng,
      referencia: resultado.place_id ?? null,
    };
  }

  async autocompletar(texto: string, sesion?: string): Promise<SugerenciaDireccion[]> {
    if (!this.disponible()) throw new ErrorGeolocalizacion("Falta GOOGLE_MAPS_API_KEY", "NO_CONFIGURADO");
    const url =
      `${BASE}/place/autocomplete/json?input=${encodeURIComponent(texto)}` +
      `&language=es&components=country:pe&key=${this.apiKey}` +
      (sesion ? `&sessiontoken=${encodeURIComponent(sesion)}` : "");
    const datos = await this.pedir(url);
    return (datos.predictions ?? []).map((p: any) => ({
      descripcion: p.description,
      referencia: p.place_id,
      principal: p.structured_formatting?.main_text,
      secundario: p.structured_formatting?.secondary_text,
    }));
  }

  async detalle(referencia: string, sesion?: string): Promise<DireccionGeo | null> {
    if (!this.disponible()) throw new ErrorGeolocalizacion("Falta GOOGLE_MAPS_API_KEY", "NO_CONFIGURADO");
    const url =
      `${BASE}/place/details/json?place_id=${encodeURIComponent(referencia)}` +
      `&fields=formatted_address,geometry,address_component&language=es&key=${this.apiKey}` +
      (sesion ? `&sessiontoken=${encodeURIComponent(sesion)}` : "");
    const datos = await this.pedir(url);
    const r = datos.result;
    if (!r) return null;
    const c = r.address_components ?? [];
    return {
      direccionCompleta: r.formatted_address,
      direccionCorta: componente(c, "route")
        ? [componente(c, "route"), componente(c, "street_number")].filter(Boolean).join(" ")
        : null,
      departamento: componente(c, "administrative_area_level_1"),
      provincia: componente(c, "administrative_area_level_2"),
      distrito: componente(c, "locality") ?? componente(c, "administrative_area_level_3"),
      via: componente(c, "route"),
      numero: componente(c, "street_number"),
      codigoPostal: componente(c, "postal_code"),
      latitud: r.geometry?.location?.lat,
      longitud: r.geometry?.location?.lng,
      referencia,
    };
  }
}
