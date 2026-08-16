import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { unstable_createMemoryUploadHandler, unstable_parseMultipartFormData } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Badge, Banner, BlockStack, Box, Button, Card, DataTable, DropZone, InlineGrid,
  InlineStack, Layout, Page, ProgressBar, Select, Text, Thumbnail,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { obtenerOCrearTienda } from "../lib/shopify/tienda.server";
import prisma from "../db.server";
import { analizar, ejecutar, erroresACsv } from "../lib/csv/importar.server";
import type { CampoInterno } from "../lib/csv/mapeo";

/**
 * Importación en 5 pasos. El archivo se guarda en memoria entre el análisis y
 * la ejecución usando un campo oculto con su contenido, lo que evita depender
 * de almacenamiento temporal en disco. Para archivos de más de ~10 MB conviene
 * pasar a subida directa a S3 y cola de trabajos (ver docs/ARQUITECTURA.md).
 */

const CAMPOS: Array<{ label: string; value: CampoInterno }> = [
  { label: "— Ignorar —", value: "ignorar" },
  { label: "Guardar como dato extra", value: "extra" },
  { label: "ID de origen", value: "id" },
  { label: "Nombre de la tienda", value: "storename" },
  { label: "Código interno", value: "codshopify" },
  { label: "Departamento", value: "departamento" },
  { label: "Provincia", value: "provincia" },
  { label: "Distrito", value: "distrito" },
  { label: "UBIGEO", value: "ubigeo" },
  { label: "Activo", value: "activo" },
  { label: "Etiqueta estándar", value: "texto" },
  { label: "Descripción estándar", value: "texto_description" },
  { label: "Etiqueta express", value: "texto2" },
  { label: "Descripción express", value: "texto2_description" },
  { label: "Etiqueta recojo", value: "texto_collect" },
  { label: "Descripción recojo", value: "texto_collect_description" },
];

function camposDeRango(max = 10) {
  const salida: Array<{ label: string; value: CampoInterno }> = [];
  for (let i = 1; i <= max; i++) {
    salida.push(
      { label: `Rango ${i} · desde`, value: `rango${i}_min` as CampoInterno },
      { label: `Rango ${i} · hasta`, value: `rango${i}_max` as CampoInterno },
      { label: `Rango ${i} · costo`, value: `rango${i}_costo` as CampoInterno },
      { label: `Rango ${i} · costo 2`, value: `rango${i}_costo2` as CampoInterno },
      { label: `Rango ${i} · costo 3`, value: `rango${i}_costo3` as CampoInterno },
    );
  }
  return salida;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const tienda = await obtenerOCrearTienda(session.shop);
  const historial = await prisma.importacion.findMany({
    where: { shopId: tienda.id },
    orderBy: { iniciadaEn: "desc" },
    take: 5,
  });
  return { historial };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const tienda = await obtenerOCrearTienda(session.shop);

  const form = await unstable_parseMultipartFormData(
    request,
    unstable_createMemoryUploadHandler({ maxPartSize: 25 * 1024 * 1024 }),
  );

  const paso = String(form.get("paso"));
  const contenido = String(form.get("contenido") ?? "");
  const nombre = String(form.get("nombre") ?? "tarifas.csv");
  const modoCostos = (String(form.get("modoCostos") ?? "METODOS") as "METODOS" | "ALTERNATIVOS");

  if (paso === "analizar") {
    const archivo = form.get("archivo");
    const texto = archivo instanceof File ? await archivo.text() : contenido;
    const mapeoTexto = form.get("mapeo");
    const mapeo = mapeoTexto ? JSON.parse(String(mapeoTexto)) : undefined;

    const analisis = await analizar(tienda.id, archivo instanceof File ? archivo.name : nombre, texto, {
      mapeo,
      modoCostos,
    });
    return { paso: "analisis" as const, analisis, contenido: texto, nombre: archivo instanceof File ? archivo.name : nombre };
  }

  if (paso === "importar") {
    const importacionId = String(form.get("importacionId"));
    const mapeo = JSON.parse(String(form.get("mapeo")));
    const resultado = await ejecutar(tienda.id, importacionId, contenido, mapeo, { modoCostos });
    const importacion = await prisma.importacion.findUnique({ where: { id: importacionId } });
    return {
      paso: "resultado" as const,
      resultado,
      csvErrores: erroresACsv((importacion?.detalleErrores as any) ?? []),
    };
  }

  return { paso: "nada" as const };
};

