import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData, useSearchParams } from "@remix-run/react";
import { BlockStack, Card, InlineStack, Layout, Page, Select, Text } from "@shopify/polaris";
import { BotonDescarga, CampoSelect } from "../components/campos";
import { authenticate } from "../shopify.server";
import { obtenerOCrearTienda } from "../lib/shopify/tienda.server";
import { exportarCsv, exportarXlsx } from "../lib/csv/exportar.server";
import { listarDepartamentos, listarProvincias, listarDistritos } from "../lib/ubigeo/catalogo";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const tienda = await obtenerOCrearTienda(session.shop);
  const url = new URL(request.url);
  const dep = url.searchParams.get("dep") ?? "";
  const prov = url.searchParams.get("prov") ?? "";

  return {
    total: await prisma.tarifa.count({ where: { shopId: tienda.id } }),
    departamentos: listarDepartamentos(),
    provincias: dep ? listarProvincias(dep) : [],
    distritos: prov ? listarDistritos(prov) : [],
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const tienda = await obtenerOCrearTienda(session.shop);
  const form = await request.formData();

  const filtro = {
    codDep: String(form.get("dep") ?? "") || undefined,
    codProv: String(form.get("prov") ?? "") || undefined,
    ubigeo: String(form.get("dist") ?? "") || undefined,
    activo:
      form.get("estado") === "activo" ? true : form.get("estado") === "inactivo" ? false : undefined,
  };

  const fecha = new Date().toISOString().slice(0, 10);

  /**
   * El archivo se devuelve como JSON y el navegador lo arma.
   *
   * Dentro del admin, la app va en un iframe y la sesión viaja en una cabecera
   * que solo añade el fetch de App Bridge. Un envío de formulario normal
   * (`reloadDocument`) es una petición de documento: llega sin autenticar y
   * Shopify responde con la pantalla de "indica tu dominio" en vez del archivo.
   * Con un fetcher la sesión sí viaja, y el archivo se construye en el cliente.
   */
  if (form.get("formato") === "xlsx") {
    const buffer = await exportarXlsx(tienda.id, filtro);
    return json({
      nombre: `tarifas-envio-${fecha}.xlsx`,
      tipo: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      // Base64 porque el XLSX es binario y el JSON no admite bytes crudos.
      base64: Buffer.from(buffer).toString("base64"),
    });
  }

  return json({
    nombre: `tarifas-envio-${fecha}.csv`,
    tipo: "text/csv;charset=utf-8",
    texto: await exportarCsv(tienda.id, filtro),
  });
};

export default function Exportar() {
  const { total, departamentos, provincias, distritos } = useLoaderData<typeof loader>();
  const [dep, setDep] = useState("");
  const [prov, setProv] = useState("");

  /**
   * Cambiar de departamento o provincia recarga los desplegables dependientes.
   *
   * Tiene que ser navegación de Remix, no `window.location`: dentro del admin
   * de Shopify la app va en un iframe y los parámetros de sesión (shop, host,
   * embedded, id_token) viven en la URL. Reescribir la URL a mano los borra, el
   * servidor deja de saber de qué tienda se trata y responde con la pantalla de
   * "indica tu dominio". Con useSearchParams la sesión se mantiene.
   */
  const [, setParametros] = useSearchParams();
  const descarga = useFetcher<{ nombre: string; tipo: string; texto?: string; base64?: string }>();

  /** Convierte la respuesta del servidor en un archivo y lo descarga. */
  useEffect(() => {
    const d = descarga.data;
    if (descarga.state !== "idle" || !d) return;

    let contenido: BlobPart;
    if (d.base64) {
      // De base64 a bytes: atob da caracteres, el Blob necesita un Uint8Array.
      const binario = atob(d.base64);
      const bytes = new Uint8Array(binario.length);
      for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
      contenido = bytes;
    } else {
      contenido = d.texto ?? "";
    }

    const url = URL.createObjectURL(new Blob([contenido], { type: d.tipo }));
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = d.nombre;
    enlace.click();
    URL.revokeObjectURL(url);
  }, [descarga.state, descarga.data]);

  /**
   * Cambia solo los filtros y deja intacto el resto de la URL.
   *
   * Importante: en el admin incrustado la URL lleva también shop, host,
   * embedded e id_token. Si los sobrescribiéramos, la descarga posterior
   * (que sí es un envío de documento completo) se quedaría sin sesión.
   */
  const filtrar = (cambios: Record<string, string>) =>
    setParametros(
      (previos) => {
        const siguientes = new URLSearchParams(previos);
        for (const [clave, valor] of Object.entries(cambios)) {
          if (valor) siguientes.set(clave, valor);
          else siguientes.delete(clave);
        }
        return siguientes;
      },
      { preventScrollReset: true },
    );

  return (
    <Page title="Exportar tarifas" subtitle="Descarga tus tarifas para editarlas y volver a importarlas" backAction={{ url: "/app" }}>
      <Layout>
        <Layout.Section>
          <Card>
            <descarga.Form method="post">
              <BlockStack gap="400">
                {/* BotonDescarga escribe aquí el formato antes de que el navegador envíe el formulario. */}
                <input type="hidden" name="formato" defaultValue="csv" />
                <Text as="p" variant="bodyMd">
                  Tienes <b>{total.toLocaleString("es-PE")}</b> tarifas. Puedes exportarlas todas o filtrar.
                </Text>

                <Select
                  label="Departamento"
                  name="dep"
                  options={[{ label: "Todos", value: "" }, ...departamentos.map((d) => ({ label: d.nombre, value: d.codigo }))]}
                  value={dep}
                  onChange={(v) => {
                    setDep(v);
                    setProv("");
                    filtrar({ dep: v, prov: "" });
                  }}
                />
                <Select
                  label="Provincia"
                  name="prov"
                  disabled={!dep}
                  options={[{ label: "Todas", value: "" }, ...provincias.map((p) => ({ label: p.nombre, value: p.codigo }))]}
                  value={prov}
                  onChange={(v) => {
                    setProv(v);
                    filtrar({ prov: v });
                  }}
                />
                <Select
                  label="Distrito"
                  name="dist"
                  disabled={!prov}
                  options={[{ label: "Todos", value: "" }, ...distritos.map((d) => ({ label: d.distrito, value: d.ubigeo }))]}
                />
                <CampoSelect
                  label="Estado"
                  name="estado"
                  options={[
                    { label: "Todas", value: "" },
                    { label: "Solo activas", value: "activo" },
                    { label: "Solo inactivas", value: "inactivo" },
                  ]}
                />

                <InlineStack gap="300">
                  <BotonDescarga campo="formato" valor="csv" variant="primary" loading={descarga.state !== "idle"}>
                    Descargar CSV
                  </BotonDescarga>
                  <BotonDescarga campo="formato" valor="xlsx" loading={descarga.state !== "idle"}>
                    Descargar Excel (XLSX)
                  </BotonDescarga>
                </InlineStack>
              </BlockStack>
            </descarga.Form>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">Formato del archivo</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                El archivo exportado usa exactamente las mismas columnas que espera el importador
                (id, storename, codshopify, departamento, provincia, distrito, ubigeo, rangoN_*, textos).
                Puedes editarlo en Excel y volver a subirlo sin ajustar nada.
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Las columnas que tu archivo original traía y que la app no usa se conservan y se
                devuelven al final del CSV.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
