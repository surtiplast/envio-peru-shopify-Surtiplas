# Crear la segunda app (pública) sin tocar el código

La app actual (`Envío Perú`, client_id `e1c11f87…`) se creó con **distribución
personalizada** y Shopify no deja cambiar eso. Para venderla en la App Store hay
que crear una app nueva con distribución pública.

La buena noticia: **es el mismo repositorio y el mismo código**. No se cambia ni
una línea, no hace falta otra rama. Solo se duplica lo de fuera: una app en
Shopify, un servicio en Render y una base de datos.

Al terminar quedan dos entornos independientes:

| | Actual (pruebas) | Nueva (producción) |
|---|---|---|
| App de Shopify | Envío Perú (personalizada) | Envío Perú (pública) |
| Servicio Render | `envio-peru` | `envio-peru-publica` |
| Base de datos | la de ahora | una nueva, vacía |
| Config local | `shopify.app.envo-per.toml` | `shopify.app.publica.toml` |

---

## 1. Base de datos nueva

En Neon (o en Render, donde tengas la actual), crea **otra base**. Copia las dos
cadenas de conexión: la del pooler (`DATABASE_URL`) y la directa (`DIRECT_URL`).

> No compartas la base entre los dos entornos. Aunque todo está separado por
> tienda y técnicamente funcionaría, mezclarías tarifas de prueba con las de
> clientes reales, y cualquier experimento tuyo tocaría datos de producción.

## 2. App nueva en el Partner Dashboard

1. Partners → **Apps** → **Create app** → **Create app manually**.
2. Nombre: el que vaya a ver el público (por ejemplo `Envío Perú`).
3. Cuando pregunte por la distribución elige **Public distribution**.
   Esta elección **tampoco se puede cambiar después**: revísala dos veces.
4. Guarda el **Client ID** y el **Client secret** de la pestaña *API credentials*.

Todavía no rellenes las URLs: las pone el CLI en el paso 4.

## 3. Servicio nuevo en Render

Render → **New** → **Web Service** → el **mismo repositorio de GitHub**.

- Name: `envio-peru-publica`
- Branch: `main` (la misma; ambos servicios despliegan del mismo commit)
- Region: Ohio
- Build command y Start command: los mismos que el servicio actual
  (están en `render.yaml`, cópialos tal cual)
- Health check path: `/salud`

Variables de entorno: las mismas que el servicio actual **salvo estas cinco**,
que son propias de este entorno:

```
DATABASE_URL        → la base nueva (con pooler)
DIRECT_URL          → la base nueva (directa)
SHOPIFY_API_KEY     → el Client ID de la app nueva
SHOPIFY_API_SECRET  → el Client secret de la app nueva
SHOPIFY_APP_URL     → https://envio-peru-publica.onrender.com
```

Y además:

- `SESSION_SIGNING_SECRET`: **genera uno distinto**, no reutilices el de pruebas.
- `DIAGNOSTICO_CLAVE`: otra clave larga, distinta también.
- `BILLING_TEST`: en `false` cuando vayas a cobrar de verdad.
- `GEO_PROVIDER`: `google`, con su `GOOGLE_MAPS_API_KEY`.
  Si restringiste la key de Google por IP, añade la IP saliente del servicio
  nuevo (Render la muestra en *Settings → Outbound IPs*).

El primer despliegue aplica las migraciones y siembra el catálogo UBIGEO solo.

## 4. Enlazar la config local

En la carpeta del proyecto:

```powershell
shopify app config link
```

Elige la app nueva y, cuando pida nombre para la configuración, escribe
`publica`. Se creará `shopify.app.publica.toml` y pasará a ser la config por
defecto.

Abre ese archivo y comprueba que `application_url` apunta al Render nuevo
(`https://envio-peru-publica.onrender.com`) y que los `redirect_urls` van al
mismo dominio. Copia del `shopify.app.envo-per.toml` los bloques que el CLI no
trae: `[app_proxy]`, `[webhooks]` con sus `compliance_topics`, y los `scopes`.
Solo cambia el dominio.

Después:

```powershell
npm run extension:assets
shopify app deploy --config publica
```

Eso sube la extensión de tema **a la app nueva**. Cada app tiene la suya; la de
pruebas no se toca.

## 5. Trabajar con las dos

El CLI recuerda cuál es la activa. Para cambiar:

```powershell
shopify app config use envo-per     # vuelves a la de pruebas
shopify app config use publica      # a la de producción
```

O sin cambiar la activa, pasando la bandera en cada comando:

```powershell
shopify app deploy --config envo-per
```

**Regla de oro:** prueba siempre en `envo-per` primero. Cuando funcione, haz
`deploy --config publica`. Como el código es idéntico, lo único que se despliega
distinto es la configuración de cada app.

## 6. Instalar la app nueva en una tienda

La app pública sin publicar todavía se instala por el enlace de instalación que
da el Partner Dashboard (*Test your app* → *Select store*). Úsala en tu tienda de
desarrollo para grabar el vídeo y las capturas que pide la revisión de la App
Store, y sigue `docs/PUBLICAR-EN-LA-APP-STORE.md` para el resto del formulario.

---

## Qué NO hay que duplicar

- El repositorio: uno solo, sirve a los dos.
- La rama: `main` para ambos.
- El código: nada cambia. Todo lo que distingue un entorno de otro son
  variables de entorno y el `.toml`.
- Los datos de tarifas: la base nueva empieza vacía. Si quieres arrancar con tu
  tarifario, expórtalo desde la app de pruebas e impórtalo en la nueva.

## Coste

Render en plan `free` duerme el servicio tras 15 minutos sin tráfico y tarda
~50 s en despertar. Para pruebas da igual; para la app pública, **sube ese
servicio a plan de pago antes de enviarla a revisión**: un revisor de Shopify que
se encuentre una pantalla en blanco rechaza la app.
