# Crear la app con distribución personalizada

La app personalizada creada desde el admin de la tienda no sirve para este
proyecto: Shopify no le permite usar App Proxy, panel embebido ni extensiones
de tema. Sin App Proxy, el formulario del comprador no puede leer el carrito.

La solución no es publicar la app en la App Store. Es crearla en el panel de
desarrollador y elegir **distribución personalizada**: la app se instala en una
única tienda mediante un enlace, no se publica, y conserva todas las
capacidades que necesitamos.

| | App del admin | Distribución personalizada | App pública |
|---|---|---|---|
| App Proxy (`/apps/envio`) | ❌ | ✅ | ✅ |
| Panel embebido | ❌ | ✅ | ✅ |
| Extensiones de tema | ❌ | ✅ | ✅ |
| CarrierService | ✅ | ✅ | ✅ |
| Billing API | ❌ | ❌ | ✅ |
| Revisión de Shopify | no | no | sí |

La Billing API es lo único que se pierde, y no la necesitas: la app es para tu
propia tienda, no vas a cobrarle a nadie por usarla.

---

## 1. Crear la cuenta y la app

1. Entra a <https://partners.shopify.com> y crea la cuenta (es gratis).
   Shopify ha ido moviendo la creación de apps al **Dev Dashboard**; si te
   redirige ahí, es correcto, es el mismo sitio con otra interfaz.
2. **Apps → Create app**. Nómbrala `Envío Perú`.
3. Si te pregunta cómo quieres construirla, elige la opción manual o «sin
   plantilla»: el código ya lo tienes.

## 2. Elegir distribución personalizada

En la app → sección **Distribution** (o *Distribución*):

1. Elige **Custom distribution** / *Distribución personalizada*.
2. Te pedirá el dominio de la tienda. Pon el tuyo:
   `surtiplast.myshopify.com` (el dominio `.myshopify.com`, no el dominio
   comercial).

> **La elección de distribución no se puede cambiar después.** Si te equivocas
> y eliges pública, tendrás que crear otra app desde cero. Léelo dos veces
> antes de confirmar.

## 3. Configurar las URLs

Necesitas la URL de tu servicio en Render. Es la que ya está desplegada:
`https://envio-peru.onrender.com` (confírmala en el panel de Render).

En la configuración de la app:

- **App URL:** `https://envio-peru.onrender.com`
- **Allowed redirection URLs:**
  - `https://envio-peru.onrender.com/auth/callback`
  - `https://envio-peru.onrender.com/auth/shopify/callback`

**App proxy** — esto es lo que sirve el formulario del comprador:

- **Prefix:** `apps`
- **Subpath:** `envio`
- **Proxy URL:** `https://envio-peru.onrender.com/proxy`

> En el Dev Dashboard, el App Proxy puede estar dentro de
> *Versions → Create a version → App proxy* en vez de en una pantalla de
> ajustes suelta. Si no lo encuentras a la primera, búscalo ahí.

**Permisos (scopes)** que pide la app:

```
write_shipping,read_orders,write_orders,read_products,write_draft_orders,write_customers
```

## 4. Copiar las credenciales nuevas

En la app, apartado de credenciales (*Client credentials* o *API credentials*):

- **Client ID** → irá en `SHOPIFY_API_KEY`
- **Client secret** → irá en `SHOPIFY_API_SECRET`

Ojo con el formato: el Client ID de una app del panel de desarrollador es una
cadena hexadecimal larga, **sin** el prefijo `shpss_`. Si lo que copias empieza
por `shpss_`, es un secreto, no el ID — los estás confundiendo.

## 5. Actualizar Render

Servicio `envio-peru` → *Environment*:

| Variable | Valor |
|---|---|
| `SHOPIFY_API_KEY` | El Client ID nuevo |
| `SHOPIFY_API_SECRET` | El Client secret nuevo |
| `SHOPIFY_APP_URL` | `https://envio-peru.onrender.com` |

Las credenciales de la app anterior ya no valen: bórralas y pon estas.

Ahora que conoces la URL definitiva, conviene fijar `SHOPIFY_APP_URL` en vez de
dejar que la app la deduzca de `RENDER_EXTERNAL_URL`. Es más explícito y no
cambia si algún día pones un dominio propio.

Guarda; Render redespliega solo.

## 6. Instalar en tu tienda

En la app → *Distribution* → copia el **enlace de instalación** que Shopify
generó para `surtiplast.myshopify.com`. Ábrelo, revisa los permisos y acepta.

Deberías aterrizar en el panel de la app dentro de tu admin de Shopify, con el
aviso de que aún no hay tarifas configuradas.

## 7. La primera prueba real

1. **Importar** → sube `data/tarifas-ejemplo.csv` del repositorio (1.874
   distritos). Revisa que el mapeo automático sea correcto y confirma.
2. **Probar tarifa** → Lima / Lima / Magdalena del Mar, subtotal 150.
   Debe dar **S/ 10.00** y decir que aplicó el rango 2.
3. Añade un producto al carrito y abre
   `https://surtiplast.myshopify.com/apps/envio`.

Ese último paso es el momento de la verdad: la primera ejecución completa del
formulario del comprador.

---

## Lo que hay que comprobar aparte: el plan de la tienda

El CarrierService —la pieza que hace que la tarifa aparezca **calculada dentro
del checkout**— tiene un requisito de plan. Según la documentación de Shopify,
la tienda debe estar en plan Advanced o superior, en plan Grow con
facturación ANUAL (o con el complemento de envío calculado contratado), o ser
una tienda de desarrollo.

Míralo en tu admin → *Configuración → Plan*.

**Si tu tienda no cumple**, el resto de la app funciona igual: el formulario
calcula y muestra la tarifa correcta, y la guarda en los atributos del carrito
para que quede en el pedido. Lo que no ocurrirá es que ese importe aparezca
como opción de envío calculada dentro del checkout; ahí Shopify mostrará las
tarifas manuales que tengas configuradas.

Es la diferencia entre «el cliente ve el precio correcto antes de pagar» y
«Shopify le cobra ese precio exacto». Conviene saberlo antes de la prueba, para
no interpretar el resultado como un fallo del código.

---

## Nota sobre la sección Suscripción del panel

La app incluye una pantalla de suscripción que usa la Billing API. Con
distribución personalizada esa API no está disponible, así que ese botón dará
error si lo pulsas. No afecta a nada más. Cuando quieras, se puede ocultar esa
sección en un par de minutos.
