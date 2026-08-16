import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation, useRevalidator } from "@remix-run/react";
import {
  Badge, Banner, BlockStack, Box, Button, Card, Checkbox, Divider, InlineGrid,
  InlineStack, Layout, Page, Text, TextField,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { obtenerOCrearTienda } from "../lib/shopify/tienda.server";
import prisma from "../db.server";
import { obtenerDistrito } from "../lib/ubigeo/catalogo";
import { aCentimos, validarRangos } from "../lib/rates/motor";
import type { TipoMetodo } from "../lib/rates/tipos";
import { CampoCheck, CampoTexto } from "../components/campos";

const TIPOS: TipoMetodo[] = ["ESTANDAR", "EXPRESS", "RECOJO"];
const NOMBRES: Record<TipoMetodo, string> = {
  ESTANDAR: "Envío estándar",
  EXPRESS: "Envío express",
  RECOJO: "Recojo en tienda",
};
const MAX_RANGOS = 10;

interface FilaRango {
  montoMin: string;
  montoMax: string;
  costo: string;
  gratis: boolean;
}

interface MetodoVista {
  tipo: TipoMetodo;
  activo: boolean;
  etiqueta: string;
  descripcion: string;
  umbralEnvioGratis: string;
  rangos: FilaRango[];
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const tienda = await obtenerOCrearTienda(session.shop);
  const ubigeo = String(params.ubigeo);

  const distrito = obtenerDistrito(ubigeo);
  if (!distrito) throw new Response("Distrito no encontrado", { status: 404 });

  const tarifa = await prisma.tarifa.findUnique({
    where: { shopId_ubigeo: { shopId: tienda.id, ubigeo } },
    include: { metodos: { include: { rangos: { orderBy: { orden: "asc" } } } } },
  });

  const metodos: MetodoVista[] = TIPOS.map((tipo) => {
    const m = tarifa?.metodos.find((x) => x.tipo === tipo);
    return {
      tipo,
      activo: m?.activo ?? tipo === "ESTANDAR",
      etiqueta: m?.etiqueta ?? "",
      descripcion: m?.descripcion ?? "",
      umbralEnvioGratis: m?.umbralEnvioGratis ? Number(m.umbralEnvioGratis).toFixed(2) : "",
      rangos: (m?.rangos ?? []).map((r) => ({
        montoMin: Number(r.montoMin).toFixed(2),
        montoMax: r.montoMax === null ? "" : Number(r.montoMax).toFixed(2),
        costo: Number(r.costo).toFixed(2),
        gratis: r.gratis,
      })),
    };
  });

  return {
    distrito,
    existe: Boolean(tarifa),
    activo: tarifa?.activo ?? true,
    codShopify: tarifa?.codShopify ?? "",
    metodos,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const tienda = await obtenerOCrearTienda(session.shop);
  const ubigeo = String(params.ubigeo);
  const distrito = obtenerDistrito(ubigeo);
  if (!distrito) throw new Response("Distrito no encontrado", { status: 404 });

  const form = await request.formData();

  if (form.get("accion") === "eliminar") {
    await prisma.tarifa.deleteMany({ where: { shopId: tienda.id, ubigeo } });
    return redirect("/app/tarifas");
  }

  const activo = form.get("activo") === "on";
  const codShopify = String(form.get("codShopify") ?? "").trim() || null;

  const tarifa = await prisma.tarifa.upsert({
    where: { shopId_ubigeo: { shopId: tienda.id, ubigeo } },
    create: {
      shopId: tienda.id,
      ubigeo,
      codDep: distrito.codDep,
      codProv: distrito.codProv,
      nombreDep: distrito.departamento,
      nombreProv: distrito.provincia,
      nombreDist: distrito.distrito,
      activo,
      codShopify,
    },
    update: { activo, codShopify },
  });

  const avisos: string[] = [];

  for (const tipo of TIPOS) {
    const metodoActivo = form.get(`${tipo}_activo`) === "on";
    const rangos: Array<{
      orden: number; montoMin: string; montoMax: string | null; costo: string; gratis: boolean;
    }> = [];

    for (let i = 1; i <= MAX_RANGOS; i++) {
      const min = String(form.get(`${tipo}_r${i}_min`) ?? "").trim();
      const max = String(form.get(`${tipo}_r${i}_max`) ?? "").trim();
      const costo = String(form.get(`${tipo}_r${i}_costo`) ?? "").trim();
      const gratis = form.get(`${tipo}_r${i}_gratis`) === "on";
      if (min === "" && costo === "" && !gratis) continue;

      rangos.push({
        orden: rangos.length + 1,
        montoMin: Number(min || 0).toFixed(2),
        montoMax: max === "" ? null : Number(max).toFixed(2),
        costo: gratis ? "0.00" : Number(costo || 0).toFixed(2),
        gratis,
      });
    }

    const problemas = validarRangos(
      rangos.map((r) => ({
        orden: r.orden,
        montoMin: aCentimos(r.montoMin),
        montoMax: r.montoMax === null ? null : aCentimos(r.montoMax),
        costo: aCentimos(r.costo),
        gratis: r.gratis,
      })),
    );
    avisos.push(
      ...problemas.filter((p) => p.codigo !== "SIN_RANGOS").map((p) => `${NOMBRES[tipo]}: ${p.mensaje}`),
    );

    await prisma.metodoEnvio.deleteMany({ where: { tarifaId: tarifa.id, tipo } });
    if (!metodoActivo && rangos.length === 0) continue;

    const umbral = String(form.get(`${tipo}_umbral`) ?? "").trim();
    await prisma.metodoEnvio.create({
      data: {
        tarifaId: tarifa.id,
        tipo,
        activo: metodoActivo,
        etiqueta: String(form.get(`${tipo}_etiqueta`) ?? "").trim() || null,
        descripcion: String(form.get(`${tipo}_descripcion`) ?? "").trim() || null,
        umbralEnvioGratis: umbral === "" ? null : Number(umbral).toFixed(2),
        rangos: { create: rangos },
      },
    });
  }

  return { ok: true, avisos };
};

const RANGO_VACIO: FilaRango = { montoMin: "", montoMax: "", costo: "", gratis: false };

function EditorMetodo({ metodo }: { metodo: MetodoVista }) {
  const tipo = metodo.tipo;
  const [activo, setActivo] = useState(metodo.activo);
  // El estado de los rangos vive aquí, no dentro de cada input: al eliminar una
  // fila los nombres se renumeran, y con estado interno los valores se
  // descolocarían una posición.
  const [filas, setFilas] = useState<FilaRango[]>(
    metodo.rangos.length ? metodo.rangos : [{ ...RANGO_VACIO, montoMin: "0.00" }],
  );

  const cambiar = (indice: number, campo: keyof FilaRango, valor: string | boolean) => {
    setFilas((actual) =>
      actual.map((f, i) => (i === indice ? { ...f, [campo]: valor } : f)),
    );
  };

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Text as="h3" variant="headingMd">{NOMBRES[tipo]}</Text>
            {activo ? <Badge tone="success">Activo</Badge> : <Badge>Inactivo</Badge>}
          </InlineStack>
          {/* El oculto lleva el dato; la casilla es solo la interfaz.
              Un checkbox desmarcado no se envía y el método se desactivaría solo. */}
          <input type="hidden" name={`${tipo}_activo`} value={activo ? "on" : "off"} />
          <Checkbox label="Activo" checked={activo} onChange={setActivo} />
        </InlineStack>

        <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
          <CampoTexto
            label="Etiqueta que ve el comprador"
            name={`${tipo}_etiqueta`}
            valorInicial={metodo.etiqueta}
            placeholder={NOMBRES[tipo]}
          />
          <CampoTexto
            label="Descripción"
            name={`${tipo}_descripcion`}
            valorInicial={metodo.descripcion}
            placeholder="Entrega en 2 a 5 días hábiles"
          />
        </InlineGrid>

        {tipo !== "RECOJO" ? (
          <CampoTexto
            label="Envío gratis a partir de (S/)"
            helpText="Se aplica antes que los rangos. Déjalo vacío para no usarlo."
            name={`${tipo}_umbral`}
            valorInicial={metodo.umbralEnvioGratis}
            type="number"
            step={0.01}
          />
        ) : null}

        <Divider />
        <Text as="h4" variant="headingSm">Rangos por subtotal del carrito</Text>

        <BlockStack gap="200">
          {filas.map((f, i) => (
            <InlineGrid key={i} columns={{ xs: 1, md: 5 }} gap="200">
              <TextField
                label="Desde (S/)"
                labelHidden={i > 0}
                name={`${tipo}_r${i + 1}_min`}
                value={f.montoMin}
                onChange={(v) => cambiar(i, "montoMin", v)}
                type="number"
                step={0.01}
                autoComplete="off"
              />
              <TextField
                label="Hasta (S/)"
                labelHidden={i > 0}
                name={`${tipo}_r${i + 1}_max`}
                value={f.montoMax}
                onChange={(v) => cambiar(i, "montoMax", v)}
                type="number"
                step={0.01}
                placeholder="Sin límite"
                autoComplete="off"
              />
              <TextField
                label="Costo (S/)"
                labelHidden={i > 0}
                name={`${tipo}_r${i + 1}_costo`}
                value={f.costo}
                onChange={(v) => cambiar(i, "costo", v)}
                type="number"
                step={0.01}
                disabled={f.gratis}
                autoComplete="off"
              />
              <div>
                <input
                  type="hidden"
                  name={`${tipo}_r${i + 1}_gratis`}
                  value={f.gratis ? "on" : "off"}
                />
                <Checkbox
                  label="Gratis"
                  checked={f.gratis}
                  onChange={(v) => cambiar(i, "gratis", v)}
                />
              </div>
              <Button
                variant="plain"
                tone="critical"
                disabled={filas.length === 1}
                onClick={() => setFilas((actual) => actual.filter((_, j) => j !== i))}
              >
                Quitar
              </Button>
            </InlineGrid>
          ))}
        </BlockStack>

        <Box>
          <Button
            onClick={() => setFilas((actual) => [...actual, { ...RANGO_VACIO }])}
            disabled={filas.length >= MAX_RANGOS}
          >
            Añadir rango
          </Button>
        </Box>
      </BlockStack>
    </Card>
  );
}

export default function EditorTarifa() {
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

  const { distrito, existe, activo, codShopify, metodos } = useLoaderData<typeof loader>();
  const resultado = useActionData<typeof action>();
  const navegacion = useNavigation();

  return (
    <Page
      title={`${distrito.departamento} / ${distrito.provincia} / ${distrito.distrito}`}
      subtitle={`UBIGEO: ${distrito.ubigeo}`}
      backAction={{ url: "/app/tarifas" }}
    >
      {/* data-save-bar: Shopify detecta los cambios y muestra su barra nativa
          de "Cambios no guardados". Guardar dispara el submit; Descartar
          dispara reset.

          Recargamos en reset a propósito: los campos son componentes
          controlados de React, y un reset de HTML solo restaura los inputs
          nativos, dejando el estado de React con los valores modificados. La
          recarga vuelve a pedir los datos al servidor, que es lo que el
          comerciante espera de "Descartar". */}
      <Form method="post" data-save-bar onReset={descartar} key={versionFormulario}>
        <BlockStack gap="400">
          {resultado?.ok ? <Banner tone="success" title="Tarifa guardada" /> : null}
          {resultado?.avisos?.length ? (
            <Banner tone="warning" title="Revisa la escalera de rangos">
              <ul>{resultado.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
            </Banner>
          ) : null}

          <Layout>
            <Layout.Section>
              <BlockStack gap="400">
                {metodos.map((m) => <EditorMetodo key={m.tipo} metodo={m} />)}
              </BlockStack>
            </Layout.Section>

            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd">Estado</Text>
                  <CampoCheck label="Tarifa activa" name="activo" marcadoInicial={activo} />
                  <CampoTexto
                    label="Código interno"
                    name="codShopify"
                    valorInicial={codShopify}
                    helpText="Columna codshopify de tu CSV."
                  />
                  <Button submit variant="primary" loading={navegacion.state === "submitting"}>
                    Guardar cambios
                  </Button>
                  {existe ? (
                    /* Aquí no sirve un campo oculto: convive con "Guardar" en el
                       mismo formulario y se enviaría siempre. Un <button> nativo
                       con name/value solo aporta su valor cuando se pulsa él. */
                    <button
                      type="submit"
                      name="accion"
                      value="eliminar"
                      style={{
                        background: "none",
                        border: "none",
                        padding: "6px 0",
                        color: "#c5210c",
                        font: "inherit",
                        fontSize: 13,
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      Eliminar tarifa
                    </button>
                  ) : null}
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        </BlockStack>
      </Form>
    </Page>
  );
}
