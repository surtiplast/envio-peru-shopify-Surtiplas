# Prompt para configurar la app nueva en el Partner Dashboard

Copia lo que hay entre las líneas y pégaselo a la IA con acceso al navegador.

> **El secreto de la app no se pega en ningún chat.** El prompt le pide a la IA
> que te avise para que lo copies tú directamente del panel de Shopify al de
> Render.

---

Necesito que me ayudes a terminar de configurar una app de Shopify recién
creada en el Partner Dashboard (dev dashboard). Se llama **InnovaSoft Shipping
Perú** y es una app de tarifas de envío para Perú que se va a publicar en la App
Store.

**Antes que nada, no toques estas secciones.** Ya verifiqué que no aplican y
configurarlas solo añade riesgo:

- Google Cloud Pub/Sub — los webhooks van por HTTPS, no por Pub/Sub.
- Amazon EventBridge — igual.
- Storefront API — solo para apps personalizadas; esta es pública.
- Token de automatización de la app — es para CI/CD, no lo necesito.
- Barra de navegación — opcional.
- El botón **Rotar** del secreto — **nunca**. Invalidaría la app en todas las
  tiendas donde esté instalada.

Tampoco toques URLs, scopes, webhooks ni App Proxy: todo eso lo sube la CLI de
Shopify desde mi proyecto, y si lo editas a mano se sobrescribe en el siguiente
despliegue.

**Tareas, en este orden:**

### 1. Confirmar la distribución

Entra en la sección de distribución de la app y dime si es **pública** o
**personalizada**. Es crítico: si saliera personalizada, para el proceso y
avísame, porque no se puede cambiar y habría que crear la app otra vez.

### 2. Darme el Client ID

Cópiame el **Client ID** (la API key). Ese no es secreto, puedes pasármelo.

El **Client secret NO me lo pases**: solo avísame cuándo está visible en
pantalla para copiarlo yo a Render.

### 3. Solicitar acceso a datos protegidos del cliente

Ve a **API access requests** → *Protected customer data access* → **Request
access**. Hay que pedir el permiso general y además cuatro campos por separado.
Usa exactamente estos textos:

**Protected customer data (general):**

```
The app calculates shipping rates for Peru based on the buyer's district
(UBIGEO), which is not part of Shopify's standard address structure. It reads
the order's shipping address to determine the destination district and to
restore it on the order when the checkout drops it. It also stores the buyer's
document number (DNI/RUC) required by Peruvian tax law for invoicing. No
customer data is sold, shared with third parties, or used for any purpose other
than fulfilling and invoicing the merchant's own orders.
```

**Name:**

```
The shipping form collects the recipient's first and last name so the courier
can identify who receives the package, and so the merchant can issue the
Peruvian electronic invoice (boleta/factura), which legally requires the
recipient's full name.
```

**Address:**

```
This is the core function of the app. The Peruvian district is stored inside
address line 2 because Shopify has no dedicated field for it, and the shipping
rate depends entirely on that district. Geolocation is used only when the buyer
explicitly presses "use my current location" to suggest their district; the
coordinates are resolved server-side and discarded, never stored.
```

**Email:**

```
Used to send the buyer the Peruvian electronic invoice and, only when the buyer
ticks the marketing consent checkbox in the form, to record that consent on
their Shopify customer record.
```

**Phone:**

```
The courier needs a contact number to coordinate delivery, which is standard
practice in Peru. It is also used to record SMS marketing consent, but only when
the buyer explicitly ticks that checkbox.
```

### 4. Completar «Data protection details»

Son 16 preguntas. Responde así:

**Sí** en: minimización de datos, limitación de uso a esa finalidad,
consentimiento de clientes, períodos de retención, cifrado en tránsito y en
reposo, cifrado de copias de seguridad, separación entre pruebas y producción,
prevención de pérdida de datos, límite de acceso de empleados, registro de
acceso a datos personales.

**Sí** también en: comunicación a los comerciantes de qué datos se procesan
(hay política de privacidad publicada) y política de respuesta a incidentes de
seguridad. Las URLs son:

```
https://innovasoft-shipping-peru.onrender.com/privacidad
https://innovasoft-shipping-peru.onrender.com/seguridad
```

**No aplicable** en: baja de venta de datos (no se venden datos) y decisiones
automatizadas con efectos jurídicos (calcular un precio de envío no lo es).

**No** en: acuerdos DPA con comerciantes (todavía no existen).

**Contraseñas seguras de empleados**: pregúntame antes de responder. Depende de
si tengo 2FA activo en todas las cuentas y solo yo puedo confirmarlo.

**Auditorías y certificaciones externas**: déjalo en blanco. No hay SOC2 ni ISO.

Guarda al terminar y dime en qué estado queda la solicitud.

---

## Después, en la terminal (esto lo hago yo)

```powershell
del shopify.app.innovasoft-shipping-per.toml
shopify app config link --reset
```
