import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation, useRevalidator } from "@remix-run/react";
import {
  Banner, BlockStack, Box, Button, ButtonGroup, Card, Checkbox, Divider, InlineGrid, InlineStack,
  Layout, Page, Select, Text, TextField,
} from "@shopify/polaris";
import { CampoCheck, CampoColor, CampoTexto, normalizarColor } from "../components/campos";
import { authenticate } from "../shopify.server";
import { aparienciaDe, obtenerOCrearTienda } from "../lib/shopify/tienda.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const tienda = await obtenerOCrearTienda(session.shop);
  return { apariencia: await aparienciaDe(tienda.id) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const tienda = await obtenerOCrearTienda(session.shop);
  const f = await request.formData();

  const texto = (k: string) => String(f.get(k) ?? "").trim();
  const bool = (k: string) => f.get(k) === "on";

  await prisma.apariencia.upsert({
    where: { shopId: tienda.id },
    create: { shopId: tienda.id },
    update: {
      logoUrl: texto("logoUrl") || null,
      nombreEmpresa: texto("nombreEmpresa") || null,
      colorPrincipal: normalizarColor(texto("colorPrincipal"), "#0B5CFF"),
      colorBoton: normalizarColor(texto("colorBoton"), "#0B5CFF"),
      colorTextoBoton: normalizarColor(texto("colorTextoBoton"), "#FFFFFF"),
      colorTexto: normalizarColor(texto("colorTexto"), "#1A1A1A"),
      colorFondo: normalizarColor(texto("colorFondo"), "#FFFFFF"),
      colorBorde: normalizarColor(texto("colorBorde"), "#E3E3E3"),
      juegoIconos: ["LINEA", "SOLIDO", "EMOJI"].includes(texto("juegoIconos"))
        ? texto("juegoIconos")
        : "LINEA",
      radio: Number(f.get("radio") ?? 12),
      tituloEncabezado: texto("tituloEncabezado"),
      subtitulo: texto("subtitulo"),
      textoBoton: texto("textoBoton"),
      mostrarExpress: bool("mostrarExpress"),
      mostrarRecojo: bool("mostrarRecojo"),
      mostrarTelefono: bool("mostrarTelefono"),
      mostrarReferencia: bool("mostrarReferencia"),
      mostrarDocumento: bool("mostrarDocumento"),
      mostrarTerminos: bool("mostrarTerminos"),
      mostrarGeolocalizacion: bool("mostrarGeolocalizacion"),
      mostrarBuscadorDireccion: bool("mostrarBuscadorDireccion"),
      mostrarCumpleanos: bool("mostrarCumpleanos"),
      mostrarMarketingEmail: bool("mostrarMarketingEmail"),
      mostrarMarketingSms: bool("mostrarMarketingSms"),
    },
  });

  return { ok: true };
};


/**
 * Los mismos iconos que ve el comprador, para la vista previa del panel.
 *
 * Están duplicados respecto a form.js y calculadora.js porque aquellos son
 * scripts sueltos que se sirven a la tienda, sin empaquetador ni módulos: no
 * hay forma de compartir código entre el panel y el escaparate sin cargar un
 * archivo extra en cada página de la tienda.
 */
const ICONOS_PREVIA: Record<string, Record<string, string>> = {
  LINEA: {
    ESTANDAR: "M1 4h13v11H1z M14 8h4l3 4v3h-7z",
    RECOJO: "M3 9h18v12H3z M2 9l2-5h16l2 5 M9 21v-6h6v6",
  },
  SOLIDO: {
    ESTANDAR: "M1 4h13v11H1z M14 8h4l3 4v3h-7z",
    RECOJO: "M3 9h18v12H3z M2 9l2-5h16l2 5 M9 21v-6h6v6",
  },
  EMOJI: { ESTANDAR: "🚚", RECOJO: "🏪" },
};

