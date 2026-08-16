/**
 * Contrato del proveedor de geolocalización.
 *
 * Toda la app habla ÚNICAMENTE con esta interfaz. Cambiar de Google a otro
 * proveedor es cambiar una variable de entorno, no tocar el código.
 * Las claves viven solo en el servidor: el navegador nunca ve una API key.
 */

export interface DireccionGeo {
  /** Texto completo tal como lo devuelve el proveedor. */
  direccionCompleta: string;
  /**
   * Calle y número, sin el nombre del edificio ni la cola administrativa.
   *
   * `direccionCompleta` empieza por el punto de interés más cercano
   * ("Confederación Nacional de Cooperativas del Perú, 758, Jirón…") y termina
   * repitiendo distrito, provincia, departamento y país. Todo eso ya viaja en
   * sus propios campos, así que meterlo en la línea de dirección del pedido
   * solo la ensucia y confunde a quien reparte.
   */
  direccionCorta?: string | null;
  /** Componentes crudos, antes de normalizar contra el UBIGEO. */
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  /**
   * Otros nombres que podrían ser el distrito.
   *
   * Los geocodificadores no coinciden en qué campo guarda el distrito peruano:
   * a veces está en `suburb`, a veces en `city`, y a veces `suburb` trae la
   * urbanización, que no existe en el catálogo del INEI. En lugar de apostar
   * por un campo, se prueban todos contra el catálogo y gana el primero que
   * resuelve.
   */
  candidatosDistrito?: string[] | null;
  via?: string | null;
  numero?: string | null;
  codigoPostal?: string | null;
  latitud: number;
  longitud: number;
  /** Identificador del proveedor, útil para pedir el detalle después. */
  referencia?: string | null;
}

export interface SugerenciaDireccion {
  descripcion: string;
  referencia: string;
  principal?: string;
  secundario?: string;
}

export interface ProveedorGeolocalizacion {
  readonly nombre: string;
  /** ¿Está configurado y utilizable? */
  disponible(): boolean;
  /** Coordenadas -> dirección. */
  geocodificacionInversa(lat: number, lng: number): Promise<DireccionGeo | null>;
  /** Texto -> sugerencias (autocompletado). */
  autocompletar(texto: string, sesion?: string): Promise<SugerenciaDireccion[]>;
  /** Sugerencia -> dirección con coordenadas. */
  detalle(referencia: string, sesion?: string): Promise<DireccionGeo | null>;
}

export class ErrorGeolocalizacion extends Error {
  constructor(
    message: string,
    readonly codigo: "NO_CONFIGURADO" | "LIMITE" | "RED" | "SIN_RESULTADOS" | "DESCONOCIDO" = "DESCONOCIDO",
  ) {
    super(message);
    this.name = "ErrorGeolocalizacion";
  }
}