export default function Importar() {
  const { historial } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  /**
   * Descarga de la plantilla.
   *
   * Se pide con un fetcher (que sí lleva la sesión del admin embebido) y el
   * archivo se construye en el navegador. Un <a download> normal no sirve aquí:
   * dentro del iframe de Shopify la petición va sin autenticar y termina en la
   * pantalla de OAuth en vez de descargando.
   */
  const plantilla = useFetcher<{ nombre: string; csv: string }>();

  useEffect(() => {
    if (plantilla.state !== "idle" || !plantilla.data?.csv) return;

    const blob = new Blob([plantilla.data.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = plantilla.data.nombre;
    enlace.click();
    URL.revokeObjectURL(url);
  }, [plantilla.state, plantilla.data]);

  const [archivo, setArchivo] = useState<File | null>(null);
  const [mapeo, setMapeo] = useState<Record<string, CampoInterno>>({});
  const [modoCostos, setModoCostos] = useState("METODOS");

  const datos = fetcher.data;
  const analisis = datos?.paso === "analisis" ? datos.analisis : null;
  const resultado = datos?.paso === "resultado" ? datos.resultado : null;
  const cargando = fetcher.state !== "idle";

  const subir = (f: File) => {
    setArchivo(f);
    const cuerpo = new FormData();
    cuerpo.set("paso", "analizar");
    cuerpo.set("archivo", f);
    cuerpo.set("modoCostos", modoCostos);
    fetcher.submit(cuerpo, { method: "post", encType: "multipart/form-data" });
  };

  const revalidar = () => {
    if (!datos || datos.paso !== "analisis") return;
    const cuerpo = new FormData();
    cuerpo.set("paso", "analizar");
    cuerpo.set("contenido", datos.contenido);
    cuerpo.set("nombre", datos.nombre);
    cuerpo.set("mapeo", JSON.stringify({ ...Object.fromEntries(analisis!.columnas.map((c) => [c.original, c.campo])), ...mapeo }));
    cuerpo.set("modoCostos", modoCostos);
    fetcher.submit(cuerpo, { method: "post", encType: "multipart/form-data" });
  };

  const importar = () => {
    if (!datos || datos.paso !== "analisis") return;
    const cuerpo = new FormData();
    cuerpo.set("paso", "importar");
    cuerpo.set("importacionId", analisis!.importacionId);
    cuerpo.set("contenido", datos.contenido);
    cuerpo.set("mapeo", JSON.stringify({ ...Object.fromEntries(analisis!.columnas.map((c) => [c.original, c.campo])), ...mapeo }));
    cuerpo.set("modoCostos", modoCostos);
    fetcher.submit(cuerpo, { method: "post", encType: "multipart/form-data" });
  };

  const descargarErrores = () => {
    if (datos?.paso !== "resultado") return;
    const blob = new Blob([datos.csvErrores], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "errores-importacion.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Page title="Importar tarifas" subtitle="Sube tu archivo CSV y revisa antes de guardar" backAction={{ url: "/app" }}>
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {/* 01 */}
            <Card>
              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <Badge tone="info">01</Badge>
                  <Text as="h2" variant="headingMd">Subir archivo</Text>
                </InlineStack>
                <DropZone accept=".csv,text/csv" type="file" allowMultiple={false} onDrop={(_a, aceptados) => aceptados[0] && subir(aceptados[0])}>
                  {archivo ? (
                    <Box padding="400">
                      <InlineStack gap="300" blockAlign="center">
                        <Thumbnail size="small" alt="csv" source="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png" />
                        <BlockStack>
                          <Text as="p" fontWeight="semibold">{archivo.name}</Text>
                          <Text as="p" variant="bodySm" tone="subdued">{(archivo.size / 1024).toFixed(0)} KB</Text>
                        </BlockStack>
                      </InlineStack>
                    </Box>
                  ) : (
                    <DropZone.FileUpload actionTitle="Arrastra tu CSV aquí" actionHint="También puedes hacer clic para elegirlo" />
                  )}
                </DropZone>
                <Box paddingBlockStart="200">
                  <Banner tone="info" title="¿No tienes un archivo todavía?">
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm">
                        Descarga la plantilla: trae los 1.874 distritos del Perú ya escritos,
                        con su UBIGEO. Solo tienes que poner los precios y volver a subirla.
                      </Text>
                      <InlineStack gap="200">
                        <Button
                          variant="primary"
                          loading={plantilla.state !== "idle"}
                          onClick={() => plantilla.load("/app/plantilla")}
                        >
                          Descargar plantilla
                        </Button>
                        <Button
                          variant="plain"
                          loading={plantilla.state !== "idle"}
                          onClick={() => plantilla.load("/app/plantilla?tipo=ejemplo")}
                        >
                          Descargar ejemplo con precios
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </Banner>
                </Box>

                <Select
                  label="¿Cómo se interpretan las columnas costo, costo2 y costo3?"
                  options={[
                    { label: "costo = estándar · costo2 = express · costo3 = precio alternativo", value: "METODOS" },
                    { label: "Las tres son precios alternativos del envío estándar", value: "ALTERNATIVOS" },
                  ]}
                  value={modoCostos}
                  onChange={(v) => { setModoCostos(v); }}
                />
              </BlockStack>
            </Card>

            {/* 02 */}
            {analisis ? (
              <Card>
                <BlockStack gap="300">
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone="info">02</Badge>
                    <Text as="h2" variant="headingMd">Revisar columnas</Text>
                  </InlineStack>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Detectamos {analisis.columnas.length} columnas. Corrige cualquier asignación que no sea correcta.
                  </Text>

                  <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
                    {analisis.columnas.map((c) => (
                      <Select
                        key={c.original}
                        label={
                          <InlineStack gap="100" blockAlign="center">
                            <Text as="span" fontWeight="semibold">{c.original}</Text>
                            {c.confianza >= 0.9 ? <Badge tone="success" size="small">auto</Badge> : c.confianza > 0 ? <Badge tone="attention" size="small">revisar</Badge> : <Badge size="small">extra</Badge>}
                          </InlineStack> as unknown as string
                        }
                        options={[...CAMPOS, ...camposDeRango()]}
                        value={mapeo[c.original] ?? c.campo}
                        onChange={(v) => setMapeo({ ...mapeo, [c.original]: v as CampoInterno })}
                        helpText={c.ejemplos.length ? `Ej.: ${c.ejemplos.join(" · ")}` : undefined}
                      />
                    ))}
                  </InlineGrid>

                  <Box><Button onClick={revalidar} loading={cargando}>Volver a validar con este mapeo</Button></Box>
                </BlockStack>
              </Card>
            ) : null}

            {/* 03 */}
            {analisis ? (
              <Card>
                <BlockStack gap="300">
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone="info">03</Badge>
                    <Text as="h2" variant="headingMd">Validar</Text>
                  </InlineStack>

                  {analisis.problemasMapeo.length ? (
                    <Banner tone="critical" title="No podemos importar todavía">
                      <ul>{analisis.problemasMapeo.map((p, i) => <li key={i}>{p}</li>)}</ul>
                    </Banner>
                  ) : null}

                  <InlineGrid columns={{ xs: 2, md: 4 }} gap="300">
                    <Box><Text as="p" variant="heading2xl">{analisis.totalFilas.toLocaleString("es-PE")}</Text><Text as="p" tone="subdued" variant="bodySm">registros encontrados</Text></Box>
                    <Box><Text as="p" variant="heading2xl" tone="success">{analisis.nuevos}</Text><Text as="p" tone="subdued" variant="bodySm">nuevos</Text></Box>
                    <Box><Text as="p" variant="heading2xl">{analisis.actualizaciones}</Text><Text as="p" tone="subdued" variant="bodySm">actualizaciones</Text></Box>
                    <Box><Text as="p" variant="heading2xl" tone="critical">{analisis.errores.length}</Text><Text as="p" tone="subdued" variant="bodySm">errores</Text></Box>
                  </InlineGrid>

                  {analisis.vistaPrevia.length ? (
                    <Box paddingBlockStart="200">
                      <Text as="h3" variant="headingSm">Vista previa</Text>
                      <DataTable
                        columnContentTypes={Object.keys(analisis.vistaPrevia[0]).slice(0, 7).map(() => "text" as const)}
                        headings={Object.keys(analisis.vistaPrevia[0]).slice(0, 7)}
                        rows={analisis.vistaPrevia.slice(0, 5).map((f) => Object.values(f).slice(0, 7).map(String))}
                      />
                    </Box>
                  ) : null}

                  {analisis.errores.length ? (
                    <Banner tone="warning" title={`${analisis.errores.length} filas con problemas`}>
                      <BlockStack gap="100">
                        {analisis.errores.slice(0, 5).map((e, i) => (
                          <Text as="p" key={i} variant="bodySm">Fila {e.fila}: {e.mensaje}</Text>
                        ))}
                        {analisis.errores.length > 5 ? <Text as="p" variant="bodySm" tone="subdued">…y {analisis.errores.length - 5} más.</Text> : null}
                      </BlockStack>
                    </Banner>
                  ) : null}

                  {analisis.avisos.length ? (
                    <Banner tone="info" title={`${analisis.avisos.length} avisos`}>
                      <BlockStack gap="100">
                        {analisis.avisos.slice(0, 5).map((a, i) => <Text as="p" key={i} variant="bodySm">{a.mensaje}</Text>)}
                      </BlockStack>
                    </Banner>
                  ) : null}
                </BlockStack>
              </Card>
            ) : null}

            {/* 04 */}
            {analisis && analisis.problemasMapeo.length === 0 ? (
              <Card>
                <BlockStack gap="300">
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone="info">04</Badge>
                    <Text as="h2" variant="headingMd">Importar</Text>
                  </InlineStack>
                  <Text as="p" variant="bodyMd">
                    Se crearán {analisis.nuevos} tarifas nuevas y se actualizarán {analisis.actualizaciones}.
                    Las filas con error se omiten; el resto se importa igual.
                  </Text>
                  {cargando ? <ProgressBar progress={60} size="small" /> : null}
                  <Box><Button variant="primary" onClick={importar} loading={cargando} disabled={analisis.validos === 0}>Confirmar importación</Button></Box>
                </BlockStack>
              </Card>
            ) : null}

            {/* 05 */}
            {resultado ? (
              <Card>
                <BlockStack gap="300">
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone="success">05</Badge>
                    <Text as="h2" variant="headingMd">Resultado</Text>
                  </InlineStack>
                  <InlineGrid columns={{ xs: 2, md: 4 }} gap="300">
                    <Box><Text as="p" variant="heading2xl" tone="success">{resultado.nuevos}</Text><Text as="p" tone="subdued" variant="bodySm">nuevos</Text></Box>
                    <Box><Text as="p" variant="heading2xl">{resultado.actualizados}</Text><Text as="p" tone="subdued" variant="bodySm">actualizados</Text></Box>
                    <Box><Text as="p" variant="heading2xl">{resultado.duplicados}</Text><Text as="p" tone="subdued" variant="bodySm">duplicados</Text></Box>
                    <Box><Text as="p" variant="heading2xl" tone="critical">{resultado.errores}</Text><Text as="p" tone="subdued" variant="bodySm">errores</Text></Box>
                  </InlineGrid>
                  <InlineStack gap="200">
                    <Button variant="primary" url="/app/tarifas">Ver mis tarifas</Button>
                    {resultado.errores > 0 ? <Button onClick={descargarErrores}>Descargar errores (CSV)</Button> : null}
                  </InlineStack>
                </BlockStack>
              </Card>
            ) : null}
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">Importaciones recientes</Text>
              {historial.length === 0 ? (
                <Text as="p" tone="subdued">Aún no hay importaciones.</Text>
              ) : (
                historial.map((h) => (
                  <BlockStack key={h.id} gap="050">
                    <Text as="p" fontWeight="semibold" variant="bodySm">{h.archivo}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {new Date(h.iniciadaEn).toLocaleString("es-PE")} · {h.estado}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {h.nuevos} nuevos · {h.actualizados} actualizados · {h.errores} errores
                    </Text>
                  </BlockStack>
                ))
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
