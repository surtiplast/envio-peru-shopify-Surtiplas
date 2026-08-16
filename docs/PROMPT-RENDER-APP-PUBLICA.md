# Prompt para configurar Render (app pública)

Copia todo lo que hay entre las líneas y pégaselo a la IA. Antes de enviarlo,
rellena los cinco valores marcados con `<< >>`.

> **No pegues el Client secret ni las cadenas de la base de datos en un chat.**
> Esos van directo del panel de Shopify / Neon al panel de Render. En el prompt
> déjalos como `<<...>>`: la IA solo necesita saber **qué** variables crear, no
> su contenido.

---

Necesito configurar un servicio nuevo en Render para una app de Shopify llamada
**Innovasoft Shipping Perú**. Es un despliegue independiente del que ya tengo
(ese queda como entorno de pruebas). El código es el mismo repositorio y la misma
rama: no hay que cambiar nada del código, solo crear el servicio y sus variables.

**Servicio web**

- Name: `innovasoft-shipping-peru`
- Repositorio: `<<usuario/envio-peru-shopify>>` (el mismo del servicio actual)
- Branch: `main`
- Runtime: Node
- Region: Ohio
- Plan: Starter (de pago, no free — es producción y no debe dormirse)
- Health check path: `/salud`

**Build command** (exactamente así, en una línea):

```
npm ci --include=dev && npx prisma generate && npx prisma migrate deploy && npm run db:seed && npm run build
```

`--include=dev` es imprescindible: Render define `NODE_ENV=production` y sin esa
bandera `npm ci` se salta las devDependencies, que el build necesita.

**Start command:**

```
npm run start
```

**Variables de entorno.** Crea estas con valor fijo:

| Variable | Valor |
|---|---|
| `NODE_VERSION` | `20.18.0` |
| `SCOPES` | `write_shipping,read_orders,write_orders,read_products,write_draft_orders,write_customers` |
| `SHOPIFY_APP_URL` | `https://innovasoft-shipping-peru.onrender.com` |
| `BILLING_PLAN_NAME` | `Plan Profesional` |
| `BILLING_PLAN_AMOUNT` | `19.90` |
| `BILLING_PLAN_CURRENCY` | `USD` |
| `BILLING_TRIAL_DAYS` | `7` |
| `BILLING_TEST` | `false` |
| `GEO_PROVIDER` | `google` |
| `DNI_RUC_PROVIDER` | `api` |
| `DNI_RUC_AUTH` | `none` |
| `DNI_RUC_PARAM` | `numero` |
| `DNI_RUC_TIMEOUT_MS` | `6000` |
| `RATE_LIMIT_WINDOW_MS` | `60000` |
| `RATE_LIMIT_MAX` | `60` |

Estas dos las genera Render con un valor aleatorio largo (no las escribas tú):

- `SESSION_SIGNING_SECRET`
- `DIAGNOSTICO_CLAVE`

Y estas las dejas **creadas pero vacías**, marcadas como secretas, para que yo
pegue el valor a mano en el panel:

- `DATABASE_URL`
- `DIRECT_URL`
- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `GOOGLE_MAPS_API_KEY`
- `DNI_RUC_API_URL_DNI`
- `DNI_RUC_API_URL_RUC`
- `DNI_RUC_API_KEY`

**Importante**

- La base de datos es **nueva y vacía**, distinta de la del servicio de pruebas.
  No reutilices `DATABASE_URL` del otro servicio.
- `SESSION_SIGNING_SECRET` debe ser distinto del entorno de pruebas.
- El primer despliegue aplica las migraciones y siembra el catálogo UBIGEO; puede
  tardar unos minutos. Si falla, muéstrame el log de build completo.
- Cuando termine, dime la **IP saliente** del servicio (Settings → Outbound IPs).
  La necesito para restringir la API key de Google Maps.

Dime paso a paso qué hacer en el panel de Render, en orden, y avísame en qué
momento debo pegar cada secreto.

---

## Después de que el servicio esté arriba

Vuelve aquí y seguimos con el resto (`docs/SEGUNDA-APP-PUBLICA.md`, pasos 4 a 6):
enlazar `shopify.app.publica.toml`, copiar los bloques `[app_proxy]` y
`[webhooks]`, y desplegar la extensión de tema con
`shopify app deploy --config publica`.
