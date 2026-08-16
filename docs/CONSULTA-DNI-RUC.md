# Activar la consulta de DNI y RUC

Con esto, el comprador escribe su DNI, pulsa Buscar, y el formulario rellena
solo su nombre y apellidos. Con RUC, la razón social y la dirección fiscal.

El código ya está hecho. Solo hay que contratar un proveedor y poner tres
variables de entorno en Render.

---

## Por qué un proveedor y no consultar directamente

RENIEC y SUNAT no ofrecen una API pública abierta para esto. Lo que existe son
intermediarios autorizados que revenden el acceso.

**Esta app no hace scraping** de las webs de RENIEC ni de SUNAT, y no deberías
usar ningún servicio que lo haga: es frágil (se rompe cuando cambian la página),
puede infringir sus términos de uso, y te deja expuesto legalmente al tratar
datos personales por una vía no autorizada.

---

## Proveedores en Perú

Estos son los que aparecen al buscar hoy. **No he probado ninguno**, así que
compara precios y condiciones tú antes de contratar:

| Proveedor | Web |
|---|---|
| APIs.net.pe | <https://apis.net.pe> |
| Decolecta | <https://decolecta.com> |
| ApiPeru.dev | <https://apiperu.dev> |
| PeruApi | <https://peruapi.com> |
| PeruAPIs | <https://www.peruapis.com> |

Casi todos tienen un plan gratuito limitado para probar y planes de pago por
volumen de consultas.

**Qué mirar al elegir:**

- **Consultas incluidas al mes** y qué pasa al superarlas: ¿corta o cobra extra?
- **Tiempo de respuesta.** El comprador está esperando delante del formulario.
  Por encima de 2 segundos se nota.
- **Contrato de tratamiento de datos.** Estás enviándoles el DNI de tus
  clientes; conviene que quede claro qué hacen con él.
- **Que devuelva RUC además de DNI**, si vendes a empresas.

---

## Configuración en Render

Servicio `envio-peru` → *Environment* → añade estas variables:

| Variable | Valor |
|---|---|
| `DNI_RUC_PROVIDER` | `api` |
| `DNI_RUC_API_URL_DNI` | Endpoint completo de consulta DNI de tu proveedor |
| `DNI_RUC_API_URL_RUC` | Endpoint completo de consulta RUC |
| `DNI_RUC_API_KEY` | Tu token |
| `DNI_RUC_PARAM` | `numero` (solo cámbialo si tu proveedor usa otro nombre) |

**Los dos endpoints van por separado a propósito.** El DNI viene de RENIEC y el
RUC de SUNAT, y los proveedores casi nunca los cuelgan de la misma ruta. Un
patrón habitual:

```
DNI_RUC_API_URL_DNI = https://api.ejemplo.pe/v2/reniec/dni
DNI_RUC_API_URL_RUC = https://api.ejemplo.pe/v2/sunat/ruc
```

Copia las rutas **exactas de la documentación de tu proveedor**; las de arriba
son solo la forma típica, no valores reales.

La app llama así:

```
GET  {URL}?numero=12345678
Authorization: Bearer {DNI_RUC_API_KEY}
```

Si tu proveedor autentica de otra forma (cabecera propia, token en la URL,
POST en vez de GET), dímelo y adapto el módulo: está aislado en
`app/lib/documents/api.ts` y no toca nada más.


---

## Configurar APIsPERU

Planes que anuncian hoy en <https://apisperu.com/servicios/dniruc>:

| Plan | Precio | Incluye |
|---|---|---|
| Gratis | S/ 0 | 2.000 consultas al mes, DNI y RUC, sin soporte |
| Premium | S/ 30 al mes + IGV | Consultas ilimitadas, soporte por WhatsApp |

El plan gratuito da de sobra para probar y para una tienda pequeña: 2.000
consultas al mes son unos 65 al día.

### Pasos

1. Regístrate en <https://apisperu.com/servicios/dniruc> y obtén tu **token**
   (es un JWT largo, empieza por `eyJ…`).
2. Abre su documentación en <https://dniruc.apisperu.com/doc> y **copia las dos
   URLs exactas** de consulta DNI y consulta RUC. No las transcribo aquí porque
   su documentación se genera con JavaScript y no pude leerla para verificarlas.
3. En Render → *Environment*, añade las variables según la forma que tengan.

### Si el número va en la RUTA y el token en la URL

