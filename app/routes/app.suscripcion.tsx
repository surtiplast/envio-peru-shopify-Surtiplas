import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { Badge, Banner, BlockStack, Button, Card, Divider, Icon, InlineStack, Layout, List, Page, Text } from "@shopify/polaris";
import { CheckIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { obtenerOCrearTienda } from "../lib/shopify/tienda.server";
import { PLAN, cancelarSuscripcion, iniciarSuscripcion, sincronizarSuscripcion } from "../lib/shopify/billing.server";
import prisma from "../db.server";
import { urlDeLaApp } from "../lib/url.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const tienda = await obtenerOCrearTienda(session.shop);
  await sincronizarSuscripcion(admin, tienda.id).catch(() => null);

  return {
    plan: PLAN,
    suscripcion: await prisma.suscripcion.findUnique({ where: { shopId: tienda.id } }),
    resultado: new URL(request.url).searchParams.get("resultado"),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const tienda = await obtenerOCrearTienda(session.shop);
  const accion = String((await request.formData()).get("accion"));

  if (accion === "cancelar") {
    await cancelarSuscripcion(admin, tienda.id);
    return { ok: true };
  }

  const url = await iniciarSuscripcion(admin, tienda.id, session.shop, urlDeLaApp());
  return redirect(url);
};

export default function Suscripcion() {
  const { plan, suscripcion, resultado } = useLoaderData<typeof loader>();
  const activa = suscripcion?.estado === "ACTIVA";

  return (
    <Page title="Suscripción" backAction={{ url: "/app" }}>
      <Layout>
        <Layout.Section>
          {resultado === "ok" && activa ? <Banner tone="success" title="Suscripción activada. ¡Gracias!" /> : null}

          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingLg">{plan.nombre}</Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    {plan.moneda} {plan.precio.toFixed(2)} al mes
                    {plan.diasPrueba ? ` · ${plan.diasPrueba} días de prueba` : ""}
                  </Text>
                </BlockStack>
                <Badge tone={activa ? "success" : suscripcion?.estado === "PENDIENTE" ? "attention" : "critical"}>
                  {suscripcion?.estado ?? "SIN SUSCRIPCIÓN"}
                </Badge>
              </InlineStack>

              <Divider />

              <List type="bullet">
                {plan.prestaciones.map((p) => (
                  <List.Item key={p}>
                    <InlineStack gap="100" blockAlign="center">
                      <Icon source={CheckIcon} tone="success" />
                      <Text as="span">{p}</Text>
                    </InlineStack>
                  </List.Item>
                ))}
              </List>

              {suscripcion?.periodoFin ? (
                <Text as="p" variant="bodySm" tone="subdued">
                  Periodo actual hasta {new Date(suscripcion.periodoFin).toLocaleDateString("es-PE")}.
                </Text>
              ) : null}

              <Form method="post">
                <InlineStack gap="300">
                  {/* Solo se renderiza uno de los dos, así que un único campo
                      oculto basta y el formulario funciona sin JavaScript. */}
                  <input type="hidden" name="accion" value={activa ? "cancelar" : "suscribir"} />
                  {activa ? (
                    <Button submit tone="critical">Cancelar suscripción</Button>
                  ) : (
                    <Button submit variant="primary">Administrar suscripción</Button>
                  )}
                </InlineStack>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">Sobre el cobro</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                El cobro lo gestiona Shopify con su Billing API y aparece en la factura de tu tienda.
                Esta aplicación no ve, no recibe y no almacena datos de tarjeta.
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Puedes cancelar cuando quieras; el servicio sigue activo hasta el final del periodo pagado.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
