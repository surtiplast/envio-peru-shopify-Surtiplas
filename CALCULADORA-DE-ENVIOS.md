# Calculadora de envíos para el comprador

Deja que cualquier visitante consulte cuánto le cuesta el envío a su distrito,
sin necesidad de tener nada en el carrito. Muestra la escalera completa de
precios y a partir de qué monto el envío sale gratis.

## Opción 1: página propia

Ya está publicada en:

```
https://TU-TIENDA.com/apps/envio/calculadora
```

Enlázala desde el menú de la tienda (Tienda online → Navegación) o desde el pie
de página. No hay que tocar el tema.

## Opción 2: incrustarla donde quieras

Pega este bloque en la página de producto, en una página de "Envíos" o en el pie.
En el editor del tema: **Añadir sección → Liquid personalizado**.

```liquid
<link rel="stylesheet" href="https://envio-peru.onrender.com/envio/form.css?v=1">
<div class="envio-peru-calculadora">
  <h2>Calcula el costo de tu envío</h2>
  <div id="ep-calculadora"></div>
</div>
<style>
  .envio-peru-calculadora { max-width: 760px; margin: 0 auto; padding: 24px 16px; }
  .envio-peru-calculadora h2 { font-size: 20px; margin: 0 0 12px; }
</style>
<script src="https://envio-peru.onrender.com/envio/calculadora.js?v=1" defer></script>
```

Sube el número de `?v=` después de cada despliegue para que el navegador
descargue la versión nueva.

## Qué muestra

- Los rangos de cada método activo del distrito: "de S/ 100 a S/ 199.99 son S/ 12".
- El umbral de envío gratis, si lo hay.
- Las sedes de recojo en tienda, con su dirección y horario.
- Si el distrito no tiene reparto, lo dice claramente en vez de inventar un precio.

## Notas

- Los precios se cachean media hora. Si cambias una tarifa y quieres verla al
  instante, recarga con Ctrl+F5.
- La calculadora no necesita carrito ni datos del comprador: no pide nombre,
  correo ni documento.