Es el formato que usa APIsPERU según los ejemplos que circulan. Quedaría así:

| Variable | Valor |
|---|---|
| `DNI_RUC_PROVIDER` | `api` |
| `DNI_RUC_API_URL_DNI` | `https://dniruc.apisperu.com/api/v1/dni/{numero}?token={token}` |
| `DNI_RUC_API_URL_RUC` | `https://dniruc.apisperu.com/api/v1/ruc/{numero}?token={token}` |
| `DNI_RUC_API_KEY` | Tu token JWT |
| `DNI_RUC_AUTH` | `none` |

`{numero}` y `{token}` son marcadores que la app sustituye. `DNI_RUC_AUTH=none`
porque el token ya viaja en la URL y no hace falta cabecera.

> **Confirma esas dos URLs con su documentación antes de guardar.** Si la ruta
> real es distinta, cambia solo la parte fija y deja los marcadores donde
> corresponda.

### Si el número va como parámetro y el token por cabecera

| Variable | Valor |
|---|---|
| `DNI_RUC_API_URL_DNI` | `https://…/dni` |
| `DNI_RUC_API_URL_RUC` | `https://…/ruc` |
| `DNI_RUC_API_KEY` | Tu token |
| `DNI_RUC_AUTH` | `bearer` |

Sin marcador `{numero}`, la app añade `?numero=…` automáticamente.

### Otros modos admitidos

| `DNI_RUC_AUTH` | Qué hace |
|---|---|
| `bearer` | Cabecera `Authorization: Bearer TOKEN` (por defecto) |
| `query` | Añade `?token=TOKEN`; el nombre se cambia con `DNI_RUC_AUTH_PARAM` |
| `header` | Cabecera propia; el nombre se define en `DNI_RUC_AUTH_HEADER` |
| `none` | Sin autenticación aparte (el token va en la plantilla) |

Con esas cuatro combinaciones entra cualquier proveedor peruano sin tocar código.

---

## Guía de nombres de la respuesta



El módulo acepta varias formas de nombrar los campos, porque cada proveedor usa
las suyas. Para DNI reconoce `nombres`, `first_name`, `firstName`, `name`; para
los apellidos `apellidoPaterno`, `apellido_paterno`, `first_last_name`,
`paterno`, y sus equivalentes maternos. También entiende respuestas envueltas en
`{ data: {...} }` o `{ result: {...} }`.

Si tu proveedor usa nombres distintos, se añaden en una línea.

---

## Comprobar que funciona

1. Guarda las variables en Render y espera al redespliegue.
2. Abre `https://envio-peru.onrender.com/diagnostico`.
3. En el panel de la app → **Configuración**, el apartado *Integraciones* debe
   mostrar **DNI / RUC: Activa**.
4. Abre el formulario en tu tienda, escribe un DNI real y pulsa Buscar. Debe
   aparecer «✓ Datos encontrados» y rellenarse nombre y apellidos.

---

## Qué pasa si el proveedor falla

Está previsto y no bloquea la venta. Si la API no responde, devuelve error o se
agota el tiempo, el comprador ve:

> No pudimos consultar los datos automáticamente. Puedes completar tus datos manualmente.

y sigue comprando escribiendo sus datos a mano. Una caída del proveedor nunca te
cuesta un pedido.

El RUC además se valida **localmente** antes de gastar una consulta: 11 dígitos,
prefijo correcto y dígito verificador según el módulo 11 de SUNAT. Un RUC mal
escrito se rechaza sin llamar a la API.

---

## Privacidad

Esto es tratamiento de datos personales de terceros, así que el módulo es
deliberadamente austero:

- **En la bitácora solo se guardan los 3 últimos dígitos** del documento, el
  tipo, el resultado, el proveedor y cuánto tardó. Nunca el número completo.
- Los datos devueltos **no se almacenan por su cuenta**: se usan para rellenar
  el formulario y viajan al pedido solo si el comprador completa la compra.
- Las sesiones del formulario **caducan a las 24 horas** y `scripts/limpiar-sesiones.mjs`
  las borra.

Si en tu tienda pides DNI para emitir comprobante, revisa que tu política de
privacidad mencione que consultas ese dato con un proveedor externo. Es un
requisito de la Ley de Protección de Datos Personales peruana, y son dos líneas
en tu política.

> No soy abogado; esto es una observación práctica, no asesoramiento legal.
