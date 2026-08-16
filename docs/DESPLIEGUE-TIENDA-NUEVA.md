# Desplegar Envío Perú en una tienda nueva

App **personalizada nueva** · servicio de Render **separado** · tienda en plan **Grow con facturación anual**.

A lo largo del documento se usan estos marcadores. Decide sus valores ahora y
no los cambies a mitad de camino:

| Marcador | Qué es | Ejemplo |
|---|---|---|
| `MI-TIENDA` | El subdominio `.myshopify.com` de la tienda | `plaza-nueva` |
| `MI-SERVICIO` | Nombre del servicio web en Render | `envio-peru-plaza-nueva` |
| `MI-APP` | Nombre del archivo de configuración | `plaza-nueva` |

La URL pública será `https://MI-SERVICIO.onrender.com`. Ese nombre tiene que
estar libre en Render; compruébalo antes de seguir, porque cambiarlo después
obliga a rehacer los pasos 4, 5 y 6.

---

## Paso 0 — Confirmar que la tienda puede usar CarrierService

Sin esto no hay app que valga. Grow con facturación **anual** activa las tarifas
calculadas por terceros de forma automática — pero conviene verlo con tus
propios ojos antes de gastar una app personalizada, que es irreversible.

En el admin de la tienda: **Configuración → Envíos y entregas**. Busca la
sección de *tarifas calculadas por terceros* o *cuentas de transportista*.

- Si aparece la sección → adelante.
- Si no aparece → la facturación anual no está activa todavía, o el cambio de
  plan aún no se ha propagado. Espera y vuelve a mirar. **No sigas.**

> Si te saltas este paso y resulta que la tienda no lo tiene, el registro del
> CarrierService devolverá HTTP 422 y habrás quemado una app personalizada en
> una tienda donde no sirve.

---

## Paso 1 — Crear la app personalizada en el Partner Dashboard

1. Partner Dashboard → **Apps** → **Create app** → **Create app manually**.
2. Nombre: `Envío Perú MI-TIENDA` (el que verá el comerciante).
3. Se abre la app recién creada. Ve a **Configuration** y guarda:
   - **Client ID**
   - **Client secret**

Todavía **no** elijas la distribución. Eso va en el paso 6, cuando ya exista la
URL de Render, porque la elección no se deshace y quieres tener todo lo demás
listo antes de tocarla.

---

## Paso 2 — Crear la base de datos en Render

**New → Postgres.**

| Campo | Valor |
|---|---|
| Name | `MI-SERVICIO-db` |
| Region | **Ohio** (la más cercana a Perú de las disponibles) |
| Plan | **De pago** — ver aviso abajo |

> **Aviso sobre el plan gratuito.** Las bases Postgres gratuitas de Render se
> eliminan al cabo de un tiempo limitado. Para una tienda de un cliente real
> eso significa perder todas las tarifas importadas sin previo aviso. Confirma
> la política vigente en el panel de Render antes de elegir; si vas a usar la
> gratuita, exporta el CSV de tarifas con regularidad.

Cuando termine de crearse, copia la **Internal Database URL**. Es la que empieza
por `postgresql://` y apunta a un host interno de Render. Úsala para las dos
variables, `DATABASE_URL` y `DIRECT_URL`: el Postgres de Render no expone un
pooler aparte, así que no hay dos cadenas distintas que separar.

La región de la base y la del servicio web **deben coincidir**. Si no, la URL
interna no resuelve.

---

## Paso 3 — Crear el servicio web en Render

**New → Web Service** → conecta el repositorio → rama `main`.

| Campo | Valor |
|---|---|
| Name | `MI-SERVICIO` |
| Region | **Ohio** (la misma que la base) |
| Runtime | Node |
| Plan | **Starter o superior — no el gratuito** |

### Por qué el plan gratuito no sirve aquí

No es una recomendación de rendimiento, es un requisito funcional.

Los servicios gratuitos de Render se duermen tras unos 15 minutos sin tráfico y
tardan cerca de un minuto en despertar. Shopify le concede a tu callback de
tarifas un **timeout dinámico de unos pocos segundos y no reintenta**: si la
respuesta no llega a tiempo, aplica tarifas de respaldo — que en tu caso no
existen — y el comprador ve *«no hay métodos de envío disponibles»*.

