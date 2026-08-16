# Poner el formulario dentro de la página del carrito

Por defecto el formulario vive en su propia página, `/apps/envio`, y el botón
del carrito lleva allí. También se puede **incrustar en la propia página del
carrito**, sin redirección, como hacen otras tiendas peruanas.

Las dos formas usan el mismo código y la misma configuración. Cambia solo dónde
se dibuja.

---

## Ventajas e inconvenientes

| | Página propia | Incrustado en el carrito |
|---|---|---|
| Pasos para el comprador | Carrito → formulario → checkout | Carrito → checkout |
| Riesgo de abandono | Un salto más | Menor |
| Espacio disponible | Toda la pantalla | El que deje tu tema |
| Interferencia con el tema | Ninguna | Puede chocar con estilos del tema |

Si tu página de carrito ya es larga, incrustarlo la alarga más. Pruébalo en
móvil antes de decidir.

---

## Cómo se incrusta

**Admin → Tienda online → Temas → ⋯ → Editar código**

Abre la sección del carrito. En la mayoría de temas es
`sections/main-cart-footer.liquid` o `sections/main-cart-items.liquid`; busca
el archivo que contenga `name="checkout"`.

Pega esto **donde quieras que aparezca el formulario**, normalmente justo
encima del botón de finalizar compra:

```liquid
{%- comment -%} Formulario de envío — Envío Perú {%- endcomment -%}
{%- if cart.item_count > 0 -%}
  <link rel="stylesheet" href="https://TU-APP.onrender.com/envio/form.css">
  <div id="ep-app"></div>
  <script src="https://TU-APP.onrender.com/envio/form.js" defer></script>
{%- endif -%}
```

Sustituye `TU-APP.onrender.com` por el dominio de tu servicio.

El script detecta que no hay configuración incrustada y la pide a
`/apps/envio/api/config`, que pasa por el App Proxy y va firmada por Shopify.
Por eso funciona sin que tengas que poner ninguna clave en el tema.

### Y quita la redirección

Si tenías el bloque que desviaba el botón de finalizar compra hacia
`/apps/envio`, **bórralo**. Con el formulario incrustado ya no hace falta, y si
lo dejas el comprador acabará viendo el formulario dos veces.

---

## Comprobaciones

1. Añade un producto y abre el carrito. El formulario debe dibujarse con tus
   colores y tu logo.
2. Elige un distrito: la tarifa debe aparecer.
3. Completa y pulsa el botón: debe llevarte al checkout con los datos puestos.
4. **Pruébalo en móvil.** Es donde más se nota si el tema aprieta el espacio.

---

## Si algo no encaja

**No aparece nada.** El `<div id="ep-app">` no llegó a la página, o el tema
carga el carrito por JavaScript y el script corrió antes. Prueba a ponerlo en
la plantilla del carrito en vez de en una sección.

**Aparece pero sin estilos.** Falta la línea del `form.css`, o el tema tiene
reglas que la pisan. Se resuelve acotando los estilos del tema, no los míos.

**Sale el aviso de que no se pudieron cargar las opciones.** La llamada a
`/apps/envio/api/config` falló. Comprueba que `https://TU-TIENDA.myshopify.com/apps/envio`
responde: si eso falla, el App Proxy no está bien configurado en el Dev Dashboard.

**Se ve dos veces.** Quedó también el bloque de redirección del `theme.liquid`.
