import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation, useRevalidator } from "@remix-run/react";
import {
  Badge, Banner, BlockStack, Box, Button, InlineGrid, InlineStack,
  Card, Layout, Page, Text,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { ajustesDe, obtenerOCrearTienda } from "../lib/shopify/tienda.server";
import { registrarCarrierService } from "../lib/shopify/carrier.server";
import { urlDeLaApp } from "../lib/url.server";
import prisma from "../db.server";
import { proveedorGeo } from "../lib/geo/index.server";
import { proveedorDocumentos } from "../lib/documents/index.server";
import { CampoCheck, CampoSelect, CampoTexto } from "../components/campos";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const tienda = await obtenerOCrearTienda(session.shop);
  const ajustes = await ajustesDe(tienda.id);
  return {
    ajustes: {
      ...ajustes,
      costoPorDefecto: ajustes.costoPorDefecto ? Number(ajustes.costoPorDefecto).toFixed(2) : "",
    },
    carrier: {
      estado: tienda.carrierServiceEstado,
      error: tienda.carrierServiceError,
      plan: tienda.planShopify,
      /**
       * Permisos que la tienda concedió DE VERDAD en esta instalación.
       *
       * Cuando el registro del CarrierService falla con HTTP 403, las causas
       * posibles son dos: falta `write_shipping`, o el plan de la tienda no lo
       * admite. Sin ver los permisos reales no hay forma de distinguirlas, y
       * se pierde mucho tiempo probando a ciegas.
       *
       * Ojo: los permisos solo se piden en una instalación NUEVA. Cambiar los
       * scopes y volver a desplegar no amplía una instalación existente.
       */
      permisos: session.scope ?? "",
      tieneWriteShipping: (session.scope ?? "").includes("write_shipping"),
    },
    integraciones: {
      geo: { nombre: proveedorGeo().nombre, disponible: proveedorGeo().disponible() },
      documentos: { nombre: proveedorDocumentos().nombre, disponible: proveedorDocumentos().disponible() },
    },
  };
};

/** Respuesta uniforme: así TypeScript puede estrechar el tipo en la vista. */
type Resultado = { ok: boolean; mensaje: string };

export const action = async ({ request }: ActionFunctionArgs): Promise<Resultado> => {
  const { session, admin } = await authenticate.admin(request);
  const tienda = await obtenerOCrearTienda(session.shop);
  const f = await request.formData();

  if (f.get("accion") === "registrar-carrier") {
    const r = await registrarCarrierService(admin, tienda.id, urlDeLaApp());
    return r.ok
      ? { ok: true, mensaje: "Servicio de tarifas registrado correctamente." }
      : { ok: false, mensaje: r.mensaje };
  }

  const texto = (k: string) => String(f.get(k) ?? "").trim();
  await prisma.ajustes.upsert({
    where: { shopId: tienda.id },
    create: { shopId: tienda.id },
    update: {
      etiquetaEstandar: texto("etiquetaEstandar") || "Envío estándar",
      descripcionEstandar: texto("descripcionEstandar"),
      etiquetaExpress: texto("etiquetaExpress") || "Envío express",
      descripcionExpress: texto("descripcionExpress"),
      etiquetaRecojo: texto("etiquetaRecojo") || "Recojo en tienda",
      descripcionRecojo: texto("descripcionRecojo"),
      politicaSinTarifa: texto("politicaSinTarifa") === "COSTO_FIJO" ? "COSTO_FIJO" : "BLOQUEAR",
      costoPorDefecto: texto("costoPorDefecto") ? Number(texto("costoPorDefecto")).toFixed(2) : null,
      columnaCostoActiva: Number(f.get("columnaCostoActiva") ?? 0),
      terminosTexto: texto("terminosTexto") || null,
      terminosUrl: texto("terminosUrl") || null,
      terminosObligatorio: f.get("terminosObligatorio") === "on",
      contactoWhatsapp: texto("contactoWhatsapp") || null,
      contactoEmail: texto("contactoEmail") || null,
    },
  });

  return { ok: true, mensaje: "Configuración guardada." };
};