El resultado es el peor tipo de fallo: **intermitente**. Mientras tú pruebas, el
servicio está despierto y todo va bien. El cliente que entra a las 3 de la
mañana, cuando lleva horas sin tráfico, no puede comprar. Y no te enteras.

El `healthCheckPath: /salud` no lo evita: Render solo lo consulta durante el
despliegue, no mantiene vivo el servicio.

### Comandos

**Build command:**

```
npm ci --include=dev && npx prisma generate && npx prisma migrate deploy && npm run db:seed && npm run build
```

`--include=dev` es imprescindible. Render define `NODE_ENV=production`, y con
esa variable `npm ci` se salta las devDependencies — pero el build las necesita
(`@remix-run/dev`, `vite`, `prisma`, `tsx` están ahí). Sin la bandera falla con
`remix: not found`.

**Start command:**

```
npm run start
```

**Health check path:**

```
/salud
```

---

## Paso 4 — Variables de entorno en Render

En el servicio → **Environment**. `SHOPIFY_APP_URL` tiene que coincidir
**exactamente** con la URL que Render te asignó, sin barra final.

| Variable | Valor |
|---|---|
| `DATABASE_URL` | Internal Database URL del paso 2 |
| `DIRECT_URL` | El mismo valor |
| `NODE_VERSION` | `20.18.0` |
| `SHOPIFY_API_KEY` | Client ID del paso 1 |
| `SHOPIFY_API_SECRET` | Client secret del paso 1 |
| `SHOPIFY_APP_URL` | `https://MI-SERVICIO.onrender.com` |
| `SCOPES` | `write_shipping,read_orders,write_orders,read_products,write_draft_orders` |
| `SESSION_SIGNING_SECRET` | Generar valor aleatorio largo |
| `BILLING_TEST` | `true` |
| `GEO_PROVIDER` | `none` |
| `DNI_RUC_PROVIDER` | `none` |
| `RATE_LIMIT_WINDOW_MS` | `60000` |
| `RATE_LIMIT_MAX` | `60` |
| `DIAGNOSTICO_CLAVE` | Cadena larga y aleatoria |

### Tres trampas que ya te han mordido antes

**`SCOPES` manda sobre el `.toml`.** En `app/shopify.server.ts` los permisos
salen de `process.env.SCOPES?.split(",")`. Si esta variable y el archivo de
configuración no coinciden, gana la variable. Cambiar el `.toml` sin cambiar
esto no tiene ningún efecto.

**`write_customers` se queda fuera.** Mientras el acceso a datos protegidos
siga sin aprobar, pedirlo hace que Shopify devuelva 403 a **toda** la Admin
API — y eso tumba el registro del CarrierService, que no tiene nada que ver con
clientes. Como esta es una app personalizada nueva, empieza sin él.

**`BILLING_TEST=true` no cobra de verdad.** Correcto para una app personalizada
de un cliente al que le facturas por fuera. Si algún día quieres cobrar por la
Billing API, cámbialo — y no se te olvide, porque el fallo es silencioso.

**`DIAGNOSTICO_CLAVE`** no estaba en tu `render.yaml` original, así que
`/diagnostico` devolvía 404 en producción. Con ella puesta tienes una pantalla
de estado cuando algo falle: `https://MI-SERVICIO.onrender.com/diagnostico?clave=...`

---

## Paso 5 — Archivo de configuración de la app

Crea `shopify.app.MI-APP.toml` en la raíz del repositorio. Tienes la plantilla
en `shopify.app.PLANTILLA-NUEVA.toml`: cópiala, renómbrala y rellena
`client_id`, `name` y las cuatro URLs.

> **No uses `shopify.app.toml` a secas.** Ese archivo sigue con
> `REEMPLAZAR_CLIENT_ID` y `application_url = "https://REEMPLAZAR.tu-dominio.com"`,
> y es el que el CLI toma por defecto cuando no le pasas `--config`. Es la causa
> más probable de los despliegues que no entiendes.

### Cuidado con `shopify app config link`

Ese comando **regenera el archivo** con `scopes = ""`,
`application_url = "https://example.com"` y el App Proxy vacío. Si despliegas
así, la app se instala **sin permisos** y el CarrierService falla con 403.

