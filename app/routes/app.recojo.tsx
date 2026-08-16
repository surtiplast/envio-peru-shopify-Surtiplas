import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import {
  Badge, Banner, BlockStack, Button, Card, EmptyState, InlineGrid, InlineStack,
  Layout, Page, Text,
} from "@shopify/polaris";
import { CampoCheck, CampoSelect, CampoTexto } from "../components/campos";
import { authenticate } from "../shopify.server";
import { obtenerOCrearTienda } from "../lib/shopify/tienda.server";
import prisma from "../db.server";
import { listarDepartamentos, listarProvincias, listarDistritos, obtenerDistrito } from "../lib/ubigeo/catalogo";

/**
 * Todos los distritos agrupados por departamento, para un solo desplegable.
 *
 * Son 1874 opciones en un `<select>` nativo: pesa poco y el navegador ya
 * permite escribir para saltar. Es más simple y más rápido de usar que tres
 * desplegables encadenados con viajes al servidor.
 */
function distritosAgrupados() {
  return listarDepartamentos().map((dep) => ({
    title: dep.nombre,
    options: listarProvincias(dep.codigo).flatMap((prov) =>
      listarDistritos(prov.codigo).map((d) => ({
        label: `${d.distrito} (${prov.nombre})`,
        value: d.ubigeo,
      })),
    ),
  }));
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const tienda = await obtenerOCrearTienda(session.shop);
  const puntos = await prisma.puntoRecojo.findMany({
    where: { shopId: tienda.id },
    orderBy: [{ orden: "asc" }, { nombre: "asc" }],
  });

  return {
    puntos: puntos.map((p) => {
      const d = p.ubigeo ? obtenerDistrito(p.ubigeo) : null;
      return { ...p, ubicacion: d ? `${d.distrito}, ${d.provincia}, ${d.departamento}` : null };
    }),
    distritos: distritosAgrupados(),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const tienda = await obtenerOCrearTienda(session.shop);
  const form = await request.formData();
  const accion = String(form.get("accion"));
  const id = String(form.get("id") ?? "");

  // El where lleva shopId siempre: nadie puede tocar los puntos de otra tienda.
  if (accion === "eliminar") {
    await prisma.puntoRecojo.deleteMany({ where: { id, shopId: tienda.id } });
    return { ok: true, mensaje: "Sede eliminada." };
  }

  // Solo el distrito, para las sedes que ya existen.
  if (accion === "ubigeo") {
    const ubigeo = String(form.get("ubigeo") ?? "").trim();
    if (!/^\d{6}$/.test(ubigeo)) return { ok: false, mensaje: "Elige un distrito válido." };
    await prisma.puntoRecojo.updateMany({ where: { id, shopId: tienda.id }, data: { ubigeo } });
    return { ok: true, mensaje: "Distrito de la sede actualizado." };
  }

  if (accion === "alternar") {
    const punto = await prisma.puntoRecojo.findFirst({ where: { id, shopId: tienda.id } });
    if (punto) {
      await prisma.puntoRecojo.update({ where: { id: punto.id }, data: { activo: !punto.activo } });
    }
    return { ok: true, mensaje: punto?.activo ? "Sede desactivada." : "Sede activada." };
  }

  const datos = {
    nombre: String(form.get("nombre") ?? "").trim(),
    direccion: String(form.get("direccion") ?? "").trim(),
    referencia: String(form.get("referencia") ?? "").trim() || null,
    horario: String(form.get("horario") ?? "").trim() || null,
    telefono: String(form.get("telefono") ?? "").trim() || null,
    costo: (Number(form.get("costo") ?? 0)).toFixed(2),
    activo: form.get("activo") === "on",
    // El distrito es lo que permite rellenar la dirección del checkout: sin él,
    // Shopify no pide las tarifas y el comprador no ve la opción de recojo.
    ubigeo: /^\d{6}$/.test(String(form.get("ubigeo") ?? "")) ? String(form.get("ubigeo")) : null,
  };
  if (!datos.nombre || !datos.direccion) {
    return { ok: false, mensaje: "El nombre y la dirección son obligatorios." };
  }
  if (!datos.ubigeo) {
    return { ok: false, mensaje: "Elige el distrito donde está la sede." };
  }

  if (id) await prisma.puntoRecojo.updateMany({ where: { id, shopId: tienda.id }, data: datos });
  else await prisma.puntoRecojo.create({ data: { ...datos, shopId: tienda.id } });

  return { ok: true, mensaje: id ? "Sede actualizada." : "Sede agregada." };
};

export default function Recojo() {
  const { puntos, distritos } = useLoaderData<typeof loader>();
  const resultado = useActionData<typeof action>();
  const navegacion = useNavigation();

  return (
    <Page title="Recojo en tienda" subtitle="Las sedes donde tus clientes pueden recoger su pedido" backAction={{ url: "/app" }}>
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {resultado ? (
              <Banner tone={resultado.ok ? "success" : "critical"} title={resultado.mensaje} />
            ) : null}

            {puntos.length === 0 ? (
              <Card>
                <EmptyState heading="Sin puntos de recojo" image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png">
                  <p>Agrega tu primera sede en el formulario de la derecha para ofrecer recojo en tienda.</p>
                </EmptyState>
              </Card>
            ) : (
              puntos.map((p) => (
                <Card key={p.id}>
                  <InlineStack align="space-between" blockAlign="start">
                    <BlockStack gap="100">
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="h3" variant="headingMd">{p.nombre}</Text>
                        <Badge tone={p.activo ? "success" : undefined}>{p.activo ? "Activa" : "Inactiva"}</Badge>
                        <Badge tone={Number(p.costo) === 0 ? "info" : undefined}>
                          {Number(p.costo) === 0 ? "Gratis" : `S/ ${Number(p.costo).toFixed(2)}`}
                        </Badge>
                      </InlineStack>
                      <Text as="p" variant="bodySm">{p.direccion}</Text>
                      {p.ubicacion ? (
                        <Text as="p" variant="bodySm" tone="subdued">{p.ubicacion}</Text>
                      ) : (
                        <Banner tone="warning" title="Falta el distrito de esta sede">
                          <Text as="p" variant="bodySm">
                            Sin distrito, el checkout no puede mostrar la opción de recojo.
                            Elígelo aquí abajo y guarda.
                          </Text>
                          <Form method="post">
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="accion" value="ubigeo" />
                            <BlockStack gap="200">
                              <CampoSelect label="Distrito de la sede" name="ubigeo" options={distritos} />
                              <Button submit>Guardar distrito</Button>
                            </BlockStack>
                          </Form>
                        </Banner>
                      )}
                      {p.horario ? <Text as="p" variant="bodySm" tone="subdued">Horario: {p.horario}</Text> : null}
                      {p.telefono ? <Text as="p" variant="bodySm" tone="subdued">Teléfono: {p.telefono}</Text> : null}
                    </BlockStack>
                    <InlineStack gap="200">
                      <Form method="post">
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="accion" value="alternar" />
                        <Button submit variant="plain">
                          {p.activo ? "Desactivar" : "Activar"}
                        </Button>
                      </Form>
                      <Form method="post">
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="accion" value="eliminar" />
                        <Button submit variant="plain" tone="critical">Eliminar</Button>
                      </Form>
                    </InlineStack>
                  </InlineStack>
                </Card>
              ))
            )}
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <Form method="post">
              <BlockStack gap="300">
                <Text as="h3" variant="headingMd">Nueva sede</Text>
                <CampoTexto label="Nombre" name="nombre" placeholder="Sede Magdalena" requiredIndicator />
                <CampoTexto label="Dirección" name="direccion" placeholder="Av. Brasil 1234" requiredIndicator />
                <CampoSelect
                  label="Distrito de la sede"
                  name="ubigeo"
                  options={distritos}
                  helpText="Se usa para rellenar la dirección en el checkout."
                />
                <CampoTexto label="Referencia" name="referencia" placeholder="Frente al parque" />
                <CampoTexto label="Horario" name="horario" placeholder="Lun a Sáb, 9:00 a 19:00" />
                <CampoTexto label="Teléfono" name="telefono" placeholder="987654321" />
                <CampoTexto label="Costo del recojo (S/)" name="costo" type="number" step={0.01} valorInicial="0.00" helpText="0 significa gratis." />
                <CampoCheck label="Activa" name="activo" marcadoInicial />
                {/* Campo oculto en vez de un botón con JavaScript: el formulario
                    se envía igual aunque el script no llegue a cargar. */}
                <input type="hidden" name="accion" value="guardar" />
                <Button submit variant="primary" loading={navegacion.state === "submitting"}>
                  Agregar sede
                </Button>
              </BlockStack>
            </Form>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
