import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";

/**
 * Ruta raíz.
 *
 * Shopify carga la App URL (el dominio pelado) dentro del iframe del admin, con
 * `shop` y `host` como parámetros. Sin una ruta aquí, Remix devuelve 404 y el
 * comerciante ve un panel en blanco sin ninguna pista de qué ha pasado.
 *
 * Cuando llega con `shop`, reenviamos a /app conservando TODOS los parámetros:
 * `host` y `embedded` son los que necesita App Bridge para hablar con el admin,
 * y perderlos rompe la app de forma silenciosa.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { dominioApp: url.origin };
};

export default function Portada() {
  const { dominioApp } = useLoaderData<typeof loader>();

  return (
    <main
      style={{
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif",
        maxWidth: 640,
        margin: "0 auto",
        padding: "48px 24px",
        lineHeight: 1.6,
        color: "#1a1a1a",
      }}
    >
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>Envío Perú</h1>
      <p style={{ color: "#616161", marginTop: 0 }}>
        Tarifas de envío por Departamento → Provincia → Distrito (UBIGEO) para tiendas Shopify.
      </p>

      <p style={{ marginTop: 28 }}>
        Esta es la dirección del servidor de la aplicación. No es una página para visitar
        directamente: se abre desde el panel de administración de tu tienda Shopify.
      </p>

      <div
        style={{
          background: "#f6f6f7",
          border: "1px solid #e3e3e3",
          borderRadius: 10,
          padding: "16px 20px",
          marginTop: 24,
          fontSize: 14,
        }}
      >
        <strong>Comprobaciones del servidor</strong>
        <ul style={{ margin: "10px 0 0", paddingLeft: 20 }}>
          <li>
            <a href={`${dominioApp}/salud`}>/salud</a> — estado y conexión a la base de datos
          </li>
          <li>
            <a href={`${dominioApp}/diagnostico`}>/diagnostico</a> — configuración y sesiones
          </li>
        </ul>
      </div>
    </main>
  );
}