Después de cada `config link`, abre el archivo y comprueba que sigan completos:

- `scopes` con los cinco permisos
- `application_url` apuntando a Render
- el bloque `[app_proxy]` entero

---

## Paso 6 — Elegir la distribución (irreversible)

Ahora sí. En el Partner Dashboard, en la app del paso 1:

**Distribution → Custom distribution →** introduce el dominio
`MI-TIENDA.myshopify.com` **→ confirmar**.

Léelo dos veces antes de confirmar. Una app de distribución personalizada queda
atada a **una sola tienda para siempre**. Si te equivocas de dominio, esa app
queda inservible y hay que crear otra desde cero.

Es exactamente por esto que la app de Plaza Multipack no se puede reutilizar
aquí, y por lo que estás creando una nueva.

---

## Paso 7 — Desplegar

Desde tu máquina, en la raíz del repositorio:

```bash
shopify app deploy --config MI-APP
```

**Siempre con `--config`.** Sin esa bandera el CLI usa `shopify.app.toml`, el
de los placeholders, y desplegarás la configuración equivocada sobre la app
equivocada.

En paralelo, Render despliega solo al detectar el push a `main`. Espera a que
el build termine en verde antes de instalar.

---

## Paso 8 — Instalar en la tienda

El Partner Dashboard te da un **enlace de instalación** para la app
personalizada. Ábrelo con la sesión de administrador de la tienda iniciada y
acepta los permisos.

Comprueba en la pantalla de permisos que aparezcan los cinco. Si la lista sale
vacía o corta, el `.toml` se desplegó incompleto: vuelve al paso 5.

---

## Paso 9 — Verificar que funciona de verdad

Por orden. Si uno falla, no sigas al siguiente.

**1. El servicio responde**

```
https://MI-SERVICIO.onrender.com/salud
```

**2. La app abre en el admin.** Debe cargar el panel de Polaris sin pantalla en
blanco. Si sale en blanco, mira la consola del navegador: casi siempre es
`SHOPIFY_APP_URL` con una barra final de más o un dominio que no coincide.

**3. El CarrierService quedó registrado.** Es el momento de la verdad. Míralo en
`/diagnostico?clave=...`, o directamente en la tienda:
**Configuración → Envíos y entregas**, donde debe aparecer tu servicio como
origen de tarifas.

Si falla:

| Error | Causa |
|---|---|
| 403 | Faltan permisos. Revisa `SCOPES` en Render — no el `.toml` |
| 422 | La tienda no tiene tarifas calculadas por terceros. Vuelve al paso 0 |

**4. Cargar tarifas.** Panel de la app → *Importar* → sube el CSV. Genera uno de
ejemplo con `npm run csv:sample` si aún no tienes el del cliente.

**5. Probar una tarifa.** Panel → *Probar tarifa* → elige distrito y subtotal.
Debe devolver el precio **y la regla aplicada**. Esto valida el motor sin pasar
por Shopify.

**6. Checkout real.** Añade un producto, ve al checkout, escribe una dirección
de un distrito con tarifa cargada. Debe aparecer tu tarifa junto al método.

**7. La prueba que casi nadie hace.** Vuelve al día siguiente, sin haber tocado
nada, y repite el paso 6. Si el checkout falla ahora pero funcionaba ayer, el
servicio se durmió: estás en plan gratuito. Vuelve al paso 3.

---

## Si algo se rompe más adelante

| Síntoma | Dónde mirar primero |
|---|---|
| Checkout sin métodos de envío | ¿El servicio está despierto? ¿Sigue registrado el CarrierService? |
| Falla solo en algunos distritos | Falta la tarifa de ese UBIGEO. Panel → *Probar tarifa* |
| La app se instaló sin permisos | `SCOPES` en Render, y `.toml` tras un `config link` |
| Todo funcionaba y dejó de ir tras un deploy | ¿Corriste `shopify app deploy` sin `--config`? |
| Cambié una tarifa y no se ve | Caché de 30 minutos en la calculadora. Ctrl+F5 |

Los datos que muevas por CSV son tu copia de seguridad real: exporta desde el
panel de vez en cuando y guarda el archivo fuera de Render.
