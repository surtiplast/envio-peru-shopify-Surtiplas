# Arquitectura — Envío Perú

Documento de decisiones. Explica **qué se construyó, por qué, y qué no es
posible hacer exactamente como se pidió por restricciones reales de Shopify**.

---

## 1. Visión general

```
  TIENDA SHOPIFY (dominio del comerciante)
  ┌──────────────────────────────────────────────────────────┐
  │  Carrito  ──►  /apps/envio  (App Proxy)                   │
  │                    │                                      │
  │                    ▼                                      │
  │            Formulario de envío  ──►  /cart/update.js       │
  │                    │                     (atributos)       │
  │                    ▼                                      │
  │            /checkout  (CHECKOUT OFICIAL DE SHOPIFY)        │
  │                    │                                      │
  └────────────────────┼──────────────────────────────────────┘
                       │  POST con destino + carrito
                       ▼
  NUESTRA APP (Remix + Node)
  ┌──────────────────────────────────────────────────────────┐
  │  /api/carrier-service   ← Shopify pide tarifas            │
  │  /proxy/*               ← formulario y su API             │
  │  /app/*                 ← panel del comerciante (Polaris) │
  │  /webhooks/*            ← desinstalación, billing, GDPR   │
  │                                                           │
  │  Motor de tarifas (puro)  ·  Catálogo UBIGEO (memoria)    │
  └───────────────────────────┬──────────────────────────────┘
                              ▼
                       PostgreSQL (multi-tienda)
```

**Regla central:** el formulario, el callback del CarrierService y el Probador
del admin llaman a la **misma** función `cotizarParaTienda()`. Si los tres
usaran lógicas distintas, tarde o temprano el precio del formulario y el del
checkout dejarían de coincidir, y eso es una queja garantizada.

---

## 2. Módulos

| Módulo | Ruta | Qué hace |
|---|---|---|
| Motor de tarifas | `app/lib/rates/motor.ts` | Cálculo puro por rangos. Sin BD, sin red. 25 pruebas. |
| Consulta de tarifas | `app/lib/rates/consulta.server.ts` | Puente BD ↔ motor. Convierte `Decimal` a céntimos. |
| Catálogo UBIGEO | `app/lib/ubigeo/catalogo.ts` | 25 dep. / 196 prov. / 1.874 distritos en memoria + resolución difusa. |
| Importador CSV | `app/lib/csv/` | Detección de columnas, mapeo, validación, upsert por lotes. |
| Exportador | `app/lib/csv/exportar.server.ts` | CSV y XLSX con las mismas columnas que el importador. |
| Geolocalización | `app/lib/geo/` | Interfaz `ProveedorGeolocalizacion` + Google + Nominatim. |
| Documentos | `app/lib/documents/` | Interfaz `ProveedorDocumentos` + proveedor HTTP genérico. |
| Seguridad | `app/lib/security/` | Firma de App Proxy, HMAC, validación, rate limit. |
| Shopify | `app/lib/shopify/` | CarrierService, billing, tenant. |

---

## 3. Base de datos

Decisiones que importan cuando hay cientos de miles de filas:

**Geografía compartida, tarifas por tienda.** `Departamento`, `Provincia` y
`Distrito` son datos oficiales del INEI: iguales para todos. Guardarlos por
tienda multiplicaría 1.874 filas por cada comerciante sin ninguna ventaja. Lo
que sí es de cada tienda es la `Tarifa`.

**Rangos como filas, no como columnas.** El CSV trae `rango1_min`,
`rango2_min`, … Guardar eso literalmente daría una tabla de 30+ columnas con la
mitad vacías y un límite artificial de rangos. Aquí cada rango es una fila de
`Rango`, indexada por `(metodoId, montoMin)`.

**Desnormalización deliberada.** `Tarifa` repite `nombreDep`, `nombreProv` y
`nombreDist`. Es redundante, pero el listado del admin filtra y ordena por esos
campos sobre miles de filas y así se evita hacer tres JOIN en cada página.

**Aislamiento multi-tienda.** Todo lo que pertenece a un comerciante lleva
`shopId`, y ese `shopId` forma parte del índice único (`@@unique([shopId, ubigeo])`).
Cada `where` de escritura incluye `shopId`, de modo que un id de otra tienda
simplemente no encuentra nada. `onDelete: Cascade` desde `Shop` deja el borrado
por GDPR en una sola operación.

**El UBIGEO es texto, siempre.** `"010101"` no es `10101`. Se usa `Char(6)` y
nunca `Number()`.

