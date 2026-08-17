import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import {
  useAttributes,
  useShippingAddress,
  useApplyShippingAddressChange,
} from "@shopify/ui-extensions/checkout/preact";
import { concatenateAddress2, splitAddress2 } from "@shopify/worldwide";

/**
 * Rellena el campo «Distrito» del checkout.
 *
 * ------------------------------------------------------------------
 * Por qué existe esta extensión
 * ------------------------------------------------------------------
 * En Perú, el checkout muestra campos de dirección adicionales: el recuadro
 * «Distrito» es el campo `neighborhood`, que no tiene columna propia. Shopify
 * lo guarda dentro de `address2`, unido a la línea 2 con el carácter invisible
 * U+2060, en el formato que define su librería @shopify/worldwide.
 *
 * La app ya manda ese `address2` en la URL del checkout, con la cadena exacta
 * que produce la librería de Shopify (verificado byte a byte). Pero la
 * precarga por URL descarta la parte del distrito. No hay parámetro que lo
 * arregle: la única vía admitida es volver a aplicar la dirección ya dentro
 * del checkout, que es lo que hace esta extensión.
 *
 * Verificado funcionando el 14/08/2026 en una tienda peruana: el checkout
 * recibe «12» en Apartamento y «Pueblo Libre» en Distrito.
 *
 * ------------------------------------------------------------------
 * MODO DIAGNÓSTICO
 * ------------------------------------------------------------------
 * Con `DIAGNOSTICO` en true, la extensión escribe en la consola del navegador
 * lo que lee y el resultado del intento. Sirve para distinguir fallos que
 * desde fuera se ven igual:
 *
 *   - No hay ninguna línea     → la extensión no se está ejecutando
 *                                (no se desplegó, o la app no se reinstaló).
 *   - «sin atributo Distrito»  → el atributo del carrito no llegó.
 *   - «NO disponible»          → falta permiso de datos protegidos (la API de
 *                                direcciones exige nivel 2, campo Address).
 *
 * DEBE quedar en false en producción: un comerciante no tiene por qué ver
 * mensajes nuestros en la consola de su checkout.
 *
 * Nota: no intentes pintar un banner aquí. Se probó con <s-banner> y en esta
 * versión de la API no renderiza nada, lo que hace creer que la extensión no
 * se ejecuta cuando sí lo hace. La consola es fiable; el banner no.
 */
const DIAGNOSTICO = true;

export default function extension() {
  render(<Extension />, document.body);
}

function Extension() {
  const direccion = useShippingAddress();
  const atributos = useAttributes();
  const aplicarCambio = useApplyShippingAddressChange();

  const [traza, setTraza] = useState("iniciando");

  useEffect(() => {
    let cancelado = false;
    const anotar = (t) => {
      if (!cancelado) setTraza(t);
      if (DIAGNOSTICO) console.log("[envio-peru][distrito]", t);
    };

    try {
      if (!direccion) return anotar("sin dirección todavía");

      // Solo Perú: en otros países ese campo no existe y tocar la dirección
      // solo puede estropear lo que el comprador ya escribió.
      const pais = direccion.countryCode ?? "";
      if (pais !== "PE") return anotar(`país ${pais || "?"}, no aplica`);

      const actual = direccion.address2 ?? "";

      // ¿El distrito ya está dentro de address2? Entonces no hay nada que hacer.
      const partido = actual ? splitAddress2("PE", actual) : null;
      if (partido?.neighborhood) {
        return anotar(`ya estaba: ${partido.neighborhood}`);
      }

      // El distrito y la referencia salen de los atributos del carrito, que el
      // formulario de la app escribe antes de saltar al checkout.
      const leer = (clave) =>
        (atributos ?? []).find((a) => a?.key === clave)?.value ?? "";

      const distrito = leer("Distrito").trim();
      if (!distrito) {
        return anotar(
          `sin atributo Distrito (hay ${(atributos ?? []).length} atributos)`,
        );
      }

      // La referencia que ya esté en pantalla manda: si el comprador la editó
      // en el checkout, se respeta. Solo si está vacía usamos la del carrito.
      const referencia = actual.trim() || leer("Referencia").trim();

      const nuevo = concatenateAddress2({
        countryCode: "PE",
        line2: referencia || undefined,
        neighborhood: distrito,
      });

      if (!nuevo) return anotar("concatenateAddress2 devolvió null");
      if (nuevo === actual) return anotar("address2 ya era el correcto");

      if (typeof aplicarCambio !== "function") {
        return anotar("applyShippingAddressChange NO disponible (¿permisos?)");
      }

      anotar(`aplicando "${distrito}"…`);

      // Solo se manda address2: los demás campos conservan su valor, así que
      // no pisamos nada de lo que el comprador haya escrito.
      aplicarCambio({
        type: "updateShippingAddress",
        address: { address2: nuevo },
      })
        .then((r) => {
          if (r?.type === "success") return anotar(`OK: ${distrito}`);
          const motivo =
            r?.errors?.map((e) => e?.message).filter(Boolean).join(" | ") ||
            r?.type ||
            "sin detalle";
          anotar(`RECHAZADO: ${motivo}`);
        })
        .catch((e) => anotar(`ERROR: ${e?.message ?? e}`));
    } catch (e) {
      // Un fallo aquí nunca debe impedir pagar. El pedido se corrige igual
      // desde el webhook orders/create, que repone el distrito.
      anotar(`EXCEPCIÓN: ${e?.message ?? e}`);
    }

    return () => {
      cancelado = true;
    };
    // Se reintenta si cambian la dirección o los atributos: al principio del
    // checkout la dirección puede llegar vacía.
  }, [direccion, atributos, aplicarCambio]);

  if (!DIAGNOSTICO) return null;

  return (
    <s-banner tone="info">
      <s-text>distrito-checkout: {traza}</s-text>
    </s-banner>
  );
}
