import { useCallback, useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
import {
  Badge, BlockStack, Button, Card, ChoiceList, EmptyState, IndexFilters, IndexTable,
  InlineStack, Page, Select, Text, useIndexResourceState, useSetIndexFiltersMode,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { obtenerOCrearTienda } from "../lib/shopify/tienda.server";
import prisma from "../db.server";
import { condicionesDe } from "../lib/csv/exportar.server";
import { listarDepartamentos, listarProvincias } from "../lib/ubigeo/catalogo";

/**
 * Cuántas tarifas se ven de una vez.
 *
 * Con 1874 distritos, revisar de 50 en 50 son 38 páginas. Dejamos elegir hasta
 * 200: por encima de eso la tabla de Polaris empieza a ir lenta al marcar filas,
 * y el comerciante gana más filtrando por departamento que cargando todo.
 */
const TAMANOS = [50, 100, 200];
const POR_PAGINA_POR_DEFECTO = 50;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const tienda = await obtenerOCrearTienda(session.shop);
  const url = new URL(request.url);

  const pagina = Math.max(1, Number(url.searchParams.get("pagina") ?? 1));
  // Solo aceptamos los tamaños de la lista: así nadie puede pedir 100000 filas
  // por la URL y tumbar la pantalla.
  const solicitado = Number(url.searchParams.get("porPagina") ?? POR_PAGINA_POR_DEFECTO);
  const porPagina = TAMANOS.includes(solicitado) ? solicitado : POR_PAGINA_POR_DEFECTO;
  const busqueda = url.searchParams.get("q") ?? undefined;
  const codDep = url.searchParams.get("dep") || undefined;
  const codProv = url.searchParams.get("prov") || undefined;
  const estado = url.searchParams.get("estado") || undefined;

  const where = condicionesDe(tienda.id, {
    busqueda,
    codDep,
    codProv,
    activo: estado === "activo" ? true : estado === "inactivo" ? false : undefined,
  });

  const [total, tarifas] = await Promise.all([
    prisma.tarifa.count({ where }),
    prisma.tarifa.findMany({
      where,
      include: { metodos: { include: { rangos: { orderBy: { orden: "asc" } } } } },
      orderBy: [{ nombreDep: "asc" }, { nombreProv: "asc" }, { nombreDist: "asc" }],
      skip: (pagina - 1) * porPagina,
      take: porPagina,
    }),
  ]);

  return {
    total,
    pagina,
    paginas: Math.max(1, Math.ceil(total / porPagina)),
    porPagina,
    departamentos: listarDepartamentos(),
    provincias: codDep ? listarProvincias(codDep) : [],
    filas: tarifas.map((t) => {
      const estandar = t.metodos.find((m) => m.tipo === "ESTANDAR");
      const express = t.metodos.find((m) => m.tipo === "EXPRESS");
      const resumen = (m?: typeof estandar) => {
        if (!m || !m.activo || m.rangos.length === 0) return "—";
        const costos = m.rangos.map((r) => (r.gratis ? "Gratis" : `S/ ${Number(r.costo).toFixed(2)}`));
        return costos.length > 2 ? `${costos[0]} … ${costos[costos.length - 1]}` : costos.join(" / ");
      };
      return {
        id: t.id,
        ubigeo: t.ubigeo,
        departamento: t.nombreDep,
        provincia: t.nombreProv,
        distrito: t.nombreDist,
        activo: t.activo,
        estandar: resumen(estandar),
        express: resumen(express),
        rangos: estandar?.rangos.length ?? 0,
      };
    }),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const tienda = await obtenerOCrearTienda(session.shop);
  const form = await request.formData();
  const accion = String(form.get("accion"));
  const ids = String(form.get("ids") ?? "").split(",").filter(Boolean);

  // Filtrar SIEMPRE por shopId: un id de otra tienda simplemente no coincide.
  const where = { id: { in: ids }, shopId: tienda.id };

  if (accion === "activar") await prisma.tarifa.updateMany({ where, data: { activo: true } });
  if (accion === "desactivar") await prisma.tarifa.updateMany({ where, data: { activo: false } });
  if (accion === "eliminar") await prisma.tarifa.deleteMany({ where });

  return { ok: true, afectados: ids.length, accion };
};

export default function Tarifas() {
  const datos = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const navegar = useNavigate();
  const fetcher = useFetcher<typeof action>();
  const { mode, setMode } = useSetIndexFiltersMode();
  const [consulta, setConsulta] = useState(params.get("q") ?? "");

  /**
   * Gestión de la selección.
   *
   * Polaris avisa de cuatro cosas distintas por el mismo callback: marcar una
   * fila, marcar la página entera, marcar un rango con Shift, y "seleccionar
   * todo". Escribir eso a mano es donde me equivoqué antes; este hook de Polaris
   * lo resuelve entero.
   */
  const { selectedResources: seleccion, allResourcesSelected, handleSelectionChange, clearSelection } =
    useIndexResourceState(datos.filas as unknown as Array<{ [key: string]: unknown; id: string }>);

  const actualizar = useCallback(
    (clave: string, valor?: string) => {
      const nuevos = new URLSearchParams(params);
      if (valor) nuevos.set(clave, valor);
      else nuevos.delete(clave);
      if (clave !== "pagina") nuevos.delete("pagina");
      if (clave === "dep") nuevos.delete("prov");
      setParams(nuevos);
    },
    [params, setParams],
  );

  const filtros = useMemo(
    () => [
      {
        key: "dep",
        label: "Departamento",
        filter: (
          <ChoiceList
            title="Departamento"
            titleHidden
            choices={datos.departamentos.map((d) => ({ label: d.nombre, value: d.codigo }))}
            selected={params.get("dep") ? [params.get("dep")!] : []}
            onChange={(v) => actualizar("dep", v[0])}
          />
        ),
        shortcut: true,
      },
      {
        key: "prov",
        label: "Provincia",
        disabled: !params.get("dep"),
        filter: (
          <ChoiceList
            title="Provincia"
            titleHidden
            choices={datos.provincias.map((p) => ({ label: p.nombre, value: p.codigo }))}
            selected={params.get("prov") ? [params.get("prov")!] : []}
            onChange={(v) => actualizar("prov", v[0])}
          />
        ),
      },
      {
        key: "estado",
        label: "Estado",
        filter: (
          <ChoiceList
            title="Estado"
            titleHidden
            choices={[{ label: "Activas", value: "activo" }, { label: "Inactivas", value: "inactivo" }]}
            selected={params.get("estado") ? [params.get("estado")!] : []}
            onChange={(v) => actualizar("estado", v[0])}
          />
        ),
        shortcut: true,
      },
    ],
    [datos, params, actualizar],
  );

  const filtrosAplicados = ["dep", "prov", "estado"]
    .filter((k) => params.get(k))
    .map((k) => ({
      key: k,
      label:
        k === "dep" ? `Departamento: ${datos.departamentos.find((d) => d.codigo === params.get("dep"))?.nombre}`
        : k === "prov" ? `Provincia: ${datos.provincias.find((p) => p.codigo === params.get("prov"))?.nombre}`
        : `Estado: ${params.get("estado")}`,
      onRemove: () => actualizar(k, undefined),
    }));

  const enLote = (accion: string) => {
    fetcher.submit({ accion, ids: seleccion.join(",") }, { method: "post" });
    clearSelection();
  };

  if (datos.total === 0 && filtrosAplicados.length === 0 && !consulta) {
    return (
      <Page title="Tarifas de envío">
        <Card>
          <EmptyState
            heading="Todavía no hay tarifas"
            action={{ content: "Crear una tarifa", url: "/app/tarifas/nueva" }}
            secondaryAction={{ content: "Importar CSV", url: "/app/importar" }}
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <p>
              Crea la primera eligiendo departamento, provincia y distrito, o importa un archivo
              con todas de una vez.
            </p>
          </EmptyState>
        </Card>
      </Page>
    );
  }

  return (
    <Page
      title="Tarifas de envío"
      subtitle={`${datos.total.toLocaleString("es-PE")} distritos configurados`}
      primaryAction={{ content: "Nueva tarifa", url: "/app/tarifas/nueva" }}
      secondaryActions={[
        { content: "Importar", url: "/app/importar" },
        { content: "Exportar", url: "/app/exportar" },
      ]}
    >
      <Card padding="0">
        <IndexFilters
          queryValue={consulta}
          queryPlaceholder="Buscar distrito, provincia, UBIGEO o código"
          onQueryChange={setConsulta}
          onQueryClear={() => { setConsulta(""); actualizar("q", undefined); }}
          onClearAll={() => setParams(new URLSearchParams())}
          filters={filtros}
          appliedFilters={filtrosAplicados}
          mode={mode}
          setMode={setMode}
          tabs={[]}
          selected={0}
          canCreateNewView={false}
          onQueryFocus={() => {}}
          loading={fetcher.state !== "idle"}
        />
        <IndexTable
          resourceName={{ singular: "tarifa", plural: "tarifas" }}
          itemCount={datos.filas.length}
          selectedItemsCount={allResourcesSelected ? "All" : seleccion.length}
          onSelectionChange={handleSelectionChange}
          promotedBulkActions={[
            { content: "Activar", onAction: () => enLote("activar") },
            { content: "Desactivar", onAction: () => enLote("desactivar") },
          ]}
          bulkActions={[
            { content: "Eliminar tarifas", onAction: () => enLote("eliminar") },
          ]}
          headings={[
            { title: "Departamento" }, { title: "Provincia" }, { title: "Distrito" },
            { title: "UBIGEO" }, { title: "Estándar" }, { title: "Express" },
            { title: "Estado" }, { title: "" },
          ]}
        >
          {datos.filas.map((f, i) => (
            <IndexTable.Row id={f.id} key={f.id} position={i} selected={seleccion.includes(f.id)}>
              <IndexTable.Cell><Text as="span" tone="subdued">{f.departamento}</Text></IndexTable.Cell>
              <IndexTable.Cell><Text as="span" tone="subdued">{f.provincia}</Text></IndexTable.Cell>
              <IndexTable.Cell><Text as="span" fontWeight="semibold">{f.distrito}</Text></IndexTable.Cell>
              <IndexTable.Cell><Text as="span" tone="subdued">{f.ubigeo}</Text></IndexTable.Cell>
              <IndexTable.Cell>{f.estandar}</IndexTable.Cell>
              <IndexTable.Cell>{f.express}</IndexTable.Cell>
              <IndexTable.Cell>
                <Badge tone={f.activo ? "success" : undefined}>{f.activo ? "Activa" : "Inactiva"}</Badge>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Button variant="plain" onClick={() => navegar(`/app/tarifas/${f.ubigeo}`)}>Editar</Button>
              </IndexTable.Cell>
            </IndexTable.Row>
          ))}
        </IndexTable>
      </Card>

      <InlineStack align="center" blockAlign="center" gap="300">
        <Select
          label="Por página"
          labelInline
          options={TAMANOS.map((n) => ({ label: String(n), value: String(n) }))}
          value={String(datos.porPagina)}
          onChange={(v) => actualizar("porPagina", v)}
        />
        {datos.paginas > 1 ? (
          <>
            <Button
              disabled={datos.pagina <= 1}
              onClick={() => actualizar("pagina", String(datos.pagina - 1))}
            >
              Anterior
            </Button>
            <Text as="span" variant="bodySm">Página {datos.pagina} de {datos.paginas}</Text>
            <Button
              disabled={datos.pagina >= datos.paginas}
              onClick={() => actualizar("pagina", String(datos.pagina + 1))}
            >
              Siguiente
            </Button>
          </>
        ) : null}
      </InlineStack>
    </Page>
  );
}
