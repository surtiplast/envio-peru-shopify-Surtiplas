import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { login } from "../shopify.server";

/**
 * Ruta de inicio de sesión.
 *
 * La librería de Shopify reserva `/auth/login` y exige que aquí se llame a
 * `login()`, no a `authenticate.admin()`. Sin esta ruta, el comodín
 * `auth.$.tsx` captura la dirección, llama a la función equivocada y la
 * librería aborta con "Detected call to shopify.authenticate.admin() from
 * configured login path".
 *
 * Se llega aquí cuando la app necesita (re)autenticarse y no puede deducir la
 * tienda: por ejemplo al abrir la app fuera del admin, o si la sesión se perdió.
 * `login()` lanza una redirección al OAuth cuando el dominio es válido; si no,
 * devuelve el error para mostrarlo en el formulario.
 */

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const errores = await login(request);
  return { errores: errores as Record<string, string> };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errores = await login(request);
  return { errores: errores as Record<string, string> };
};

export default function IniciarSesion() {
  const datos = useLoaderData<typeof loader>();
  const resultado = useActionData<typeof action>();
  const errores = resultado?.errores ?? datos.errores ?? {};

  return (
    <main
      style={{
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif",
        maxWidth: 460,
        margin: "0 auto",
        padding: "64px 24px",
        lineHeight: 1.6,
        color: "#1a1a1a",
      }}
    >
      <h1 style={{ fontSize: 24, marginBottom: 6 }}>Envío Perú</h1>
      <p style={{ color: "#616161", marginTop: 0, marginBottom: 28 }}>
        Indica tu tienda para instalar o abrir la aplicación.
      </p>

      <Form method="post">
        <label htmlFor="shop" style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
          Dominio de tu tienda
        </label>
        <input
          id="shop"
          type="text"
          name="shop"
          placeholder="mi-tienda.myshopify.com"
          autoComplete="off"
          style={{
            width: "100%",
            minHeight: 44,
            padding: "10px 12px",
            fontSize: 16,
            border: `1px solid ${errores.shop ? "#c5210c" : "#cdcdcd"}`,
            borderRadius: 8,
            boxSizing: "border-box",
          }}
        />
        <p style={{ fontSize: 12.5, color: "#616161", marginTop: 6 }}>
          Es el dominio <code>.myshopify.com</code>, no tu dominio comercial. Lo ves en la
          dirección del admin: <code>admin.shopify.com/store/<b>tu-tienda</b></code>.
        </p>

        {errores.shop ? (
          <p style={{ color: "#c5210c", fontSize: 13, marginTop: 8 }}>{errores.shop}</p>
        ) : null}

        <button
          type="submit"
          style={{
            width: "100%",
            minHeight: 46,
            marginTop: 18,
            background: "#0B5CFF",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 650,
            cursor: "pointer",
          }}
        >
          Continuar
        </button>
      </Form>
    </main>
  );
}
