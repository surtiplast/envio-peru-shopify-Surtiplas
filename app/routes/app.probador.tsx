import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Badge, Banner, BlockStack, Box, Button, Card, InlineGrid, InlineStack, Layout, Page, Select, Text, TextField,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { obtenerOCrearTienda } from "../lib/shopify/tienda.server";
import { cotizarParaTienda } from "../lib/rates/consulta.server";
import { aCentimos, formatearSoles } from "../lib/rates/motor";
import { listarDepartamentos, listarProvincias, listarDistritos, obtenerDistrito } from "../lib/ubigeo/catalogo";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return { departamentos: listarDepartamentos() };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const tienda = await obtenerOCrearTienda(session.shop);
  const form = await request.formData();

  const accion = String(form.get("accion") ?? "cotizar");
  if (accion === "provincias") return { provincias: listarProvincias(String(form.get("dep"))) };
  if (accion === "distritos") return { distritos: listarDistritos(String(form.get("prov"))) };

  const ubigeo = String(form.get("ubigeo") ?? "");
  const subtotal = aCentimos(String(form.get("subtotal") ?? "0"));
  if (!/^\d{6}$/.test(ubigeo)) return { error: "Elige un distrito." };

  const resultado = await cotizarParaTienda(tienda.id, ubigeo, subtotal);
  return {
    resultado: {
      ...resultado,
      distrito: obtenerDistrito(ubigeo),
      subtotal,
      opciones: resultado.opciones.map((o) => ({ ...o, costoTexto: formatearSoles(o.costo) })),
    },
  };
};

export default function Probador() {
  const { departamentos } = useLoaderData<typeof loader>();
  const provinciasFetcher = useFetcher<any>();
  const distritosFetcher = useFetcher<any>();
  const cotizacion = useFetcher<any>();

  const [dep, setDep] = useState("");
  const [prov, setProv] = useState("");
  const [ubigeo, setUbigeo] = useState("");
  const [subtotal, setSubtotal] = useState("150.00");

  const resultado = cotizacion.data?.resultado;

  return (
    <Page title="Probador de tarifas" subtitle="Comprueba qué verá el comprador antes de publicar" backAction={{ url: "/app" }}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
                <Select
                  label="Departamento"
                  options={[{ label: "Elige…", value: "" }, ...departamentos.map((d) => ({ label: d.nombre, value: d.codigo }))]}
                  value={dep}
                  onChange={(v) => {
                    setDep(v); setProv(""); setUbigeo("");
                    if (v) provinciasFetcher.submit({ accion: "provincias", dep: v }, { method: "post" });
                  }}
                />
                <Select
                  label="Provincia"
                  disabled={!dep}
                  options={[{ label: "Elige…", value: "" }, ...(provinciasFetcher.data?.provincias ?? []).map((p: any) => ({ label: p.nombre, value: p.codigo }))]}
                  value={prov}
                  onChange={(v) => {
                    setProv(v); setUbigeo("");
                    if (v) distritosFetcher.submit({ accion: "distritos", prov: v }, { method: "post" });
                  }}
                />
                <Select
                  label="Distrito"
                  disabled={!prov}
                  options={[{ label: "Elige…", value: "" }, ...(distritosFetcher.data?.distritos ?? []).map((d: any) => ({ label: d.distrito, value: d.ubigeo }))]}
                  value={ubigeo}
                  onChange={setUbigeo}
                />
              </InlineGrid>

              <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
                <TextField
                  label="Subtotal del carrito (S/)"
                  type="number"
                  step={0.01}
                  value={subtotal}
                  onChange={setSubtotal}
                  autoComplete="off"
                  prefix="S/"
                />
                <Box paddingBlockStart="600">
                  <Button
                    variant="primary"
                    disabled={!ubigeo}
                    loading={cotizacion.state !== "idle"}
                    onClick={() => cotizacion.submit({ accion: "cotizar", ubigeo, subtotal }, { method: "post" })}
                  >
                    Calcular tarifa
                  </Button>
                </Box>
              </InlineGrid>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          {cotizacion.data?.error ? <Banner tone="critical">{cotizacion.data.error}</Banner> : null}

          {resultado ? (
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <Text as="h2" variant="headingMd">
                      {resultado.distrito?.departamento} / {resultado.distrito?.provincia} / {resultado.distrito?.distrito}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">UBIGEO {resultado.ubigeo}</Text>
                  </BlockStack>
                  <Badge tone={resultado.encontrada ? "success" : "attention"}>
                    {resultado.encontrada ? "Tarifa encontrada" : "Sin tarifa configurada"}
                  </Badge>
                </InlineStack>

                {resultado.opciones.length === 0 ? (
                  <Banner tone="warning" title="Este distrito no tendría opciones de envío">
                    <Text as="p">{resultado.explicacion}</Text>
                  </Banner>
                ) : (
                  <BlockStack gap="300">
                    {resultado.opciones.map((o: any) => (
                      <Card key={o.tipo} background="bg-surface-secondary">
                        <InlineStack align="space-between" blockAlign="center">
                          <BlockStack gap="050">
                            <Text as="p" fontWeight="semibold">{o.etiqueta}</Text>
                            <Text as="p" variant="bodySm" tone="subdued">{o.descripcion}</Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {o.motivo === "RANGO" || o.motivo === "RANGO_GRATIS"
                                ? `Regla aplicada: rango ${o.rango?.orden} (desde S/ ${(o.rango.montoMin / 100).toFixed(2)} hasta ${o.rango.montoMax === null ? "sin límite" : "S/ " + (o.rango.montoMax / 100).toFixed(2)})`
                                : o.motivo === "UMBRAL_GRATIS" ? "Regla aplicada: umbral de envío gratis"
                                : "Regla aplicada: costo por defecto de la tienda"}
                            </Text>
                          </BlockStack>
                          <Text as="p" variant="headingLg">{o.gratis ? "GRATIS" : o.costoTexto}</Text>
                        </InlineStack>
                      </Card>
                    ))}
                    <Text as="p" variant="bodySm" tone="subdued">{resultado.explicacion}</Text>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          ) : null}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
