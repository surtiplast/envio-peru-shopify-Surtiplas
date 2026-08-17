# El campo Distrito en Shopify (Perú)

> **Origen:** respuesta del soporte de Shopify (Ryan F., 9 de agosto de 2026) a
> una consulta sobre la app «Envío Perú». **Esto no está en la documentación
> pública**, así que este archivo es la única constancia. No lo borres.

---

## El dato

Perú tiene tres niveles administrativos —Departamento › Provincia › Distrito—
y Shopify solo modela dos. El distrito existe, pero **no tiene campo propio**:

- Shopify lo llama internamente **`neighborhood`**.
- Lo guarda **dentro de `address2`**, unido a la línea 2 mediante un carácter
  invisible: **U+2060 (word joiner)**.
- El checkout lo muestra como un campo aparte llamado «Distrito», pero por API
  viaja pegado a `address2`.

**Nunca construyas ni analices ese formato a mano.** El separador y el orden
dependen del país y Shopify puede cambiarlos. Usa su paquete oficial.

---

## Cómo se usa

Paquete: [`@shopify/worldwide`](https://www.npmjs.com/package/@shopify/worldwide)
(verificado con la versión 0.7.8).

### Escribir el distrito

```ts
import { concatenateAddress2 } from "@shopify/worldwide";

const address2 = concatenateAddress2({
  countryCode: "PE",
  line2: "Dpto. 401",              // la Referencia que escribe el comprador
  neighborhood: "Magdalena del Mar", // el Distrito
});
// → "Dpto. 401 ⁠Magdalena del Mar"   (el espacio antes del distrito es U+2060)
```

### Leer el distrito

```ts
import { splitAddress2 } from "@shopify/worldwide";

const { line2, neighborhood } = splitAddress2("PE", address2) ?? {};
// line2        → "Dpto. 401"
// neighborhood → "Magdalena del Mar"
```

> Ojo con la firma: `splitAddress2` recibe **dos argumentos sueltos**
> `(countryCode, cadena)`, no un objeto. `concatenateAddress2` sí recibe un
> objeto. Es fácil equivocarse y devuelve `null` en silencio.

### Comportamiento que conviene conocer

| Entrada | Resultado |
|---|---|
| Solo `neighborhood` | La cadena empieza por el carácter invisible |
| Sin marca invisible (escrito a mano en el checkout) | Todo cae en `line2`, `neighborhood` queda vacío |
| País sin formato extendido | `concatenateAddress2` devuelve `null` |

Ese segundo caso importa: si el comprador escribe la referencia directamente en
el checkout, **no hay distrito que extraer**. Es correcto no inventarlo.

---

## Dónde está en este proyecto

- **`app/lib/ubigeo/direccion.ts`** — envuelve las dos funciones con nombres en
  español y tolerancia a nulos. Todo el resto de la app pasa por ahí.
- **`app/routes/proxy.api.confirmar.tsx`** — compone `address2` al mandar al
  comprador al checkout.
- **`app/routes/api.carrier-service.tsx`** — lo lee para saber a qué distrito
  cotizar cuando alguien llega al checkout sin pasar por el formulario.
- **`tests/direccion.test.ts`** — 6 pruebas que fijan el contrato. Si Shopify
  cambia el formato, fallan y nos enteramos antes de que rompa en producción.

---

## La correspondencia completa de una dirección peruana

| Campo de Shopify | Etiqueta en el checkout | Qué le mandamos |
|---|---|---|
| `address1` | Dirección | Calle y número |
| `address2` | Referencia **+ Distrito** | Referencia + distrito, unidos con el formato de arriba |
| `city` | Provincia | La **provincia** |
| `province` | Región | El **departamento** |
| `zip` | Código postal | Libre, para un código postal de verdad |
| `company` | Empresa (o «RUC/DNI» si el tema lo reetiqueta) | El número de documento |

---

## Lo que se intentó antes y no servía

1. **Meter el distrito en `city`.** El checkout lo mostraba bajo la etiqueta
   «Provincia», que confunde al comprador y sale mal en las guías del courier.
2. **Meter el distrito en el código postal.** Funcionaba a medias, pero ese
   campo lo usan las etiquetas de envío y espera un código real —Magdalena del
   Mar es 15086—, así que ensuciaba los documentos de la operación.

Ambos apaños quedaron sustituidos por `neighborhood`, que es la vía correcta.

---

## RESUELTO (16/08/2026): hay que activar los campos de dirección adicionales

**La causa no estaba en el código.** El recuadro «Distrito» solo se rellena en
tiendas que tienen habilitados los **campos de dirección adicionales**
(*additional address fields*) de Shopify para Perú. Es una función en acceso
anticipado que Shopify activa **tienda por tienda, previa solicitud a su
soporte**.

### Confirmado por el soporte de Shopify

Ryan F., soporte técnico de Shopify, 16/08/2026, respondiendo a la consulta
sobre por qué el distrito aparecía en una tienda y no en otras:

> «tu solicitud de agregar **el campo de pago nativo "Distrito" (Barrio)** a tus
> otras tiendas […] indícanos cuáles son las tiendas a las que te refieres»

Es decir: lo activan ellos, tienda por tienda, dando los dominios
`.myshopify.com`. No hay nada que programar.

### Cómo saber si una tienda los tiene

Mira la etiqueta del campo `city` en su checkout:

| Etiqueta | Significado |
|---|---|
| **Provincia** | Formato extendido activo → el distrito se rellenará solo |
| **Ciudad** | Formato estándar → el recuadro Distrito llegará vacío |

Con el formato extendido, Shopify renombra `city` a «Provincia», `province` a
«Región» y conecta el recuadro «Distrito» al campo `neighborhood` que viaja
dentro de `address2`. Sin él, ese recuadro no está conectado a nada.

Se comprobó con dos tiendas, mismo commit desplegado (`e1ba3f0e`), mismo
código: **superdia.pe** (etiqueta «Provincia») rellenaba el distrito;
**plazamultipack.pe** (etiqueta «Ciudad») no.

### Qué pedirle al comerciante

Que escriba al soporte de Shopify:

> Quiero habilitar los campos de dirección adicionales (*additional address
> fields*) para Perú en mi tienda, para que el checkout muestre el campo
> Distrito.

Es gratuito y no requiere cambios en la app. En cuanto lo activen, el distrito
empieza a rellenarse solo.

**Esto debe ir en la ficha de la App Store y en la página de ayuda**, junto al
requisito de tarifas calculadas por terceros. Son los dos ajustes de tienda que
la app necesita y que el comerciante tiene que pedir a Shopify.

---

## CERRADO (17/08/2026): la extensión de checkout no es una alternativa

**Las extensiones de UI de checkout que se muestran en los pasos de información
y de envío solo funcionan en tiendas Shopify Plus.** Está en la documentación
de Shopify: los targets `purchase.checkout.*` requieren ese plan. Solo los
posteriores a la compra (página de agradecimiento y estado del pedido) están
disponibles en el resto de planes.

`extensions/distrito-checkout` usa
`purchase.checkout.delivery-address.render-before`. En una tienda que no sea
Plus **no se ejecuta**, y no hay despliegue ni reinstalación que lo cambie.

### Por qué costó tanto verlo

El fallo es silencioso. La extensión no da error, no aparece en ningún sitio y
no escribe en consola: sencillamente no se carga. Desde fuera es idéntico a
«se desplegó mal» o «hay que reinstalar la app», que fue lo que se persiguió
durante horas.

### Comprobación que lo confirmó (17/08/2026)

Dos tiendas, misma dirección de prueba, mismo distrito:

| | superdia.pe | plazamultipack.pe |
|---|---|---|
| App | «Envío Perú» (`e1c11f87…`) | «Tarifa de envío Perú» (`c3de50d1…`) |
| Servicio | `envio-peru.onrender.com` | `envio-peru-shopify-surtiplas.onrender.com` |
| `address2` enviado | correcto | correcto |
| Campo Distrito | **se rellena** | **vacío** |
| Logs de la extensión | ninguno | ninguno |

En `/diagnostico`, las doce entradas de `checkout.direccion` salieron todas con
`marca=true` y el distrito correcto. **El código no falla en ninguna de las
dos.** Y como en superdia el campo se rellena sin que la extensión escriba una
sola línea, queda claro que **ahí lo separa Shopify de forma nativa**, no la
extensión.

Nota: las dos tiendas comparten la misma base de datos de Neon, así que los
eventos de `/diagnostico` están mezclados y no se puede saber de qué tienda es
cada uno. Si esto vuelve a hacer falta, conviene añadir el dominio de la tienda
al mensaje del evento.

### Conclusión operativa

Solo hay un camino, y no pasa por el código:

> Pedir al soporte de Shopify que active los **campos de dirección adicionales**
> (*additional address fields*) para Perú en el dominio `.myshopify.com` de esa
> tienda concreta.

Es gratuito, se hace tienda por tienda, y en cuanto lo activan el distrito
empieza a rellenarse solo.

**Mientras tanto no se pierde nada:** el webhook `orders/create` repone el
distrito con `orderUpdate`, así que el pedido llega completo y se puede
despachar. Lo único que falla es que el comprador no ve su distrito en pantalla.

### Qué hacer con la extensión

Déjala. No estorba y sirve el día que un cliente esté en Plus. Pero **no la
cuentes como solución** al dar de alta una tienda nueva: si no es Plus, no
existe.

---

## Historial del diagnóstico (13–15/08/2026)

Se conserva porque documenta qué se descartó y por qué. Todo esto se hizo
buscando en el código un fallo que estaba en la configuración de la tienda.

### El síntoma

El comprador rellena el formulario de la app, elige su distrito, y al llegar al
checkout el recuadro «Distrito» aparece **vacío**. El resto de la dirección se
precarga bien: nombre, calle, provincia, departamento, teléfono.

### Lo que SÍ está comprobado

- **La cadena que componemos es correcta.** Se generó el mismo `address2` con
  nuestra `componerAddress2` y con `concatenateAddress2` de `@shopify/worldwide`
  y **salen idénticas byte a byte**, U+2060 incluido. El formato no es el
  problema.
- **Las propiedades llegan al carrito.** Verificado abriendo `/cart.js`: la
  línea lleva `_metodo`, `_ubigeo` y `_envio_token`, y los atributos del carrito
  llevan `Distrito`.
- **El pedido sí queda correcto.** El webhook `orders/create` repone el distrito
  con `orderUpdate`. Para despachar no falta nada. *Esto es lo importante.*

### Lo que se intentó y NO funcionó

1. **`checkout[shipping_address][address2]` con el formato oficial.** La
   precarga por URL se queda con la referencia y descarta el distrito.
2. **`checkout[shipping_address][neighborhood]` como parámetro suelto.**
   Ignorado. No está documentado que exista.
3. **Extensión de UI de checkout** (`extensions/distrito-checkout`) con
   `applyShippingAddressChange`, que es **la vía que Shopify documenta** para
   esto. Se desplegó correctamente (versión 6, bundle OK) y **no rellenó el
   campo**. No se llegó a determinar si siquiera se ejecuta.
4. **Cambiar el idioma del checkout** (en-pe / es-PE). Sin diferencia.
5. **Preguntar al soporte de Shopify.** Su respuesta explica cómo componer y
   leer `address2` —lo que ya hacíamos— pero no aborda por qué la precarga lo
   descarta.

### Pistas para retomarlo

- **No se comprobó si la extensión llega a ejecutarse.** El banner de
  diagnóstico usaba `<s-banner>`, que en esta versión de la API no renderiza
  nada, así que «no aparece» no probaba nada. La vía fiable es `console.log`
  con `DIAGNOSTICO = true` en `Checkout.jsx`, mirando la consola del navegador
  al **recargar** el checkout.
- **Mirar el editor de checkout.** Puede que la extensión necesite activarse
  ahí aunque su objetivo sea estático.
- **Reinstalar la app** en la tienda de prueba: una extensión nueva puede no
  activarse en una instalación ya existente.
- **Datos protegidos nivel 2.** La API de direcciones lo exige (campo
  *Address*). Si el permiso no está concedido, `applyShippingAddressChange`
  llega como `undefined` y la extensión no puede hacer nada.

### Qué contarle a un comerciante

Que el recuadro es un campo opcional del checkout y que **su pedido llega con el
distrito completo**, que es lo que necesita para despachar. Ver
`docs/SOPORTE-A-COMERCIANTES.md`.
