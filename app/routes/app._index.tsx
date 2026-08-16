import type { LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import {
  Badge, BlockStack, Box, Button, Card, EmptyState, Grid, InlineGrid, InlineStack,
  Layout, Page, ProgressBar, Text,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { obtenerOCrearTienda, resumenDashboard } from "../lib/shopify/tienda.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const tienda = await obtenerOCrearTienda(session.shop);
  const [resumen, suscripcion] = await Promise.all([
    resumenDashboard(tienda.id),
    prisma.suscripcion.findUnique({ where: { shopId: tienda.id } }),
  ]);
  return {
    resumen,
    suscripcion: suscripcion ? { estado: suscripcion.estado, plan: suscripcion.plan } : null,
    carrier: {
      estado: tienda.carrierServiceEstado,
      error: tienda.carrierServiceError,
      plan: tienda.planShopify,
    },
  };
};

/**
 * Explica qué le falta a ESTA tienda, no todas las opciones que existen.
 *
 * Shopify solo ofrece el envío calculado por terceros en Advanced y Plus; el
 * plan Grow lo incluye si la facturación es anual, o lo vende como complemento
 * mensual. En Basic no se puede contratar de ninguna forma.
 */
function explicarElegibilidad(plan: string | null): string {
  const base =
    "El formulario previo al checkout sigue funcionando y el costo viaja como atributo del carrito, " +
    "así que el comprador ve el precio correcto y queda registrado en el pedido. Lo que no ocurre es " +
    "que Shopify cobre ese importe automáticamente en el checkout. ";

  const p = (plan ?? "").toLowerCase();

  if (p.includes("basic")) {
    return (
      base +
      "Tu tienda está en el plan Basic, donde esta función no se puede activar ni pagando aparte. " +
      "La vía más económica es subir a Grow con facturación ANUAL, que lo incluye sin coste adicional."
    );
  }

  if (p.includes("grow") || p === "shopify") {
    return (
      base +
      "Tu tienda está en el plan Grow. Cambiando la facturación a ANUAL se activa sin coste adicional; " +
      "si prefieres seguir en mensual, Shopify lo vende como complemento aparte."
    );
  }

  return (
    base +
    "Shopify lo incluye en los planes Advanced y Plus, y en Grow con facturación anual. " +
    "Las tiendas de desarrollo lo tienen siempre activado."
  );
}

function Metrica({ titulo, valor, ayuda }: { titulo: string; valor: string | number; ayuda?: string }) {
  return (
    <Card>
      <BlockStack gap="100">
        <Text as="p" variant="bodySm" tone="subdued">{titulo}</Text>
        <Text as="p" variant="heading2xl">{valor}</Text>
        {ayuda ? <Text as="p" variant="bodySm" tone="subdued">{ayuda}</Text> : null}
      </BlockStack>
    </Card>
  );
}

export default function Dashboard() {
  const { resumen, suscripcion, carrier } = useLoaderData<typeof loader>();

  if (resumen.totalTarifas === 0) {
    return (
      <Page title="Envío Perú">
        <Card>
          <EmptyState
            heading="Aún no tienes tarifas configuradas"
            action={{ content: "Importar mi archivo CSV", url: "/app/importar" }}
            secondaryAction={{ content: "Crear una tarifa a mano", url: "/app/tarifas/nueva" }}
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <p>
              Sube tu archivo con las tarifas por distrito y en unos segundos tendrás
              cubiertos los {resumen.catalogo.distritos} distritos del Perú que necesites.
            </p>
          </EmptyState>
        </Card>
      </Page>
    );
  }

  return (
    <Page
      title="Dashboard"
      subtitle="Resumen de tu configuración de envíos"
      primaryAction={{ content: "Probar una tarifa", url: "/app/probador" }}
      secondaryActions={[
        { content: "Importar", url: "/app/importar" },
        { content: "Exportar", url: "/app/exportar" },
      ]}
    >
      <BlockStack gap="400">
        {carrier.estado !== "ACTIVO" ? (
          <Card>
            <BlockStack gap="200">
              <InlineStack gap="200" blockAlign="center">
                <Badge tone={carrier.estado === "NO_ELEGIBLE" ? "attention" : "critical"}>
                  {carrier.estado === "NO_ELEGIBLE" ? "Tarifas calculadas no disponibles" : "CarrierService inactivo"}
                </Badge>
              </InlineStack>
              <Text as="p" variant="bodyMd">
                {carrier.estado === "NO_ELEGIBLE"
                  ? explicarElegibilidad(carrier.plan)
                  : carrier.error ?? "No pudimos registrar el servicio de tarifas. Reinstala la app o contáctanos."}
              </Text>
            </BlockStack>
          </Card>
        ) : null}

        <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
          <Metrica titulo="Distritos configurados" valor={resumen.totalTarifas} ayuda={`${resumen.coberturaPorcentaje}% del país`} />
          <Metrica titulo="Provincias" valor={resumen.provincias} ayuda={`de ${resumen.catalogo.provincias}`} />
          <Metrica titulo="Departamentos" valor={resumen.departamentos} ayuda={`de ${resumen.catalogo.departamentos}`} />
          <Metrica titulo="Tarifas activas" valor={resumen.tarifasActivas} />
        </InlineGrid>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Cobertura nacional</Text>
                <ProgressBar progress={resumen.coberturaPorcentaje} size="small" tone="primary" />
                <Text as="p" variant="bodySm" tone="subdued">
                  {resumen.totalTarifas} de {resumen.catalogo.distritos} distritos tienen tarifa.
                  Los distritos sin tarifa se comportan según lo que hayas elegido en Configuración.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Métodos de entrega</Text>
                <InlineStack align="space-between"><Text as="span">Envío estándar</Text><Badge tone="success">{String(resumen.enviosEstandar)}</Badge></InlineStack>
                <InlineStack align="space-between"><Text as="span">Envío express</Text><Badge tone="info">{String(resumen.enviosExpress)}</Badge></InlineStack>
                <InlineStack align="space-between"><Text as="span">Recojo en tienda</Text><Badge>{String(resumen.recojos)}</Badge></InlineStack>
                <InlineStack align="space-between"><Text as="span">Puntos de recojo</Text><Badge>{String(resumen.puntosRecojo)}</Badge></InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 6, xl: 6 }}>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Última importación</Text>
                {resumen.ultimaImportacion ? (
                  <BlockStack gap="100">
                    <Text as="p" variant="bodyMd">{resumen.ultimaImportacion.archivo}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {new Date(resumen.ultimaImportacion.iniciadaEn).toLocaleString("es-PE")} ·{" "}
                      {resumen.ultimaImportacion.nuevos} nuevas, {resumen.ultimaImportacion.actualizados} actualizadas,{" "}
                      {resumen.ultimaImportacion.errores} con error
                    </Text>
                  </BlockStack>
                ) : (
                  <Text as="p" tone="subdued">Todavía no has importado ningún archivo.</Text>
                )}
                <Box><Button url="/app/importar">Importar tarifas</Button></Box>
              </BlockStack>
            </Card>
          </Grid.Cell>

          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 6, xl: 6 }}>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Suscripción</Text>
                <InlineStack gap="200" blockAlign="center">
                  <Text as="p" variant="bodyMd">Plan Profesional</Text>
                  <Badge tone={suscripcion?.estado === "ACTIVA" ? "success" : "attention"}>
                    {suscripcion?.estado ?? "PENDIENTE"}
                  </Badge>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  Última actualización de tarifas:{" "}
                  {resumen.ultimaActualizacion ? new Date(resumen.ultimaActualizacion).toLocaleString("es-PE") : "—"}
                </Text>
                <Box><Link to="/app/suscripcion"><Button>Administrar suscripción</Button></Link></Box>
              </BlockStack>
            </Card>
          </Grid.Cell>
        </Grid>
      </BlockStack>
    </Page>
  );
}