function IconoPrevia({
  tipo,
  juego,
  color,
  tamano,
}: {
  tipo: "ESTANDAR" | "RECOJO";
  juego: string;
  color: string;
  tamano: number;
}) {
  if (juego === "EMOJI") {
    return <span style={{ fontSize: tamano }}>{ICONOS_PREVIA.EMOJI[tipo]}</span>;
  }

  const relleno = juego === "SOLIDO";
  return (
    <svg
      viewBox="0 0 24 24"
      width={tamano}
      height={tamano}
      fill={relleno ? color : "none"}
      stroke={color}
      strokeWidth={relleno ? 0 : 1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      <path d={ICONOS_PREVIA.LINEA[tipo]} />
    </svg>
  );
}

export default function Personalizacion() {
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

  const { apariencia } = useLoaderData<typeof loader>();
  const resultado = useActionData<typeof action>();
  const navegacion = useNavigation();

  const [color, setColor] = useState(apariencia.colorPrincipal);
  const colorVista = normalizarColor(color, "#0B5CFF");
  const [colorBoton, setColorBoton] = useState(apariencia.colorBoton);
  const colorBotonVista = normalizarColor(colorBoton, "#0B5CFF");
  const [colorTexto, setColorTexto] = useState(apariencia.colorTexto);
  const [colorFondo, setColorFondo] = useState(apariencia.colorFondo);
  const [colorBorde, setColorBorde] = useState(apariencia.colorBorde);
  const [juegoIconos, setJuegoIconos] = useState(apariencia.juegoIconos);
  const textoVista = normalizarColor(colorTexto, "#1A1A1A");
  const fondoVista = normalizarColor(colorFondo, "#FFFFFF");
  const bordeVista = normalizarColor(colorBorde, "#E3E3E3");
  /** Qué pestaña de la vista previa se está mirando. */
  const [previa, setPrevia] = useState<"formulario" | "calculadora">("formulario");
  const [titulo, setTitulo] = useState(apariencia.tituloEncabezado);
  const [subtitulo, setSubtitulo] = useState(apariencia.subtitulo);
  const [textoBoton, setTextoBoton] = useState(apariencia.textoBoton);
  const [radio, setRadio] = useState(String(apariencia.radio));
  const [empresa, setEmpresa] = useState(apariencia.nombreEmpresa ?? "");

  return (
    <Page title="Personalización" subtitle="Así verá el comprador tu formulario de envío" backAction={{ url: "/app" }}>
      {/* data-save-bar: Shopify detecta los cambios y muestra su barra nativa
          de "Cambios no guardados". Guardar dispara el submit; Descartar
          dispara reset.

          Recargamos en reset a propósito: los campos son componentes
          controlados de React, y un reset de HTML solo restaura los inputs
          nativos, dejando el estado de React con los valores modificados. La
          recarga vuelve a pedir los datos al servidor, que es lo que el
          comerciante espera de "Descartar". */}
      <Form method="post" data-save-bar onReset={descartar} key={versionFormulario}>
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              {resultado?.ok ? <Banner tone="success" title="Personalización guardada" /> : null}

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Marca</Text>
                  <TextField label="Nombre de la empresa" name="nombreEmpresa" value={empresa} onChange={setEmpresa} autoComplete="off" />
                  <CampoTexto label="URL del logo" name="logoUrl" valorInicial={apariencia.logoUrl} helpText="Sube la imagen a tu tienda y pega aquí el enlace." />
                  <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
                    <CampoColor label="Color principal" name="colorPrincipal" valorInicial={apariencia.colorPrincipal} onValor={setColor} />
                    <CampoColor label="Color de botones" name="colorBoton" valorInicial={apariencia.colorBoton} onValor={setColorBoton} />
                    <CampoColor label="Color del texto del botón" name="colorTextoBoton" valorInicial={apariencia.colorTextoBoton} />
                  </InlineGrid>
                  <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
                    <CampoColor label="Color del texto" name="colorTexto" valorInicial={apariencia.colorTexto} onValor={setColorTexto} />
                    <CampoColor label="Fondo de las tarjetas" name="colorFondo" valorInicial={apariencia.colorFondo} onValor={setColorFondo} />
                    <CampoColor label="Color de los bordes" name="colorBorde" valorInicial={apariencia.colorBorde} onValor={setColorBorde} />
                  </InlineGrid>
                  <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
                    <TextField label="Redondeo de esquinas (px)" name="radio" type="number" value={radio} onChange={setRadio} autoComplete="off" />
                    <Select
                      label="Iconos de los métodos"
                      name="juegoIconos"
                      options={[
                        { label: "Línea", value: "LINEA" },
                        { label: "Sólido", value: "SOLIDO" },
                        { label: "Emoji", value: "EMOJI" },
                      ]}
                      value={juegoIconos}
                      onChange={setJuegoIconos}
                      helpText="Línea y sólido toman tu color principal. Los emojis los dibuja cada dispositivo."
                    />
                  </InlineGrid>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Textos</Text>
                  <TextField label="Título del encabezado" name="tituloEncabezado" value={titulo} onChange={setTitulo} autoComplete="off" />
                  <TextField label="Subtítulo" name="subtitulo" value={subtitulo} onChange={setSubtitulo} multiline={2} autoComplete="off" />
                  <TextField label="Texto del botón final" name="textoBoton" value={textoBoton} onChange={setTextoBoton} autoComplete="off" />
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Qué mostrar</Text>
                  <InlineGrid columns={{ xs: 1, md: 2 }} gap="200">
                    <CampoCheck label="Envío express" name="mostrarExpress" marcadoInicial={apariencia.mostrarExpress} />
                    <CampoCheck label="Recojo en tienda" name="mostrarRecojo" marcadoInicial={apariencia.mostrarRecojo} />
                    <CampoCheck label="Teléfono" name="mostrarTelefono" marcadoInicial={apariencia.mostrarTelefono} />
                    <CampoCheck label="Referencia de la dirección" name="mostrarReferencia" marcadoInicial={apariencia.mostrarReferencia} />
                    <CampoCheck label="DNI / RUC / CE" name="mostrarDocumento" marcadoInicial={apariencia.mostrarDocumento} helpText="El CE se escribe a mano; no hay servicio que lo consulte" />
                    <CampoCheck label="Términos y condiciones" name="mostrarTerminos" marcadoInicial={apariencia.mostrarTerminos} />
                    <CampoCheck label="Botón «Usar mi ubicación actual»" name="mostrarGeolocalizacion" marcadoInicial={apariencia.mostrarGeolocalizacion} />
                    <CampoCheck label="Buscador de direcciones" name="mostrarBuscadorDireccion" marcadoInicial={apariencia.mostrarBuscadorDireccion} />
                    <CampoCheck label="Fecha de cumpleaños" name="mostrarCumpleanos" marcadoInicial={apariencia.mostrarCumpleanos} helpText="Se guarda en la ficha del cliente" />
                    <CampoCheck label="Aceptar novedades por correo" name="mostrarMarketingEmail" marcadoInicial={apariencia.mostrarMarketingEmail} helpText="Suscribe al cliente al marketing por email" />
                    <CampoCheck label="Aceptar novedades por SMS" name="mostrarMarketingSms" marcadoInicial={apariencia.mostrarMarketingSms} helpText="Suscribe al cliente al marketing por SMS" />
                  </InlineGrid>
                </BlockStack>
              </Card>

              <Box><Button submit variant="primary" loading={navegacion.state === "submitting"}>Guardar personalización</Button></Box>
            </BlockStack>
          </Layout.Section>

          {/* Vista previa en vivo. No es una captura: usa los mismos colores,
              radios e iconos que el comprador verá, para que el comerciante no
              tenga que guardar y salir a la tienda para comprobar cada cambio. */}
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingMd">Vista previa</Text>
                <ButtonGroup variant="segmented">
                  <Button pressed={previa === "formulario"} onClick={() => setPrevia("formulario")}>
                    Formulario
                  </Button>
                  <Button pressed={previa === "calculadora"} onClick={() => setPrevia("calculadora")}>
                    Calculadora
                  </Button>
                </ButtonGroup>
                <Divider />

                <div
                  style={{
                    border: `1px solid ${bordeVista}`,
                    borderRadius: Number(radio),
                    padding: 16,
                    fontFamily: "Inter, system-ui, sans-serif",
                    background: fondoVista,
                    color: textoVista,
                  }}
                >
                  {previa === "formulario" ? (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                        {apariencia.logoUrl ? (
                          <img src={apariencia.logoUrl} alt="" style={{ height: 28 }} />
                        ) : (
                          <div style={{ width: 28, height: 28, borderRadius: 8, background: colorVista }} />
                        )}
                        <strong style={{ fontSize: 14 }}>{empresa || "Tu tienda"}</strong>
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 650, marginBottom: 4 }}>{titulo}</div>
                      <div style={{ fontSize: 13, opacity: 0.65, marginBottom: 14 }}>{subtitulo}</div>

                      <div style={{ border: `1.5px solid ${colorVista}`, borderRadius: Number(radio), padding: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                        <IconoPrevia tipo="ESTANDAR" juego={juegoIconos} color={colorVista} tamano={26} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>Envío estándar</div>
                          <div style={{ fontSize: 12, opacity: 0.65 }}>Entrega en 2 a 5 días hábiles</div>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>S/ 10.00</div>
                      </div>

                      <div style={{ border: `1px solid ${bordeVista}`, borderRadius: Number(radio), padding: 12, marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
                        <IconoPrevia tipo="RECOJO" juego={juegoIconos} color={colorVista} tamano={26} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>Recojo en tienda</div>
                          <div style={{ fontSize: 12, opacity: 0.65 }}>Sin costo de envío</div>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>GRATIS</div>
                      </div>

                      <button
                        type="button"
                        style={{
                          width: "100%", padding: "12px 16px", border: "none",
                          borderRadius: Number(radio), background: colorBotonVista,
                          color: normalizarColor(apariencia.colorTextoBoton, "#FFFFFF"),
                          fontWeight: 650, fontSize: 14, cursor: "pointer",
                        }}
                      >
                        {textoBoton}
                      </button>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 15, fontWeight: 650, marginBottom: 10 }}>
                        Envíos a Magdalena del Mar
                      </div>

                      <div style={{ border: `1px solid ${bordeVista}`, borderRadius: Number(radio), padding: 12, marginBottom: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 13 }}>
                          <IconoPrevia tipo="ESTANDAR" juego={juegoIconos} color={colorVista} tamano={18} />
                          Envío estándar
                        </div>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 8 }}>
                          <tbody>
                            <tr style={{ borderBottom: `1px solid ${bordeVista}` }}>
                              <td style={{ padding: "6px 0" }}>S/ 0.00 a S/ 99.99</td>
                              <td style={{ padding: "6px 0", textAlign: "right" }}>S/ 10.00</td>
                            </tr>
                            <tr>
                              <td style={{ padding: "6px 0" }}>S/ 100.00 a más</td>
                              <td style={{ padding: "6px 0", textAlign: "right", color: "#16a34a", fontWeight: 600 }}>GRATIS</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      <div style={{ border: `1px dashed ${bordeVista}`, borderRadius: Number(radio), padding: 12, background: "#f8fafc" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 13 }}>
                          <IconoPrevia tipo="RECOJO" juego={juegoIconos} color={colorVista} tamano={18} />
                          Recojo en tienda
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4 }}>
                          Retira tu pedido sin costo de envío
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Form>
    </Page>
  );
}
