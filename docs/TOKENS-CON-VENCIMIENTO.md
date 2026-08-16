# Causa raíz del HTTP 403: tokens offline sin vencimiento

**Encontrado el 15 de agosto de 2026, tras un día entero de diagnóstico.**
Si algo vuelve a fallar con 403, empieza por aquí.

---

## El problema

Todas las llamadas de la app pública a la Admin API devolvían
`HTTP 403 — GraphQL Client: Forbidden`, con el cuerpo vacío. Sin mensaje, sin
campo, sin pista. El síntoma visible era que el CarrierService no se podía
registrar y el checkout no mostraba tarifas.

## La causa

Shopify lo avisa en el Dev Dashboard → Monitoreo → Estado de la API:

> Se detectó el uso de tokens offline en desuso.
> Los tokens offline en desuso no se pueden usar para hacer llamadas.

Y en la documentación:

> **Public apps created on or after April 1, 2026 must use expiring tokens.**
> Public apps created before April 1, 2026 must migrate by January 1, 2027.
> **These requirements don't apply to custom apps.**

Esta app pública se creó en agosto de 2026. Está obligada a usar **tokens
offline con vencimiento**. La librería pide los permanentes, que ya no sirven.

Fuente: https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/offline-access-tokens

## Por qué la app personalizada sí funciona

**Las apps personalizadas están exentas de este requisito.** Por eso «Envío
Perú», con exactamente el mismo código, el mismo servidor y la misma base de
datos, registra el CarrierService sin problema. La diferencia nunca estuvo en
el código: estaba en el tipo de distribución.

Esto costó horas de diagnóstico precisamente porque comparábamos las dos apps
esperando encontrar una diferencia de configuración, y no había ninguna.

## Lo que NO era

Descartado con evidencia, para no volver a probarlo:

- No era el `client_id` ni el secreto — verificados en `/diagnostico`.
- No eran los scopes — `write_shipping` concedido, confirmado en la sesión.
- No era `write_customers` — se quitó y el 403 siguió igual.
- No era el plan de la tienda — falla en una tienda **Advanced de desarrollo**.
- No eran sesiones viejas — se borró la tabla entera y el 403 siguió.
- No era la URL de la app — las tres coinciden.
- No era el acceso a datos protegidos del cliente.
- No era la versión de la API, aunque **también** estaba obsoleta (2025-01) y
  se actualizó a 2025-10 por el camino. Ese arreglo era necesario igualmente.

## La solución

Actualizar las librerías de Shopify a versiones que soporten tokens con
vencimiento:

| Paquete | Instalado | Actual |
|---|---|---|
| `@shopify/shopify-app-remix` | 3.8.5 | 5.0.0 |
| `@shopify/shopify-api` | 11.14.1 | 14.0.0 |

Es un salto de versión mayor, con cambios incompatibles. **No es un parche de
cinco minutos**: hay que leer las guías de migración, ajustar el código de
autenticación y volver a pasar las pruebas.

Además, la tabla `Session` necesitará campos nuevos para guardar el token de
refresco y sus vencimientos:

- `refresh_token`
- `refresh_token_expires_at`
- `expires_at` (ya existe como `expires`)

Y hará falta lógica de refresco: antes de cualquier llamada sin interacción del
comerciante —los webhooks, el CarrierService— comprobar si el token caducó y
renovarlo con el refresh token.

## Cómo abordarlo

1. Leer las notas de migración de 3.x → 4.x y 4.x → 5.x de
   `@shopify/shopify-app-remix`.
2. Actualizar los dos paquetes y `@shopify/shopify-app-session-storage-prisma`.
3. Migración de Prisma para los campos nuevos de la sesión.
4. Pasar `npm run typecheck` y `npm test` — las 136 pruebas siguen siendo la
   red de seguridad.
5. Desplegar y comprobar el registro del CarrierService en una tienda de
   desarrollo.

Con la cabeza descansada, es medio día de trabajo. Al final de una jornada de
catorce horas, es la peor idea posible.

## Nota sobre el ticket a Shopify

`docs/TICKET-SHOPIFY-CARRIER-403.md` ya no hace falta: era para preguntarles
qué bloqueaba la app. Ya lo sabemos. Se puede borrar o dejar como registro del
proceso.