**El dinero se calcula en céntimos.** El motor trabaja con enteros. Con
`float`, `0.1 + 0.2 !== 0.3`, y esa diferencia de un céntimo entre el formulario
y el checkout es exactamente el tipo de fallo que nadie encuentra hasta que un
cliente reclama.

---

## 4. Cómo llegan las tarifas al checkout (y qué NO es posible)

Esta es la parte donde conviene ser exacto, porque hay mucha desinformación.

### Lo que se pidió
> «Que al llegar al checkout ya estén precargados nombre, apellido, teléfono,
> email, dirección, departamento, provincia, distrito, referencia y tipo de
> envío.»

### Lo que Shopify permite de verdad

**Sí se puede: calcular la tarifa en el checkout.** Vía **CarrierService API**.
Shopify hace `POST` a nuestro callback con el destino y el carrito, y nosotros
devolvemos las tarifas. Es la única vía oficial para precios de envío
calculados por una app.

> ⚠️ **Requisito de plan.** Shopify documenta que el registro de un
> CarrierService falla salvo que la tienda esté en **plan Advanced o superior**,
> en **plan Grow (antes «Shopify») con facturación ANUAL** (o con el complemento de envío
> calculado contratado), o sea una **tienda de desarrollo**.
> La app detecta ese fallo, marca la tienda como `NO_ELEGIBLE` y avisa en el
> dashboard en vez de romperse.

**Sí se puede: precargar parte del checkout por URL.** Los parámetros
`checkout[email]`, `checkout[shipping_address][first_name]`, `[last_name]`,
`[address1]`, `[address2]`, `[city]`, `[province]`, `[country]`, `[zip]` y
`[phone]` son los que Shopify documenta para cart permalinks. La app los usa
todos.

**Sí se puede: llevar datos hasta el pedido.** Los **atributos del carrito**
(`/cart/update.js`) se copian a la orden como `note_attributes`. Ahí van el
UBIGEO, el departamento/provincia/distrito, la referencia, el DNI/RUC, el método
elegido y el token de la sesión de envío. Es información que el comerciante ve
en el pedido y que su operación logística puede usar.

**No se puede: rellenar el checkout entero desde fuera.** No existe API pública
para escribir arbitrariamente en el checkout de un comprador. Campos como
"referencia" o "distrito" no son campos nativos del checkout de Shopify.

**No se puede: forzar un precio de envío desde el navegador.** Sería trivial de
manipular. Por eso `proxy.api.confirmar.tsx` **ignora el costo que envía el
cliente** y lo recalcula en el servidor.

### La alternativa que se implementó

1. El comprador completa el formulario en `/apps/envio` (App Proxy → dominio de
   la tienda → cookies de primera parte → acceso a `/cart.js`).
2. El servidor valida y **recalcula** la tarifa.
3. Se guardan los datos como atributos del carrito.
4. Se redirige a `/checkout?...` con los campos que Shopify sí admite precargar.
5. En el checkout, el CarrierService devuelve **la misma tarifa** ya calculada,
   porque lee el `_ubigeo` de los atributos en lugar de adivinar por el nombre
   de la ciudad.
6. El pago lo procesa Shopify. La app no toca dinero ni datos de tarjeta.

### Modo alternativo (plan no elegible)

Si la tienda no puede usar CarrierService, el formulario sigue funcionando: el
costo queda registrado en los atributos y el comerciante configura tarifas
manuales en Shopify. El dashboard lo explica en lugar de fallar en silencio.

---

## 4-bis. El distrito peruano en la dirección de Shopify

Shopify modela dos niveles administrativos y Perú tiene tres. El distrito no
tiene campo propio: Shopify lo llama `neighborhood` y lo guarda **dentro de
`address2`** con un separador invisible.

No está documentado públicamente; lo confirmó su soporte. El detalle completo,
con ejemplos y las trampas de la API, está en **`docs/DISTRITO-EN-SHOPIFY.md`**.

---

## 5. Geolocalización → UBIGEO

Un punto que se suele resolver mal: **las coordenadas no dan un UBIGEO**. Google
devuelve nombres de lugar ("Lima District", "Cercado de Lima") que no coinciden
con la nomenclatura del INEI.

La capa de normalización (`app/lib/geo/index.server.ts` + `catalogo.ts`) hace:

1. Normalizar (sin tildes, sin puntuación, mayúsculas).
2. Aplicar alias conocidos (`CERCADO DE LIMA → LIMA`, `SURCO → SANTIAGO DE SURCO`…).
3. Buscar por terna exacta departamento/provincia/distrito.
4. Si no, buscar por nombre de distrito acotando por lo que se sepa.
5. Si sigue habiendo ambigüedad, **distancia de edición** con tope según longitud.
6. Si nada da confianza ≥ 0,9 → `requiereConfirmacion: true` y el formulario
   pide al comprador que confirme su distrito.

