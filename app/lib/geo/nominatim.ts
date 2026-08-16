/**
 * Implementación con Nominatim (OpenStreetMap). Sirve como alternativa gratuita
 * y como prueba de que la interfaz es realmente intercambiable.
 *
 * Nominatim exige un User-Agent identificable y limita a 1 petición/segundo:
 * úsalo solo para volúmenes bajos o monta tu propia instancia.
 */
import type { DireccionGeo, ProveedorGeolocalizacion, SugerenciaDireccion } from "./proveedor";
import { ErrorGeolocalizacion } from "./proveedor";

/**
 * Caché en memoria de las respuestas de Nominatim.
 *
 * Su servidor público limita a una petición por segundo y responde 429 cuando
 * se pasa, contando por IP: en Render esa IP se comparte con otras apps, así
 * que el límite se agota sin que nosotros hagamos casi nada. Guardar lo ya
 * consultado reduce bastante las llamadas —dos compradores del mismo edificio,
 * o el mismo que reintenta, no gastan cuota— aunque no elimina el problema.
 */
const CACHE = new Map<string, { valor: unknown; expira: number }>();
const VIDA_CACHE_MS = 10 * 60 * 1000;
const MAX_CACHE = 500;

function deCache<T>(clave: string): T | null {
  const entrada = CACHE.get(clave);
  if (!entrada) return null;
  if (Date.now() > entrada.expira) {
    CACHE.delete(clave);
    return null;
  }
  return entrada.valor as T;
}

function aCache(clave: string, valor: unknown) {
  // Sin tope, un proceso largo acabaría acumulando memoria sin control.
  if (CACHE.size >= MAX_CACHE) {
    const primera = CACHE.keys().next().value;
    if (primera) CACHE.delete(primera);
  }
  CACHE.set(clave, { valor, expira: Date.now() + VIDA_CACHE_MS });
}

export class ProveedorNominatim implements ProveedorGeolocalizacion {
  readonly nombre = "nominatim";
  constructor(
    private readonly base = process.env.NOMINATIM_BASE_URL ?? "https://nominatim.openstreetmap.org",
    private readonly userAgent = process.env.NOMINATIM_USER_AGENT ?? "envio-peru-app/1.0",
  ) {}

  disponible() {
    return this.base.length > 0;
  }

  private async pedir(url: string) {
    const r = await fetch(url, {
      headers: { "User-Agent": this.userAgent, "Accept-Language": "es" },
      signal: AbortSignal.timeout(6000),
    });
    // El 429 es "vuelve más tarde", no un error nuestro: se marca aparte para
    // poder decírselo al comprador con claridad.
    if (r.status === 429) {
      throw new ErrorGeolocalizacion("Nominatim respondió 429 (límite de peticiones)", "LIMITE");
    }
    if (!r.ok) throw new ErrorGeolocalizacion(`Nominatim respondió ${r.status}`, "RED");
    return r.json();
  }

  private aDireccion(d: any): DireccionGeo {
    const a = d.address ?? {};

    /**
     * En Perú, Nominatim reparte el distrito entre varios campos según la zona:
     * en Lima suele venir en `city_district` o `suburb`, en provincia en `town`
     * o `city`, y a veces `suburb` trae la urbanización (que no es un distrito).
     * Se pasan todos y el catálogo decide.
     */
    const candidatos = [
      a.city_district,
      a.suburb,
      a.municipality,
      a.town,
      a.village,
      a.city,
      a.borough,
      a.quarter,
      a.neighbourhood,
    ].filter((v: unknown): v is string => typeof v === "string" && v.trim().length > 0);

    // "Jirón Mariscal Ramón Castilla 758": la calle y el número, que es lo que
    // el repartidor necesita. Sin calle no inventamos nada y se deja vacío.
    const via = a.road ?? null;
    const numero = a.house_number ?? null;

    return {
      direccionCompleta: d.display_name,
      direccionCorta: via ? [via, numero].filter(Boolean).join(" ") : null,
      departamento: a.state ?? a.region ?? null,
      provincia: a.county ?? a.state_district ?? a.province ?? null,
      distrito: candidatos[0] ?? null,
      candidatosDistrito: candidatos,
      via: a.road ?? null,
      numero: a.house_number ?? null,
      codigoPostal: a.postcode ?? null,
      latitud: Number(d.lat),
      longitud: Number(d.lon),
      referencia: d.osm_id ? `${d.osm_type}/${d.osm_id}` : null,
    };
  }

  async geocodificacionInversa(lat: number, lng: number) {
    // Cuatro decimales son unos 11 metros: suficiente para el distrito, y hace
    // que dos compradores del mismo portal compartan la misma consulta.
    const clave = `inv:${lat.toFixed(4)},${lng.toFixed(4)}`;
    const guardada = deCache<DireccionGeo | null>(clave);
    if (guardada !== null) return guardada;

    const url = `${this.base}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1`;
    const d = await this.pedir(url);
    const direccion = d && !d.error ? this.aDireccion(d) : null;
    aCache(clave, direccion);
    return direccion;
  }

  async autocompletar(texto: string): Promise<SugerenciaDireccion[]> {
    const clave = `bus:${texto.trim().toLowerCase()}`;
    const guardadas = deCache<SugerenciaDireccion[]>(clave);
    if (guardadas) return guardadas;

    const url = `${this.base}/search?format=jsonv2&countrycodes=pe&addressdetails=1&limit=8&q=${encodeURIComponent(texto)}`;
    const datos = await this.pedir(url);
    const sugerencias = (datos ?? []).map((d: any) => ({
      descripcion: d.display_name,
      referencia: `${d.lat},${d.lon}`,
      principal: d.name || d.display_name.split(",")[0],
      secundario: d.display_name.split(",").slice(1).join(",").trim(),
    }));
    aCache(clave, sugerencias);
    return sugerencias;
  }

  async detalle(referencia: string) {
    const [lat, lon] = referencia.split(",").map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return this.geocodificacionInversa(lat, lon);
  }
}
