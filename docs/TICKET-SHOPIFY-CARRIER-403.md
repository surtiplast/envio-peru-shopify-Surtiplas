# Ticket para el soporte de Shopify Partners — CarrierService 403

Copia el bloque de abajo y envíalo por el canal de soporte para Partners
(dev.shopify.com → Help → Contact support). Está en inglés porque su equipo
técnico trabaja así, y eso evita una primera respuesta genérica.

Antes de enviarlo, sustituye `<APP_CLIENT_ID>` y `<STORE>.myshopify.com` si han
cambiado.

---

**Subject:** Public app gets HTTP 403 on `carrierServices` / `carrierServiceCreate` on a development store, while an equivalent custom app works

Hello,

I'm getting a persistent `HTTP 403 — GraphQL Client: Forbidden` when my public
app tries to read or create a CarrierService. The response body is empty (`{}`),
so there's no field-level error message to work from.

**App:** Innovasoft Shipping Perú
**Client ID:** `1b4397496ff21b2e06f8f60ee28751c2`
**Store:** `innovasoft-tarifa-peru-zwofsfdx.myshopify.com` (development store)
**Also reproduced on:** `prueba-cdckbljx.myshopify.com` (development store)
**API version:** 2026-07
**Library:** `@shopify/shopify-app-remix` 3.x, token exchange / managed install

**The failing call** is simply:

```graphql
{ carrierServices(first: 50) { nodes { id name } } }
```

and equally `carrierServiceCreate`.

**What I have already verified:**

1. `write_shipping` **is** in the app's requested scopes and **is** granted in
   the session. I print `session.scope` in my admin UI and it includes
   `write_shipping`.
2. The store is a **development store**, so it meets the CarrierService
   eligibility requirement documented at
   https://shopify.dev/docs/api/admin-graphql/latest/objects/DeliveryCarrierService
3. The session is fresh: the logs show `Requesting offline access token` →
   `Creating new session` after the last scope change, so the token is not
   stale.
4. I removed `write_customers` from the scopes in case an unapproved protected
   customer data scope was restricting the whole Admin API. **The 403 persists.**
5. **The same codebase, deployed as a custom-distribution app** (client ID
   `e1c11f87ba42acdb0a63898f0f133f47`), registers the CarrierService without any
   problem on a development store. The only differences between the two apps
   are the distribution method and the protected customer data status.
6. Protected customer data access for the public app is selected with fields
   (name, email, phone, address) and shows as **"Preliminary"**, with a message
   saying it was not approved for public review.
7. I deleted every row from my session table and let the app perform a fresh
   token exchange, so the access token in use was issued minutes ago, for this
   client ID, on this store. **The 403 is identical with a brand-new token.**
8. I verified the server-side configuration from my own diagnostics endpoint:
   `SHOPIFY_API_KEY` matches the client ID, `SHOPIFY_API_SECRET` has the
   expected `shpss_` format, `SHOPIFY_APP_URL` matches the app URL exactly, and
   the requested scopes are
   `write_shipping,read_orders,write_orders,read_products,write_draft_orders`.

**My question:**

Is Admin API access for a public app restricted — beyond the documented
field-level redaction — while its protected customer data request is in
"Preliminary" state? The documentation says development-store access is granted
after selecting data use in step 5, without needing review, but the behaviour I
see is a blanket 403 on an endpoint (`carrierServices`) that isn't protected
customer data at all.

If that isn't the cause, could you check what is blocking this specific app's
access to the CarrierService resource?

Thank you,
Rolando Blas — InnovaSoft

---

## Qué esperar

Suelen responder en 1–3 días hábiles. Si la primera respuesta es genérica
—«revisa que tengas write_shipping»— contesta señalando el punto 1 y el punto 5:
que el permiso está concedido y que la misma base de código funciona como app
personalizada. Eso normalmente escala el caso a alguien técnico.

## Mientras tanto

- La app personalizada **Envío Perú** sigue funcionando para tus tiendas.
- La app pública funciona en todo lo demás: panel, formulario, calculadora,
  importación y exportación. Lo único bloqueado son las tarifas en el checkout.
