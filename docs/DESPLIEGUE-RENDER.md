# Desplegar en Render (base de datos + aplicación)

Al terminar tendrás la app corriendo en una URL pública fija, sin depender de
que tu computadora esté encendida.

---

## Antes de empezar: dos avisos que conviene tener claros

**1. La base de datos gratuita se borra a los 30 días.**
Render da 14 días de gracia para pasarla a un plan de pago (desde unos 6 USD al
mes). Pasado ese plazo, la elimina con todos los datos. Ponte un recordatorio, o
exporta tus tarifas periódicamente desde el panel de la app.

**2. El servicio web gratuito se duerme tras ~15 minutos sin tráfico.**
La primera petición después tarda en responder, a veces cerca de un minuto.

Esto último tiene una consecuencia concreta: **el callback del CarrierService va
contrarreloj**. Si Shopify pide las tarifas y el servicio está dormido, no
llegan a tiempo y el checkout muestra las tarifas manuales de la tienda en lugar
de las tuyas. El plan gratuito sirve para probar que todo funciona; para
comerciantes reales necesitas un plan que no duerma.

---

## 1. Crear la app en el Partner Dashboard de Shopify

Antes de Render necesitas las credenciales.

1. Entra a <https://partners.shopify.com> y crea una cuenta si no la tienes.
2. **Apps → Create app → Create app manually**. Nómbrala `Envío Perú`.
3. Guarda el **Client ID** y el **Client secret**. Los pegarás en Render.

Las URLs las configuraremos en el paso 4, cuando Render nos dé el dominio.

## 2. Desplegar con el Blueprint

1. Entra a <https://render.com> y crea una cuenta con GitHub.
2. **New → Blueprint**.
3. Elige el repositorio `surtiplast/envio-peru-shopify`.
4. Render detecta `render.yaml` y muestra los dos recursos que va a crear:
   la base `envio-peru-db` y el servicio web `envio-peru`.
5. Te pedirá los valores marcados como secretos. Rellena por ahora:
   - `SHOPIFY_API_KEY` → el Client ID del paso 1
   - `SHOPIFY_API_SECRET` → el Client secret
   - `SHOPIFY_APP_URL` → déjalo vacío o pon un valor temporal; lo corregimos
     en el paso 4 cuando sepas el dominio.
   - Los de Google y DNI/RUC puedes dejarlos vacíos: la app funciona sin ellos,
     solo se ocultan esas funciones.
6. **Apply**. El primer despliegue tarda varios minutos: instala dependencias,
   aplica las migraciones, carga los 1.874 distritos y compila.

## 3. Comprobar que arrancó

Cuando Render marque el servicio como *Live*, abre en el navegador:

```
https://TU-SERVICIO.onrender.com/salud
```

Debe responder algo así:

```json
{
  "estado": "ok",
  "baseDatos": "conectada",
  "distritosCargados": 1874,
  "catalogoCompleto": true
}
```

Si `catalogoCompleto` es `true`, la base está creada y el catálogo cargado.
Ese es el momento en que sabes que el despliegue salió bien.

Si `baseDatos` trae un error, revisa los *Logs* del servicio en Render.

## 4. Conectar Shopify con tu URL de Render

Ahora que conoces el dominio, ciérralo todo:

**En Render**, ve a tu servicio → *Environment* → edita `SHOPIFY_APP_URL`:

```
https://TU-SERVICIO.onrender.com
```

Guarda: Render redespliega solo.

**En el Partner Dashboard**, en tu app → *Configuration*:

- **App URL:** `https://TU-SERVICIO.onrender.com`
- **Allowed redirection URLs:**
  - `https://TU-SERVICIO.onrender.com/auth/callback`
  - `https://TU-SERVICIO.onrender.com/auth/shopify/callback`

**App proxy** (esto es lo que sirve el formulario del comprador):

- **Subpath prefix:** `apps`
- **Subpath:** `envio`
- **Proxy URL:** `https://TU-SERVICIO.onrender.com/proxy`

Guarda los cambios.

## 5. Instalar en una tienda de desarrollo

1. En el Partner Dashboard: **Stores → Add store → Development store**.
   Ponle país **Perú** y moneda **PEN**.
2. En tu app: **Test your app → Select store** → elige la que acabas de crear.
3. Acepta los permisos.

Deberías aterrizar en el panel de la app, con el mensaje de que aún no hay
tarifas configuradas.

> Las tiendas de desarrollo **cumplen el requisito de plan del CarrierService**,
> así que aquí sí verás las tarifas calculadas dentro del checkout, aunque una
> tienda real en plan básico no pueda.

## 6. La primera prueba de verdad

1. **Importar** → sube `data/tarifas-ejemplo.csv` (está en el repositorio).
   Son los 1.874 distritos. Revisa que el mapeo automático sea correcto y
   confirma.
2. **Probar tarifa** → Lima / Lima / Magdalena del Mar, subtotal 150.
   Debe salir **S/ 10.00** y decirte que aplicó el rango 2.
3. **Recojo en tienda** → crea una sede de prueba.
4. En la tienda de desarrollo, añade un producto al carrito y ve a
   `https://TU-TIENDA.myshopify.com/apps/envio`.

Ese último paso es el momento de la verdad: es la primera vez que el formulario
del comprador se ejecuta de principio a fin.

---

## Cuando algo falle

**El despliegue falla en `prisma migrate deploy`**
No hay migraciones en el repositorio todavía. Créalas en tu PC con una base
local o de Neon (`npx prisma migrate dev --name inicial`), sube la carpeta
`prisma/migrations/` y vuelve a desplegar.

**`/salud` responde pero `distritosCargados` es 0**
El seed no llegó a correr. Míralo en los logs del build. Puedes forzarlo con un
*Manual Deploy → Clear build cache & deploy*.

**Shopify dice «Oauth error» al instalar**
Las *Allowed redirection URLs* del Partner Dashboard no coinciden exactamente
con tu dominio. Tienen que ser idénticas, incluido el `https://` y sin barra
final de más.

**El formulario en `/apps/envio` da 401**
La *Proxy URL* del Partner Dashboard debe terminar en `/proxy`. La app verifica
la firma que Shopify añade a cada petición; si la ruta no coincide, la rechaza.

**Todo va lentísimo la primera vez**
Es el servicio gratuito despertando. Recarga y la segunda vez irá normal.