Preferimos un clic extra a cobrar el envío equivocado.

El proveedor es intercambiable: `GEO_PROVIDER=google|nominatim|none`. La API key
vive solo en el servidor; el navegador nunca la ve.

---

## 6. DNI / RUC

- **Nada de scraping** de RENIEC ni SUNAT: se consume una API de un proveedor
  autorizado, configurada por variables de entorno.
- El RUC se valida **localmente** con el módulo 11 de SUNAT antes de gastar una
  consulta.
- Si el proveedor falla, **no se bloquea la compra**: se muestra «No pudimos
  consultar los datos automáticamente. Puedes completar tus datos manualmente.»
- **Privacidad:** en la bitácora solo se guardan los **3 últimos dígitos**, el
  tipo de documento, el resultado, el proveedor y la duración. Nunca el número
  completo.
- Las sesiones de envío caducan a las 24 h y `scripts/limpiar-sesiones.mjs` las
  borra.

---

## 7. Seguridad

| Riesgo | Mitigación |
|---|---|
| Suplantar una tienda en el App Proxy | HMAC-SHA256 sobre los parámetros ordenados, con `timingSafeEqual`. |
| Falsificar el callback de tarifas | HMAC del cuerpo (`X-Shopify-Hmac-Sha256`). |
| Falsificar webhooks | `authenticate.webhook` de la librería oficial. |
| Manipular el precio del envío | El servidor recalcula; el precio del cliente se descarta. |
| Ver datos de otra tienda | `shopId` obligatorio en todo `where`, tomado de la sesión, nunca del cliente. |
| Minar datos con la consulta DNI | Rate limit específico (10/min por IP). |
| Agotar la cuota de Google | Rate limit específico (30/min por IP). |
| XSS en el formulario | Escapado explícito de todo lo que se interpola en HTML. |
| Datos personales de más | Solo lo necesario; caducidad a 24 h; borrado por webhook GDPR. |
| Datos de tarjeta | La app nunca los recibe: el pago es 100 % de Shopify. |

---

## 8. Rendimiento

- **Catálogo en memoria** (~230 KB): el selector de distritos y el callback del
  CarrierService no tocan la base de datos.
- **El callback responde rápido**: una consulta indexada
  (`@@unique([shopId, ubigeo])`) y cálculo puro. Shopify descarta respuestas
  lentas, así que ante cualquier error se devuelve `{ rates: [] }` en lugar de
  un 500.
- **Importación por lotes de 250** con progreso, en vez de una transacción
  gigante que bloquearía la tabla.
- **Listado paginado** de 50 en 50 con índices por `(shopId, codDep)` y
  `(shopId, codProv)`.
- El JS del formulario son ~29 KB sin dependencias: nada de React ni Polaris en
  la tienda del comprador.

---

## 9. Qué falta para producción

Cosas conscientemente pendientes, no olvidadas:

1. **Cola de trabajos** para importaciones muy grandes (>50 MB). Hoy el
   contenido viaja entre los pasos 03 y 04 y se procesa en la misma petición.
   Con BullMQ + Redis se haría en segundo plano.
2. **Rate limit en Redis** si se despliega en más de una instancia
   (`limite.server.ts` es en memoria).
3. **Shopify Function de Delivery Customization** para reordenar u ocultar
   métodos en el checkout. Los `extensions/` están preparados.
4. **Centroides por distrito** (`Distrito.latitud/longitud`) para desempatar
   geocodificaciones dudosas por cercanía.
5. **Pruebas de integración con base de datos** (Testcontainers). Las 87
   pruebas actuales cubren la lógica pura, que es donde están los errores caros.

---

## 11. Fecha de nacimiento del comprador

Se pide como campo opcional en el formulario (se activa en Personalización) y se
guarda en el metacampo **estándar** de Shopify `facts.birth_date`, de tipo
`date` en formato ISO 8601.

Al ser una definición estándar, el comerciante la ve en la ficha del cliente sin
configurar nada y puede segmentar por cumpleaños para enviar descuentos.

**Se guarda al crear el pedido, no antes.** En el formulario el comprador
todavía es un visitante anónimo: el cliente no existe hasta que Shopify crea el
pedido. Por eso la fecha viaja como atributo del carrito (`_cumple`) y el
webhook `orders/create` la escribe en el cliente.

Si esa escritura falla —permisos, cliente invitado sin cuenta— **no se
interrumpe nada**: el pedido ya está hecho y el fallo queda anotado en la
bitácora como aviso.

Requiere el permiso `write_customers`, que se añadió a los scopes de la app.
