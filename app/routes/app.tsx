import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, isRouteErrorResponse, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisEstilos from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";
import { obtenerOCrearTienda } from "../lib/shopify/tienda.server";

export const links = () => [{ rel: "stylesheet", href: polarisEstilos }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const tienda = await obtenerOCrearTienda(session.shop);
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    carrierEstado: tienda.carrierServiceEstado,
  };
};

export default function Layout() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">Dashboard</Link>
        <Link to="/app/tarifas">Tarifas de envío</Link>
        <Link to="/app/recojo">Recojo en tienda</Link>
        <Link to="/app/importar">Importar</Link>
        <Link to="/app/exportar">Exportar</Link>
        <Link to="/app/probador">Probar tarifa</Link>
        <Link to="/app/personalizacion">Personalización</Link>
        <Link to="/app/configuracion">Configuración</Link>
        <Link to="/app/suscripcion">Suscripción</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

/**
 * Frontera de errores visible.
 *
 * `boundary.error` de Shopify se encarga de los casos que la librería sabe
 * manejar (redirecciones de autenticación, sobre todo), pero cuando el fallo es
 * otro deja la pantalla en blanco dentro del iframe y el motivo se pierde.
 * Aquí lo mostramos en texto plano, sin Polaris ni App Bridge, para que
 * cualquier error sea legible aunque el marco de la app no llegue a montarse.
 */
export function ErrorBoundary() {
  const error = useRouteError();

  /**
   * Todo lo que sea una respuesta HTTP se lo pasamos a Shopify.
   *
   * Ojo con `error instanceof Response`: en Remix ESO CASI NUNCA SE CUMPLE.
   * Cuando el loader lanza una Response, el ErrorBoundary la recibe convertida
   * en un ErrorResponse (un objeto plano con status/statusText/data), no en una
   * instancia de Response. Comprobar solo `instanceof` dejaba pasar de largo
   * las redirecciones de reautorización que Shopify lanza cuando cambian los
   * scopes: en vez de reautorizar, la app mostraba «[object Object]» y no
   * cargaba nada.
   */
  if (error instanceof Response || isRouteErrorResponse(error)) {
    return boundary.error(error);
  }

  const mensaje = error instanceof Error ? error.message : String(error);
  const pila = error instanceof Error ? error.stack : undefined;

  return (
    <div
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        padding: 24,
        lineHeight: 1.5,
        color: "#1a1a1a",
      }}
    >
      <h1 style={{ fontSize: 18, marginBottom: 4 }}>La app no pudo cargar</h1>
      <p style={{ fontSize: 13, color: "#616161", marginTop: 0 }}>
        Este mensaje viene del servidor de la app, no de Shopify.
      </p>
      <pre
        style={{
          background: "#fdeceb",
          border: "1px solid #f0b3ad",
          borderRadius: 8,
          padding: 16,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          fontSize: 13,
        }}
      >
        {mensaje}
      </pre>
      {pila ? (
        <details>
          <summary style={{ cursor: "pointer", fontSize: 13 }}>Ver detalle técnico</summary>
          <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{pila}</pre>
        </details>
      ) : null}
      <p style={{ fontSize: 13, marginTop: 20 }}>
        Comprueba también <code>/diagnostico</code> y <code>/salud</code> en el dominio de la app.
      </p>
    </div>
  );
}

export const headers: HeadersFunction = (args) => boundary.headers(args);
