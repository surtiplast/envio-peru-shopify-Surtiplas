import crypto from "node:crypto";
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { exigirProxy } from "../lib/security/proxy.server";
import { claveDePeticion, permitido } from "../lib/security/limite.server";
import { ajustesDe, aparienciaDe, obtenerOCrearTienda, registrarEvento } from "../lib/shopify/tienda.server";
import { cotizarParaTienda } from "../lib/rates/consulta.server";
import { limpiar, normalizarTelefono, validarDatosEnvio } from "../lib/security/validacion";
import { obtenerDistrito } from "../lib/ubigeo/catalogo";
import { fechaIsoValida } from "../lib/fecha";
import { componerAddress2 } from "../lib/ubigeo/direccion";

/**
 * Paso final del formulario: valida, recalcula la tarifa EN EL SERVIDOR y
 * prepara el salto al checkout oficial de Shopify.
 *
 * Punto importante de seguridad: el costo de envío que envía el navegador se
 * IGNORA. Se vuelve a calcular aquí con los mismos datos con los que responderá
 * el CarrierService. Confiar en el precio que manda el cliente sería regalar
 * envíos gratis a quien sepa abrir las herramientas de desarrollo.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = exigirProxy(request);

  if (!permitido(claveDePeticion(request, "confirmar"), 30)) {
    return json({ ok: false, errores: [{ campo: "general", mensaje: "Demasiados intentos." }] }, { status: 429 });
  }

  const cuerpo = await request.json().catch(() => null);
  if (!cuerpo?.datos) return json({ ok: false, errores: [{ campo: "general", mensaje: "Petición inválida." }] }, { status: 400 });

  const tienda = await obtenerOCrearTienda(shop);
  const [ajustes, apariencia] = await Promise.all([ajustesDe(tienda.id), aparienciaDe(tienda.id)]);

  const entrada = cuerpo.datos;
  const metodo = String(entrada.metodo ?? "").toUpperCase();

  const errores = validarDatosEnvio(
    { ...entrada, metodo },
    {
      exigirTelefono: apariencia.mostrarTelefono,
      exigirReferencia: apariencia.mostrarReferencia,
      exigirTerminos: apariencia.mostrarTerminos && ajustes.terminosObligatorio,
      exigirDocumento: false, // el documento ayuda, pero no bloquea la compra
    },
  );
  if (errores.length) return json({ ok: false, errores });

  // --- Subtotal real, tomado del carrito de Shopify, no del navegador -------
  const subtotal = Math.max(0, Math.round(Number(cuerpo.subtotal ?? 0)));

  let costo = 0;
  let etiqueta = "";
  let ubigeo: string | null = null;
  let distrito = null;
  /** Sede elegida, cuando el método es recojo. */
  let sede: { id: string; nombre: string; direccion: string; referencia: string | null } | null = null;

  if (metodo === "RECOJO") {
    const punto = await prisma.puntoRecojo.findFirst({
      where: { id: String(entrada.puntoRecojoId), shopId: tienda.id, activo: true },
    });
    if (!punto) {
      return json({ ok: false, errores: [{ campo: "puntoRecojoId", mensaje: "Esa sede ya no está disponible." }] });
    }
    costo = Math.round(Number(punto.costo) * 100);
    etiqueta = `${ajustes.etiquetaRecojo} — ${punto.nombre}`;
    sede = {
      id: punto.id,
      nombre: punto.nombre,
      direccion: punto.direccion,
      referencia: punto.referencia,
    };

    /**
     * La dirección de la SEDE hace de dirección de envío.
     *
     * Shopify no pide tarifas al CarrierService hasta que el checkout tiene una
     * dirección completa. En un recojo el comprador no escribe ninguna, así que
     * el checkout se queda en "Ingresa tu dirección para ver los métodos" y la
     * opción de recojo no llega a aparecer. Mandando la dirección de la tienda
     * el checkout sí consulta, y nosotros devolvemos únicamente el recojo.
     *
     * Además el pedido queda con la dirección de la sede, que es justo donde
     * hay que dejar el paquete preparado.
     */
    if (punto.ubigeo) {
      ubigeo = punto.ubigeo;
      distrito = obtenerDistrito(punto.ubigeo);
    }
  } else {
    ubigeo = limpiar(entrada.ubigeo, 6);
    distrito = obtenerDistrito(ubigeo);
    if (!distrito) {
      return json({ ok: false, errores: [{ campo: "ubigeo", mensaje: "Distrito no reconocido." }] });
    }

    const cotizacion = await cotizarParaTienda(tienda.id, ubigeo, subtotal);
    const elegida = cotizacion.opciones.find((o) => o.tipo === metodo);
    if (!elegida) {
      return json({
        ok: false,
        errores: [{ campo: "metodo", mensaje: "Esa opción de entrega ya no está disponible para tu distrito." }],
      });
    }
    costo = elegida.costo;
    etiqueta = elegida.etiqueta;
  }

  // --- Guardamos la sesión de envío ---------------------------------------
  const token = crypto.randomBytes(24).toString("base64url");
  const datosLimpios = {
    nombre: limpiar(entrada.nombre, 60),
    apellido: limpiar(entrada.apellido, 60),
    email: limpiar(entrada.email, 254).toLowerCase(),
    telefono: normalizarTelefono(limpiar(entrada.telefono, 20)),
    tipoComprobante: limpiar(entrada.tipoComprobante, 10).toUpperCase() === "FACTURA" ? "FACTURA" : "BOLETA",
    tipoDocumento: limpiar(entrada.tipoDocumento, 8).toUpperCase() || null,
    /**
     * El carné de extranjería admite letras; el DNI y el RUC, no.
     *
     * Por eso el filtrado depende del tipo: si a un CE le quitáramos las letras
     * guardaríamos un número que no es el del documento.
     */
    numeroDocumento:
      (limpiar(entrada.tipoDocumento, 8).toUpperCase() === "CE"
        ? limpiar(entrada.numeroDocumento, 15).replace(/[^0-9A-Za-z]/g, "").toUpperCase()
        : limpiar(entrada.numeroDocumento, 15).replace(/\D/g, "")) || null,
    razonSocial: limpiar(entrada.razonSocial, 200) || null,
    // Solo se acepta el formato ISO que exige el metacampo estándar de Shopify,
    // y además una fecha que exista de verdad: "2025-02-31" cumple el formato
    // pero Shopify la rechaza al guardar.
    fechaNacimiento: fechaIsoValida(limpiar(entrada.fechaNacimiento, 10))
      ? limpiar(entrada.fechaNacimiento, 10)
      : null,
    direccion: limpiar(entrada.direccion, 200),
    referencia: limpiar(entrada.referencia, 200) || null,
    ubigeo,
    departamento: distrito?.departamento ?? null,
    provincia: distrito?.provincia ?? null,
    distrito: distrito?.distrito ?? null,
    metodo,
    puntoRecojoId: metodo === "RECOJO" ? limpiar(entrada.puntoRecojoId, 40) : null,
    latitud: Number.isFinite(Number(entrada.latitud)) ? Number(entrada.latitud) : null,
    longitud: Number.isFinite(Number(entrada.longitud)) ? Number(entrada.longitud) : null,
    // Consentimientos de marketing. Solo se acepta el sí explícito; cualquier
    // otro valor queda en false, nunca se asume el consentimiento.
    aceptaMarketingEmail: entrada.aceptaMarketingEmail === true,
    aceptaMarketingSms: entrada.aceptaMarketingSms === true,
  };

  await prisma.sesionEnvio.create({
    data: {
      shopId: tienda.id,
      token,
      cartToken: cuerpo.cartToken ? String(cuerpo.cartToken).slice(0, 100) : null,
      datos: datosLimpios as object,
      metodo: metodo as "ESTANDAR" | "EXPRESS" | "RECOJO",
      ubigeo,
      costo: (costo / 100).toFixed(2),
      subtotal: (subtotal / 100).toFixed(2),
      // 24 h es de sobra para completar un pago y evita acumular datos personales.
      expiraEn: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  await registrarEvento(tienda.id, "formulario.confirmado", `${etiqueta} — ${datosLimpios.distrito ?? "recojo"}`, {
    ubigeo,
    costo,
    metodo,
  });

  /**
   * Atributos del carrito.
   *
   * Es la única forma soportada de que un dato nuestro llegue intacto al pedido:
   * Shopify los copia del carrito a la orden como note_attributes. Los que
   * empiezan por "_" no se muestran al comprador en el checkout.
   */
  const atributos: Record<string, string> = {
    _envio_token: token,
    _ubigeo: ubigeo ?? "",
    // Los lee el callback del CarrierService para ofrecer solo esta opción,
    // con el nombre de la sede cuando es recojo.
    _metodo: metodo,
    _sede: metodo === "RECOJO" ? etiqueta.replace(/^.*?—\s*/, "") : "",
    "Método de entrega": etiqueta,
    "Costo de envío": `S/ ${(costo / 100).toFixed(2)}`,
  };
  if (datosLimpios.departamento) atributos["Departamento"] = datosLimpios.departamento;
  if (datosLimpios.provincia) atributos["Provincia"] = datosLimpios.provincia;
  if (datosLimpios.distrito) atributos["Distrito"] = datosLimpios.distrito;
  if (datosLimpios.referencia) atributos["Referencia"] = datosLimpios.referencia;
  if (datosLimpios.fechaNacimiento) {
    // Lo lee el webhook de pedidos para guardarlo en el cliente.
    atributos["_cumple"] = datosLimpios.fechaNacimiento;
  }
  // El webhook de pedidos los convierte en suscripción real del cliente.
  if (datosLimpios.aceptaMarketingEmail) atributos["_mkt_email"] = "1";
  if (datosLimpios.aceptaMarketingSms) atributos["_mkt_sms"] = "1";

  atributos["Tipo de comprobante"] =
    datosLimpios.tipoComprobante === "FACTURA" ? "Factura electrónica" : "Boleta electrónica";

  if (datosLimpios.numeroDocumento) {
    const nombreCampo =
      datosLimpios.tipoDocumento === "RUC" ? "RUC" : datosLimpios.tipoDocumento === "CE" ? "CE" : "DNI";
    atributos[nombreCampo] = datosLimpios.numeroDocumento;
    // Nombres genéricos, por si la app de facturación busca estas claves.
    atributos["Tipo de documento"] = datosLimpios.tipoDocumento ?? "";
    atributos["Número de documento"] = datosLimpios.numeroDocumento;
  }
  if (datosLimpios.razonSocial) atributos["Razón social"] = datosLimpios.razonSocial;
  if (metodo === "RECOJO" && sede) {
    atributos["Sede de recojo"] = etiqueta;
    atributos["Dirección de la sede"] = sede.direccion;
    // Lo lee el CarrierService para construir la tarifa desde la sede misma.
    atributos["_sede_id"] = sede.id;
  }

  /**
   * Precarga del checkout.
   *
   * Shopify admite estos parámetros en la URL del checkout (los mismos que
   * documenta para los cart permalinks). No existe una API pública para
   * rellenar el checkout por completo: lo que no está en esta lista, el
   * comprador lo confirma en el checkout. Por eso mandamos además todo en los
   * atributos, que sí llegan enteros al pedido.
   */
  const params = new URLSearchParams();
  params.set("checkout[email]", datosLimpios.email);
  params.set("checkout[shipping_address][first_name]", datosLimpios.nombre);
  params.set("checkout[shipping_address][last_name]", datosLimpios.apellido);
  params.set("checkout[shipping_address][phone]", datosLimpios.telefono);
  params.set("checkout[shipping_address][country]", "Peru");

  /**
   * El documento va al campo "Empresa" (company) del checkout.
   *
   * Es el único campo nativo de Shopify donde cabe un dato así, y muchos temas
   * y apps de facturación peruanas lo reetiquetan como "RUC/DNI". Si tu tema no
   * lo hace, el dato viaja igualmente en los atributos del carrito y llega al
   * pedido.
   */
  if (datosLimpios.numeroDocumento) {
    /**
     * Con RUC se manda "número - razón social" en el mismo campo.
     *
     * Shopify solo ofrece `company` para esto, así que ahí van los dos datos
     * juntos: el comerciante ve de un vistazo a qué empresa factura sin abrir
     * los atributos del pedido.
     *
     * Si tu app de facturación lee este campo esperando SOLO el número, quita
     * la razón social de aquí; el dato sigue viajando aparte en el atributo
     * "Razón social".
     */
    const empresa =
      datosLimpios.tipoDocumento === "RUC" && datosLimpios.razonSocial
        ? `${datosLimpios.numeroDocumento} - ${datosLimpios.razonSocial}`
        : datosLimpios.numeroDocumento;

    params.set("checkout[shipping_address][company]", empresa);
    params.set("checkout[billing_address][company]", empresa);
  }

  if (distrito) {
    // En recojo, la calle es la de la sede; en despacho, la que escribió el comprador.
    const calle = sede ? sede.direccion : datosLimpios.direccion;
    const referencia = sede ? sede.referencia : datosLimpios.referencia;

    params.set("checkout[shipping_address][address1]", calle);
    /**
     * Correspondencia con la jerarquía peruana, según confirmó el soporte de
     * Shopify:
     *   `city`      → el checkout lo etiqueta "Provincia"  → PROVINCIA
     *   `province`  → el checkout lo etiqueta "Región"     → DEPARTAMENTO
     *   `address2`  → contiene la Referencia Y el Distrito, unidos con el
     *                 formato que exige Shopify (ver lib/ubigeo/direccion.ts)
     *
     * El código postal se deja libre para un código postal de verdad.
     */
    const address2 = componerAddress2(referencia, distrito.distrito);

    params.set("checkout[shipping_address][city]", distrito.provincia);
    params.set("checkout[shipping_address][province]", distrito.departamento);
    params.set("checkout[shipping_address][address2]", address2);

    /**
     * NO añadas aquí un parámetro suelto para el distrito.
     *
     * Se probaron `neighborhood` y `district`. Ninguno funciona: la precarga
     * por URL no acepta ese campo, se llame como se llame.
     *
     * El distrito viaja dentro de `address2` con el formato oficial de Shopify
     * para Perú, y ese es el único canal. Que el checkout lo separe y lo pinte
     * en su recuadro depende de que la tienda tenga activado el campo nativo
     * «Distrito» (Neighborhood), que Shopify habilita tienda por tienda a
     * petición del comerciante. Ver docs/DISTRITO-EN-SHOPIFY.md.
     */

    /**
     * Traza para saber qué mandamos de verdad.
     *
     * El distrito viaja dentro de address2 separado por un carácter invisible.
     * Cuando el campo Distrito llega vacío al checkout es imposible saber, solo
     * mirando la pantalla, si el fallo es nuestro o de Shopify. Aquí se anota
     * si la marca separadora está puesta y qué distrito se envió; el texto que
     * escribió el comprador NO se guarda.
     */
    registrarEvento(
      tienda.id,
      "checkout.direccion",
      `distrito="${distrito.distrito}" marca=${address2.includes("\u2060")} largo=${address2.length}`,
      undefined,
      "DEBUG",
    ).catch(() => null);

    /**
     * La dirección de facturación recibe lo mismo.
     *
     * Aunque el comprador marque "la misma dirección de envío", el checkout
     * muestra el bloque de facturación con sus propios campos cuando pide
     * factura. Si no los rellenamos, aparecen vacíos y bloquean el pago.
     */
    params.set("checkout[billing_address][first_name]", datosLimpios.nombre);
    params.set("checkout[billing_address][last_name]", datosLimpios.apellido);
    params.set("checkout[billing_address][address1]", calle);
    params.set("checkout[billing_address][address2]", address2);
    params.set("checkout[billing_address][city]", distrito.provincia);
    params.set("checkout[billing_address][province]", distrito.departamento);
    params.set("checkout[billing_address][country]", "Peru");
    params.set("checkout[billing_address][phone]", datosLimpios.telefono);
  }

  /**
   * Propiedades de línea, para el CarrierService.
   *
   * Es la parte que faltaba. Shopify NO envía los atributos del carrito a la
   * llamada del CarrierService: su petición solo trae `items[].properties`
   * (confirmado en la referencia de carrierService). Todo lo que la app
   * necesite durante el cálculo de tarifas tiene que ir aquí, línea por línea.
   *
   * Las claves que empiezan por "_" no se le muestran al comprador.
   */
  const propiedades: Record<string, string> = {
    _envio_token: token,
    _metodo: metodo,
  };
  if (ubigeo) propiedades["_ubigeo"] = ubigeo;
  if (sede) {
    propiedades["_sede_id"] = sede.id;
    propiedades["_sede"] = sede.nombre;
  }

  return json({
    ok: true,
    token,
    costo,
    etiqueta,
    atributos,
    propiedades,
    urlCheckout: `/checkout?${params.toString()}`,
  });
};
