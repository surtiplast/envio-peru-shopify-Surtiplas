# Paso a paso: dejar la app nueva funcionando

Desde cero, en orden. No saltes pasos: cada uno depende del anterior.

El código no se toca en ningún momento. Todo esto son trámites y variables.

---

## 1 · Elegir la distribución (Partners) — **irreversible**

Partner Dashboard → **InnovaSoft Shipping Perú** → sección de distribución.

- Marca **Distribución pública**.
- Pulsa **Seleccionar**.

Hazlo tú, no una IA. No se puede cambiar después, y si sale «personalizada» hay
que crear la app otra vez desde cero.

**Comprueba** que quedó como pública antes de seguir.

---

## 2 · Enlazar el proyecto con la app (terminal)

Abre la terminal en `C:\Users\Javier\Desktop\envio-peru-shopify`:

```powershell
del shopify.app.innovasoft-shipping-per.toml
shopify app config link --reset
```

- Organización: **InnovaSoft**
- App: **InnovaSoft Shipping Perú**
- Nombre de la configuración: `publica`

Se creará `shopify.app.publica.toml`.

**Copia la salida del comando y pásamela.** El archivo que genera el CLI viene
incompleto: le faltan el App Proxy, los webhooks y los scopes. Te lo devuelvo
relleno.

---

## 3 · Poner las credenciales nuevas en Render

Partners → la app → **API credentials**. Ahí están el **Client ID** y el
**Client secret**.

Render → servicio `innovasoft-shipping-peru` → **Environment**:

| Variable | Valor |
|---|---|
| `SHOPIFY_API_KEY` | el Client ID |
| `SHOPIFY_API_SECRET` | el Client secret |

**Todo lo demás se queda igual.** La URL, la base de datos, los secretos de
sesión: nada de eso cambió.

> El secreto va del panel de Shopify al de Render directamente. No lo pegues en
> ningún chat, ni conmigo ni con otra IA.

Al guardar, Render redespliega solo. Espera a que termine.

---

## 4 · Solicitar acceso a datos protegidos del cliente

Partners → la app → **API access requests** → *Protected customer data access*
→ **Request access**.

Hay que pedir el permiso general y cuatro campos por separado (Name, Address,
Email, Phone). Los textos listos para pegar están en
`docs/DATOS-PROTEGIDOS-DEL-CLIENTE.md`.

Sin esto, el despliegue del paso 5 falla con *«This app is not approved to
subscribe to webhook topics containing protected customer data»*.

Para tiendas de desarrollo el acceso queda activo al guardar: **no hace falta
enviar a revisión** para seguir trabajando.

---

## 5 · Desplegar

```powershell
npm run extension:assets
shopify app deploy --config publica
```

Sube a Shopify la URL de Render, los scopes, el App Proxy, los cuatro webhooks
y las dos extensiones (la de tema y la del distrito).

Debe terminar en **success**. Si falla, pásame el error entero.

---

## 6 · Instalar en la tienda de pruebas

Partners → la app → **Test your app** → elige **prueba 3** → instala.

Acepta los permisos. Si la app ya estaba instalada de antes, desinstálala
primero: los scopes solo se piden en una instalación nueva.

---

## 7 · Comprobar que funciona

En este orden, que importa:

1. **Abre la app en el admin.** Debe cargar el panel, no una pantalla en blanco
   ni «Example Domain».
2. **Tarifas.** Si la lista está vacía, importa tu tarifario desde
   **Importar** (la base de datos de este entorno es nueva).
3. **Activa el bloque en el tema.** Tienda online → Personalizar → añade el
   bloque del formulario donde lo quieras.
4. **Haz una compra de prueba**: carrito → formulario de la app → elige
   distrito → continuar.
5. **En el checkout**, comprueba que sale tu tarifa con el precio correcto en
   soles.
6. **En Pedidos**, abre el pedido y comprueba que la dirección de envío lleva
   el distrito.

El paso 6 es el importante. El recuadro «Distrito» del checkout sigue llegando
vacío —limitación conocida, ver `docs/DISTRITO-EN-SHOPIFY.md`— pero el pedido
debe estar completo.

---

## 8 · Antes de enviar a revisión

- [ ] `BILLING_TEST` en `false` en Render (ahora está en `true` para pruebas).
- [ ] `DIAGNOSTICO = false` en `extensions/distrito-checkout/src/Checkout.jsx`
      (ya está, pero verifícalo si has tocado el archivo).
- [ ] `DIAGNOSTICO_CLAVE` puesta en Render.
- [ ] `GEO_PROVIDER` en `google` con su clave, restringida por la IP saliente
      de Render.
- [ ] Servicio de Render en plan de pago, para que no duerma.
- [ ] 2FA activo en Partners, GitHub, Render, Neon y Google Cloud → habilita
      responder «Sí» en el punto 8 del formulario de datos protegidos.
- [ ] DPA con comerciantes (necesita abogado).
- [ ] Correo de soporte del dominio propio en la ficha.
- [ ] Borrar las apps sobrantes en Partners.

---

## Si algo falla

- **«Example Domain» al abrir la app** → falta el paso 5, o el `.toml` no tiene
  la URL de Render.
- **El deploy falla por datos protegidos** → falta el paso 4.
- **No salen tarifas en el checkout** → el carrito no pasó por el formulario, o
  la base de datos de este entorno no tiene tarifas cargadas (paso 7.2).
- **La app no aparece en la tienda** → falta activar el bloque en el tema
  (paso 7.3).
