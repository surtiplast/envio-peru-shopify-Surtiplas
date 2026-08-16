import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useRouteError,
} from "@remix-run/react";

export default function App() {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link rel="stylesheet" href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css" />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

/**
 * Frontera de errores raíz.
 *
 * Sin esto, un 404 o un fallo fuera de /app deja la página completamente vacía.
 * Dentro del iframe de Shopify eso es indistinguible de "la app no funciona",
 * y no deja ninguna pista de por dónde empezar a mirar.
 */
export function ErrorBoundary() {
  const error = useRouteError();
  const esRespuesta = isRouteErrorResponse(error);

  const titulo = esRespuesta
    ? `${error.status} · ${error.statusText}`
    : "Se produjo un error";

  const detalle = esRespuesta
    ? error.status === 404
      ? "La dirección solicitada no existe en esta aplicación."
      : String(error.data ?? "")
    : error instanceof Error
      ? error.message
      : String(error);

  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>{titulo}</title>
        <Meta />
        <Links />
      </head>
      <body
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          padding: 24,
          lineHeight: 1.6,
          color: "#1a1a1a",
        }}
      >
        <h1 style={{ fontSize: 18, marginBottom: 4 }}>{titulo}</h1>
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
          {detalle}
        </pre>
        <p style={{ fontSize: 13 }}>
          Comprueba <code>/salud</code> y <code>/diagnostico</code> en el dominio de la app.
        </p>
        <Scripts />
      </body>
    </html>
  );
}
