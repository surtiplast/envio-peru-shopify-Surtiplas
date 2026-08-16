# Solicitud de acceso a datos protegidos del cliente

Una app **pública** no puede suscribirse a `orders/create` ni leer datos de
clientes hasta que se pide este acceso. Sin él, `shopify app deploy` falla con:

> This app is not approved to subscribe to webhook topics containing protected
> customer data.

**Dónde:** Partners → Apps → *InnovaSoft Shipping Perú* → **API access requests**
→ *Protected customer data access* → **Request access**.

Si la app solo se instala en tiendas de desarrollo, el acceso queda activo al
guardar: **no hace falta enviar a revisión** para seguir trabajando.

---

## 1. Protected customer data (permiso general)

```
The app calculates shipping rates for Peru based on the buyer's district
(UBIGEO), which is not part of Shopify's standard address structure. It reads
the order's shipping address to determine the destination district and to
restore it on the order when the checkout drops it. It also stores the buyer's
document number (DNI/RUC) required by Peruvian tax law for invoicing. No
customer data is sold, shared with third parties, or used for any purpose other
than fulfilling and invoicing the merchant's own orders.
```

## 2. Name — nombres y apellidos

```
The shipping form collects the recipient's first and last name so the courier
can identify who receives the package, and so the merchant can issue the
Peruvian electronic invoice (boleta/factura), which legally requires the
recipient's full name.
```

## 3. Address — línea 1, línea 2, geolocalización y código postal

```
This is the core function of the app. The Peruvian district is stored inside
address line 2 because Shopify has no dedicated field for it, and the shipping
rate depends entirely on that district. Geolocation is used only when the buyer
explicitly presses "use my current location" to suggest their district; the
coordinates are resolved server-side and discarded, never stored.
```

## 4. Email — correo electrónico

```
Used to send the buyer the Peruvian electronic invoice and, only when the buyer
ticks the marketing consent checkbox in the form, to record that consent on
their Shopify customer record.
```

## 5. Phone — teléfono

```
The courier needs a contact number to coordinate delivery, which is standard
practice in Peru. It is also used to record SMS marketing consent, but only when
the buyer explicitly ticks that checkbox.
```

---

## 6. Data protection details

Después de las cinco casillas hay que completar *Data protection details*.
Lo que pregunta y lo que aplica a esta app:

- **Data retention**: se conserva mientras el comerciante tenga la app instalada.
  Al desinstalarla, el webhook `app/uninstalled` borra la sesión, y
  `shop/redact` borra los datos de la tienda a los 48 h.
- **Encryption at rest y in transit**: sí. PostgreSQL gestionado (Neon) con
  cifrado en reposo; todo el tráfico va por HTTPS/TLS.
- **Staff access**: solo el desarrollador, y únicamente para dar soporte.
- **Webhooks obligatorios**: ya están implementados en `/webhooks/gdpr`
  (`customers/data_request`, `customers/redact`, `shop/redact`).
- **Test/dev data**: no se copian datos reales de clientes a entornos de prueba.

---

## Después de guardar

```powershell
shopify app deploy --config innovasoft-shipping-per
```

Debería pasar sin el error. Si sigue apareciendo, espera un par de minutos:
el permiso tarda un momento en propagarse.
