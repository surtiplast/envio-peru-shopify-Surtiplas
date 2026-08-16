# Prompt para configurar y desplegar en Render

Copia todo lo que hay entre las dos líneas de guiones y pégaselo a la IA que
uses. Está actualizado al estado real del proyecto.

---

Necesito desplegar en Render una aplicación de Shopify que ya está terminada y
subida a GitHub. Guíame **paso a paso, un paso cada vez**, y espera a que te
confirme el resultado antes de pasar al siguiente.

Contexto sobre mí: estoy en Windows con PowerShell y no soy desarrollador.
Dame los comandos y los clics exactos, y dime qué debería ver en pantalla
después de cada uno para saber que salió bien.

## El proyecto

- Repositorio: **https://github.com/surtiplast/envio-peru-shopify** (rama `main`)
- App de Shopify que calcula tarifas de envío en Perú por
  Departamento → Provincia → Distrito, usando el código UBIGEO del INEI.
- Stack: Remix 2, Vite 5, React, Shopify Polaris, Prisma 5, PostgreSQL, Node 20.

## Qué está ya resuelto (no hace falta que lo rehagas)

- El código compila (`npm run build`), pasa el chequeo de tipos
  (`npm run typecheck`) y tiene 87 pruebas en verde (`npm test`).
- **La migración inicial de Prisma ya está en el repositorio**, en
  `prisma/migrations/20260808170340_inicial/migration.sql`: 16 tablas, 6 tipos
  enum y 29 índices.
- **La base de datos NO está en Render: está en Neon** (plan gratuito,
  https://neon.com). Motivo: Render solo permite una base PostgreSQL gratuita
  por workspace y la mía ya la ocupa otra aplicación distinta
  (`descuentos-db`, de una app de descuentos). Mezclar ambas apps en la misma
  base haría que colisionaran sus historiales de migración de Prisma, que
  viven en la tabla `_prisma_migrations`.
- Por eso el `render.yaml` **no declara ningún recurso `databases`**: solo el
  servicio web. Las cadenas de conexión de Neon se pegan a mano en el panel.
- El proyecto de Neon está creado en **AWS Ohio (us-east-2)**, la misma región
  que el servicio web de Render, para que la latencia entre app y base sea la
  mínima posible.
- Tengo una app creada en el Partner Dashboard de Shopify, con su Client ID y
  su Client Secret.

## Qué falta, y es lo que quiero que hagamos

1. Crear el servicio web en Render a partir del `render.yaml` del repositorio.
2. Rellenar las variables de entorno.
3. Configurar las URLs en el Partner Dashboard de Shopify.
4. Instalar la app en una tienda de desarrollo y comprobar que funciona.

## El render.yaml que ya está en el repositorio

- `type: web`, `runtime: node`, `plan: free`, `region: ohio`, `branch: main`
- `healthCheckPath: /salud`
- `buildCommand:`
  `npm ci --include=dev && npx prisma generate && npx prisma migrate deploy && npm run db:seed && npm run build`
  (el `--include=dev` es imprescindible: Render define `NODE_ENV=production` y
  sin esa bandera `npm ci` se salta las devDependencies, que el build necesita)
- `startCommand: npm run start`

## Variables de entorno

Las que tengo que rellenar a mano en el panel de Render:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | Cadena de Neon **con pooler** (el host lleva `-pooler`) |
| `DIRECT_URL` | Cadena de Neon **sin pooler** (mismo host, sin `-pooler`) |
| `SHOPIFY_API_KEY` | Mi Client ID de Shopify |
| `SHOPIFY_API_SECRET` | Mi Client Secret de Shopify |
| `SHOPIFY_APP_URL` | La URL pública que me dé Render |
| `GOOGLE_MAPS_API_KEY` | Vacía por ahora |
| `DNI_RUC_API_URL`, `DNI_RUC_API_KEY`, `DNI_RUC_API_SECRET` | Vacías por ahora |

Las demás (`SCOPES`, `NODE_VERSION`, `SESSION_SIGNING_SECRET`, facturación,
límites de peticiones) ya vienen definidas en el `render.yaml`.

## Un problema de orden que hay que resolver

`SHOPIFY_APP_URL` necesita la URL de Render, que no existe hasta que el
servicio esté creado. Así que: despliega primero dejándola vacía, y cuando
Render me dé el dominio, la corregimos y dejamos que redespliegue solo.

## Cómo sabremos que el despliegue funcionó

Abrir `https://MI-SERVICIO.onrender.com/salud` tiene que devolver:

```json
{
  "estado": "ok",
  "baseDatos": "conectada",
  "distritosCargados": 1874,
  "catalogoCompleto": true
}
```

Si `catalogoCompleto` es `true`, las tablas se crearon y el catálogo geográfico
se cargó. Si no, hay que mirar los logs del build en Render.

## Después: configurar el Partner Dashboard de Shopify

En mi app → *Configuration*:

- **App URL:** `https://MI-SERVICIO.onrender.com`
- **Allowed redirection URLs:**
  - `https://MI-SERVICIO.onrender.com/auth/callback`
  - `https://MI-SERVICIO.onrender.com/auth/shopify/callback`

En *App proxy* (esto sirve el formulario que ve el comprador):

- **Subpath prefix:** `apps`
- **Subpath:** `envio`
- **Proxy URL:** `https://MI-SERVICIO.onrender.com/proxy`

## Y por último, la prueba de verdad

1. Crear una tienda de desarrollo (país Perú, moneda PEN) e instalar la app.
2. En el panel de la app, **Importar** el archivo `data/tarifas-ejemplo.csv`
   que viene en el repositorio (1.874 distritos).
3. En **Probar tarifa**: Lima / Lima / Magdalena del Mar con subtotal 150.
   Tiene que dar **S/ 10.00** y decir que aplicó el rango 2.
4. Añadir un producto al carrito de la tienda y abrir
   `https://MI-TIENDA.myshopify.com/apps/envio`.

## Cosas que ya sé, no me las expliques otra vez

1. El servicio web gratuito de Render se duerme a los ~15 minutos sin tráfico,
   y eso perjudica al callback del CarrierService de Shopify, que dispone de
   poco tiempo para responder. Lo asumo para esta fase de pruebas.
2. Neon apaga el cómputo tras 5 minutos de inactividad y la primera consulta
   después tarda más (arranque en frío). Lo asumo para esta fase.
3. Necesito las DOS cadenas de conexión de Neon, no una: la que lleva
   `-pooler` en el host para la aplicación, y la que no lo lleva para las
   migraciones. Prisma necesita la directa porque las migraciones abren
   transacciones largas que un pooler corta por la mitad.

## Reglas importantes

- **Nunca me pidas que pegue en el chat la cadena de conexión de la base de
  datos ni el Client Secret de Shopify.** Dime en qué campo ponerlos.
- Si un comando o un paso falla, explícame qué significa el error **antes** de
  darme el siguiente paso. No encadenes soluciones a ciegas.
- Si algo no se puede hacer como lo describo, dímelo en vez de improvisar un
  rodeo.

---

## Si prefieres hacerlo sin IA

La guía manual equivalente está en `docs/DESPLIEGUE-RENDER.md`, en este mismo
repositorio.
