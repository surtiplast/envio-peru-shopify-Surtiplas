# Llevar al comprador desde el carrito al formulario

El formulario vive en `/apps/envio` de tu propia tienda. Falta que el botón del
carrito lleve allí en vez de directamente al checkout.

**Flujo que queremos:**

```
Carrito  →  /apps/envio  (elige distrito y método)  →  Checkout de Shopify  →  Pago
```

---

## Paso 0: comprobar que el proxy responde

Antes de tocar nada, abre en el navegador:

```
https://TU-TIENDA.myshopify.com/apps/envio
```

- **Se ve el formulario** → sigue con el resto de esta guía.
- **Error 404** → el App Proxy no está configurado en el Dev Dashboard, o la
  subruta no es `envio`.
- **Error 401** → la Proxy URL no termina en `/proxy`. La app verifica la firma
  que Shopify añade a cada petición y la rechaza si la ruta no coincide.

No sigas hasta que esto funcione.

---

## Opción A — Botón por JavaScript (funciona en cualquier tema)

La más rápida y la que menos toca tu tema. Intercepta el botón de finalizar
compra del carrito y lo redirige al formulario.

**Admin → Tienda online → Temas → ⋯ → Editar código → `layout/theme.liquid`**

Pega esto **justo antes** de `</body>`:

```liquid
{%- comment -%} Envío Perú: desvía el checkout al formulario de envío {%- endcomment -%}
<script>
  (function () {
    var RUTA_FORMULARIO = "/apps/envio";

    function desviar(evento) {
      evento.preventDefault();
      evento.stopPropagation();
      window.location.href = RUTA_FORMULARIO;
    }

    function enganchar() {
      // Cubre los nombres que usan la mayoría de temas, incluido Dawn.
      var selectores = [
        'form[action="/cart"] [name="checkout"]',
        'button[name="checkout"]',
        'input[name="checkout"]',
        '#checkout',
        '.cart__checkout-button',
        '.cart__checkout'
      ];
      document.querySelectorAll(selectores.join(",")).forEach(function (boton) {
        if (boton.dataset.envioPeru) return;   // no enganchar dos veces
        boton.dataset.envioPeru = "1";
        boton.addEventListener("click", desviar, true);
      });
    }

    document.addEventListener("DOMContentLoaded", enganchar);

    // Los carritos laterales se dibujan después: reenganchamos cuando cambian.
    var observador = new MutationObserver(enganchar);
    observador.observe(document.documentElement, { childList: true, subtree: true });
  })();
</script>
```

Guarda y prueba: añade un producto y pulsa finalizar compra. Debe llevarte al
formulario.

**Qué NO cubre esta opción:** los botones de pago acelerado (Shop Pay, PayPal,
Google Pay) van directos al checkout sin pasar por el carrito, y las compras con
«Comprar ahora» desde la ficha de producto tampoco pasan por aquí. Si quieres
forzar que todos pasen por el formulario, desactiva esos botones en
**Configuración → Pagos → Pagos acelerados**.

---

## Opción B — Enlace fijo en la página del carrito

Más limpia si solo usas la página de carrito y no el carrito lateral.

**Editar código → `sections/main-cart-footer.liquid`** (en Dawn; en otros temas
busca el archivo que contenga `name="checkout"`).

Localiza el botón de finalizar compra, que se parece a esto:

```liquid
<button type="submit" id="checkout" class="cart__checkout-button button" name="checkout">
  {{ 'sections.cart.checkout' | t }}
</button>
```

Y **encima** añade:

```liquid
<a href="/apps/envio" class="button" style="width:100%; display:block; text-align:center; margin-bottom:8px;">
  Continuar con el envío
</a>
```

Para que el comprador no pueda saltárselo, envuelve el botón original así:

```liquid
<div style="display:none;">
  ... el botón de checkout original ...
</div>
```

---

## Opción C — Extensión de tema (la más profesional)

El repositorio ya incluye la extensión en `extensions/boton-envio/`. Es un
bloque que el comerciante activa desde el editor de temas, sin tocar código, y
que sobrevive a los cambios de tema.

Requiere desplegarla con Shopify CLI:

```bash
npm install -g @shopify/cli@latest
shopify app deploy
```

Luego: **Temas → Personalizar → sección del carrito → Agregar bloque →
Continuar con el envío**.

Es la opción recomendada a medio plazo. Para probar hoy, la Opción A es
suficiente y se deshace borrando el script.

---

## Cómo saber que todo el circuito funciona

1. Añade un producto al carrito.
2. Pulsa finalizar compra → debe abrirse el formulario.
3. Elige Lima / Lima / Magdalena del Mar → debe aparecer la tarifa que
   configuraste para ese distrito.
4. Completa los datos y pulsa continuar al pago.
5. En el checkout de Shopify, comprueba en el resumen del pedido que el costo de
   envío coincide con el que mostró el formulario.

Si el paso 5 muestra un importe distinto, el CarrierService no está respondiendo
y Shopify está usando tus tarifas manuales. Revísalo en el panel de la app →
Configuración → «Tarifas en el checkout».