export default function Configuracion() {
  /**
   * "Descartar" de la barra de guardado de Shopify.
   *
   * Antes esto hacía `window.location.reload()`, y ahí estaba el fallo: dentro
   * del admin la app va en un iframe y los parámetros de sesión viven en la
   * URL. Una recarga completa los pierde y Shopify responde con la pantalla de
   * "indica tu dominio".
   *
   * En su lugar se vuelven a pedir los datos del servidor (sin recargar) y se
   * cambia la clave del formulario: React lo desmonta y lo vuelve a montar, con
   * lo que los campos se rellenan otra vez con los valores guardados. Los
   * envoltorios de Polaris guardan su valor en estado propio, así que sin
   * remontarlos conservarían lo que el comerciante acababa de escribir.
   */
  const revalidador = useRevalidator();
  const [versionFormulario, setVersionFormulario] = useState(0);
  const descartar = () => {
    revalidador.revalidate();
    setVersionFormulario((v) => v + 1);
  };

  const { ajustes, carrier, integraciones } = useLoaderData<typeof loader>();
  const resultado = useActionData<typeof action>();
  const navegacion = useNavigation();

  return (
    <Page title="Configuración" backAction={{ url: "/app" }}>
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {resultado ? (
              <Banner tone={resultado.ok ? "success" : "critical"} title={resultado.mensaje} />
            ) : null}

            <Form method="post" data-save-bar onReset={descartar} key={versionFormulario}>
              <BlockStack gap="400">
                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">Textos por defecto de los métodos</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Se usan cuando una tarifa concreta no define su propia etiqueta.
                    </Text>
                    <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
                      <CampoTexto label="Etiqueta estándar" name="etiquetaEstandar" valorInicial={ajustes.etiquetaEstandar} />
                      <CampoTexto label="Descripción estándar" name="descripcionEstandar" valorInicial={ajustes.descripcionEstandar} />
                      <CampoTexto label="Etiqueta express" name="etiquetaExpress" valorInicial={ajustes.etiquetaExpress} />
                      <CampoTexto label="Descripción express" name="descripcionExpress" valorInicial={ajustes.descripcionExpress} />
                      <CampoTexto label="Etiqueta recojo" name="etiquetaRecojo" valorInicial={ajustes.etiquetaRecojo} />
                      <CampoTexto label="Descripción recojo" name="descripcionRecojo" valorInicial={ajustes.descripcionRecojo} />
                    </InlineGrid>
                  </BlockStack>
                </Card>

                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">Distritos sin tarifa</Text>
                    <CampoSelect
                      label="¿Qué hacemos si un distrito no tiene tarifa configurada?"
                      name="politicaSinTarifa"
                      options={[
                        { label: "No ofrecer envío (recomendado)", value: "BLOQUEAR" },
                        { label: "Cobrar un costo fijo", value: "COSTO_FIJO" },
                      ]}
                      valorInicial={ajustes.politicaSinTarifa}
                    />
                    <CampoTexto
                      label="Costo fijo (S/)"
                      name="costoPorDefecto"
                      type="number"
                      step={0.01}
                      valorInicial={ajustes.costoPorDefecto}
                    />
                    <CampoSelect
                      label="Columna de costo activa"
                      name="columnaCostoActiva"
                      helpText="Tu CSV admite hasta tres precios por rango. Elige cuál se cobra."
                      options={[
                        { label: "costo (principal)", value: "0" },
                        { label: "costo alternativo 1", value: "1" },
                        { label: "costo alternativo 2", value: "2" },
                      ]}
                      valorInicial={String(ajustes.columnaCostoActiva)}
                    />
                  </BlockStack>
                </Card>

                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">Términos y condiciones</Text>
                    <CampoCheck
                      label="Exigir aceptación antes de continuar al pago"
                      name="terminosObligatorio"
                      marcadoInicial={ajustes.terminosObligatorio}
                    />
                    <CampoTexto
                      label="Enlace a tus términos"
                      name="terminosUrl"
                      valorInicial={ajustes.terminosUrl}
                      placeholder="https://tu-tienda.com/politicas/terminos"
                    />
                    <CampoTexto
                      label="Texto que se muestra junto a la casilla"
                      name="terminosTexto"
                      valorInicial={ajustes.terminosTexto}
                      multiline={4}
                      placeholder="Acepto los términos y condiciones y la política de privacidad."
                    />
                  </BlockStack>
                </Card>

                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">Contacto para zonas sin cobertura</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Cuando el distrito del comprador no tiene tarifa, en vez de dejarlo en un
                      «no llegamos» se le ofrece escribirte. Deja vacío lo que no quieras mostrar.
                    </Text>
                    <CampoTexto
                      label="WhatsApp"
                      name="contactoWhatsapp"
                      valorInicial={ajustes.contactoWhatsapp}
                      placeholder="987 654 321"
                      helpText="Móvil peruano de 9 dígitos. Se abre el chat directamente."
                    />
                    <CampoTexto
                      label="Correo"
                      name="contactoEmail"
                      valorInicial={ajustes.contactoEmail}
                      placeholder="ventas@tu-tienda.com"
                    />
                  </BlockStack>
                </Card>

                <Box>
                  <Button submit variant="primary" loading={navegacion.state === "submitting"}>
                    Guardar configuración
                  </Button>
                </Box>
              </BlockStack>
            </Form>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">Tarifas en el checkout</Text>
                <InlineStack gap="200" blockAlign="center">
                  <Badge tone={carrier.estado === "ACTIVO" ? "success" : carrier.estado === "NO_ELEGIBLE" ? "attention" : "critical"}>
                    {carrier.estado}
                  </Badge>
                  {carrier.plan ? <Text as="span" variant="bodySm" tone="subdued">Plan: {carrier.plan}</Text> : null}
                </InlineStack>
                {carrier.error ? <Text as="p" variant="bodySm" tone="subdued">{carrier.error}</Text> : null}

                {/* Qué hacer, según cuál de las dos causas posibles sea. */}
                {carrier.estado === "NO_ELEGIBLE" ? (
                  <Text as="p" variant="bodySm" tone="subdued">
                    Se habilita con el plan Advanced o superior, con facturación anual, o en
                    tiendas de desarrollo. En otros planes, escribe al soporte de Shopify para
                    añadirla. Después vuelve aquí y pulsa Reintentar.
                  </Text>
                ) : null}

                {carrier.estado === "ERROR" ? (
                  <Text as="p" variant="bodySm" tone="subdued">
                    Comprueba que tu plan incluya tarifas calculadas por terceros (Advanced o
                    superior, facturación anual, o tienda de desarrollo). Si ya lo cumples,
                    escríbenos: es un caso que tenemos que mirar nosotros.
                  </Text>
                ) : null}

                {carrier.estado !== "ACTIVO" && !carrier.tieneWriteShipping ? (
                  <Text as="p" variant="bodySm" tone="critical">
                    Falta el permiso de envíos. Desinstala la app y vuelve a instalarla:
                    Shopify solo pide permisos nuevos en una instalación nueva.
                  </Text>
                ) : null}

                <Form method="post">
                  <input type="hidden" name="accion" value="registrar-carrier" />
                  <Button submit>Reintentar registro</Button>
                </Form>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">Integraciones</Text>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodySm">Geolocalización ({integraciones.geo.nombre})</Text>
                  <Badge tone={integraciones.geo.disponible ? "success" : undefined}>
                    {integraciones.geo.disponible ? "Activa" : "Sin configurar"}
                  </Badge>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodySm">DNI / RUC ({integraciones.documentos.nombre})</Text>
                  <Badge tone={integraciones.documentos.disponible ? "success" : undefined}>
                    {integraciones.documentos.disponible ? "Activa" : "Sin configurar"}
                  </Badge>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  Se configuran con variables de entorno en el servidor. Las claves nunca llegan al navegador.
                </Text>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
