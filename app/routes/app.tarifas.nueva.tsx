import { useMemo, useState } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { Banner, BlockStack, Button, Card, InlineGrid, Layout, Page, Select, Text } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { obtenerOCrearTienda } from "../lib/shopify/tienda.server";
import { listarDepartamentos, listarProvincias, listarDistritos } from "../lib/ubigeo/catalogo";
import prisma from "../db.server";

/**
 * Alta de una tarifa desde el panel, sin pasar por el CSV.
 *
 * El editor de tarifas ya crea la fila si el distrito no la tenía, así que aquí
 * solo hace falta elegir el distrito y llevar al comerciante allí. Antes esta
 * pantalla no existía y una tienda recién instalada solo podía importar un
 * archivo: si no tenías el CSV, no podías empezar.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const tienda = await obtenerOCrearTienda(session.shop);

  // El árbol entero viaja al navegador para que los tres desplegables se
  // encadenen sin ir al servidor en cada paso. Son unos 100 KB, aceptable en
  // una pantalla del panel y mucho más ágil de usar.
  const arbol = listarDepartamentos().map((dep) => ({
    codigo: dep.codigo,
    nombre: dep.nombre,
    provincias: listarProvincias(dep.codigo).map((prov) => ({
      codigo: prov.codigo,
      nombre: prov.nombre,
      distritos: listarDistritos(prov.codigo).map((d) => ({ ubigeo: d.ubigeo, nombre: d.distrito })),
    })),
  }));

  const existentes = await prisma.tarifa.findMany({
    where: { shopId: tienda.id },
    select: { ubigeo: true },
  });

  return { arbol, existentes: existentes.map((t) => t.ubigeo) };
};

export default function NuevaTarifa() {
  const { arbol, existentes } = useLoaderData<typeof loader>();
  const navegar = useNavigate();

  const [codDep, setCodDep] = useState("");
  const [codProv, setCodProv] = useState("");
  const [ubigeo, setUbigeo] = useState("");

  const provincias = useMemo(
    () => arbol.find((d) => d.codigo === codDep)?.provincias ?? [],
    [arbol, codDep],
  );
  const distritos = useMemo(
    () => provincias.find((p) => p.codigo === codProv)?.distritos ?? [],
    [provincias, codProv],
  );

  const yaExiste = ubigeo !== "" && existentes.includes(ubigeo);

  const vacia = { label: "Seleccionar", value: "" };

  return (
    <Page
      title="Nueva tarifa"
      subtitle="Elige el distrito y configura sus precios"
      backAction={{ url: "/app/tarifas" }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
                <Select
                  label="Departamento"
                  options={[vacia, ...arbol.map((d) => ({ label: d.nombre, value: d.codigo }))]}
                  value={codDep}
                  onChange={(v) => {
                    setCodDep(v);
                    setCodProv("");
                    setUbigeo("");
                  }}
                />
                <Select
                  label="Provincia"
                  disabled={!codDep}
                  options={[vacia, ...provincias.map((p) => ({ label: p.nombre, value: p.codigo }))]}
                  value={codProv}
                  onChange={(v) => {
                    setCodProv(v);
                    setUbigeo("");
                  }}
                />
                <Select
                  label="Distrito"
                  disabled={!codProv}
                  options={[vacia, ...distritos.map((d) => ({ label: d.nombre, value: d.ubigeo }))]}
                  value={ubigeo}
                  onChange={setUbigeo}
                />
              </InlineGrid>

              {yaExiste ? (
                <Banner tone="info" title="Este distrito ya tiene tarifa">
                  <Text as="p" variant="bodySm">
                    No se creará otra: al continuar abrirás la que ya existe para editarla.
                  </Text>
                </Banner>
              ) : null}

              <Button
                variant="primary"
                disabled={!ubigeo}
                onClick={() => navegar(`/app/tarifas/${ubigeo}`)}
              >
                {yaExiste ? "Editar esta tarifa" : "Crear tarifa"}
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">¿Muchos distritos?</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Crear uno a uno está bien para empezar o para ajustar un distrito suelto. Si vas a
                cubrir todo el país, sale mucho más a cuenta descargar la plantilla desde Importar,
                rellenarla en Excel y subirla de una vez.
              </Text>
              <Button url="/app/importar">Ir a Importar</Button>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
