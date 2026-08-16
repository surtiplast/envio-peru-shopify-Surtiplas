/**
 * El distrito peruano dentro de la dirección de Shopify.
 *
 * Shopify no expone un campo propio para el distrito: internamente lo llama
 * `neighborhood` y lo guarda DENTRO de `address2`, separado por un carácter
 * invisible (U+2060). El checkout lo muestra como un campo aparte llamado
 * "Distrito", pero por la API viaja pegado a la línea 2.
 *
 * Nunca construyas ese formato a mano: el paquete oficial `@shopify/worldwide`
 * sabe cómo lo compone cada país y cambia con el tiempo.
 */
import { concatenateAddress2, splitAddress2 } from "@shopify/worldwide";

const PERU = "PE";

/**
 * Compone el `address2` que espera Shopify a partir de la referencia del
 * comprador y el distrito.
 *
 * Ejemplo: ("Dpto. 401", "Magdalena del Mar") produce una cadena que el
 * checkout separa en Referencia = "Dpto. 401" y Distrito = "Magdalena del Mar".
 */
export function componerAddress2(referencia: string | null, distrito: string | null): string {
  const compuesto = concatenateAddress2({
    countryCode: PERU,
    ...(referencia ? { line2: referencia } : {}),
    ...(distrito ? { neighborhood: distrito } : {}),
  });
  // Si el país no define formato extendido devuelve null; caemos a la referencia.
  return compuesto ?? referencia ?? "";
}

/** Extrae la referencia y el distrito de un `address2` que llega de Shopify. */
export function separarAddress2(address2: string | null | undefined): {
  referencia: string | null;
  distrito: string | null;
} {
  if (!address2) return { referencia: null, distrito: null };

  const partes = splitAddress2(PERU, address2);
  if (!partes) return { referencia: address2, distrito: null };

  return {
    referencia: partes.line2 ?? null,
    // Si el comprador escribió a mano sin la marca invisible, todo cae en line2
    // y no hay distrito que extraer. Es correcto: no inventamos uno.
    distrito: partes.neighborhood ?? null,
  };
}
