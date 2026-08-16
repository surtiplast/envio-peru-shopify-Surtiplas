# Publicar en la Shopify App Store

Estado del proyecto y lo que falta. Ordenado por lo que bloquea la publicación.

## Bloqueantes

### 1. Cambiar el proveedor de mapas a Google
Nominatim, el que usas ahora, es un servicio gratuito de OpenStreetMap cuya
política de uso **prohíbe** el uso masivo desde servidores en la nube, y ya nos
está devolviendo 429 con una sola tienda. Publicar la app así significa que
fallará de forma intermitente en las tiendas de tus clientes y que estarías
incumpliendo las condiciones de un tercero.

Alternativas: Google (10.000 geocodificaciones gratis al mes, requiere tarjeta)
o montar una instancia propia de Nominatim.

### 2. Decidir quién paga las consultas de DNI/RUC
Hoy hay **un solo token de APIsPERU** para todas las tiendas. Con la app
publicada, todas las consultas de todos los comerciantes saldrían de tu cuota y
de tu bolsillo, y un solo comerciante con mucho tráfico puede agotarla para el
resto.

Opciones: que cada comerciante ponga su propio token desde Configuración, o
incluirlo en el precio con un límite mensual por tienda.

### 3. Facturación con la API de Shopify
La app ya tiene pantalla de suscripción. Verifica que el cobro se hace **solo**
con la API de facturación de Shopify: cobrar por fuera es motivo de rechazo
inmediato.

### 4. Política de privacidad y soporte
La app guarda datos personales del comprador (nombre, correo, teléfono,
documento y dirección). Necesitas:
- Una URL de política de privacidad que explique qué guardas, cuánto tiempo y
  para qué.
- Un correo de soporte que atiendas de verdad.

Los webhooks de privacidad ya están declarados y respondidos.

## Requisitos técnicos que ya cumple

- OAuth con instalación gestionada por Shopify.
- Webhooks de cumplimiento (`customers/data_request`, `customers/redact`,
  `shop/redact`).
- Panel con Polaris.
- Extensión de tema con bloques, sin pedir que nadie pegue código.
- Sin dependencias de escritorio, sin saltarse el checkout.
- El JavaScript del escaparate pesa poco y no bloquea el renderizado.

## Antes de enviar a revisión

- [ ] Icono de 1200×1200 px.
- [ ] Capturas de pantalla del panel y del formulario en la tienda.
- [ ] Descripción, funcionalidades y precio en la ficha.
- [ ] Vídeo corto de demostración (opcional, pero ayuda mucho).
- [ ] Tienda de demostración con datos de ejemplo para los revisores.
- [ ] Instrucciones de prueba para el revisor: cómo importar tarifas, dónde
      añadir los bloques y qué esperar en el checkout.
- [ ] Comprobar que la app funciona en una tienda **recién instalada**, sin
      configuración previa. Es el primer camino que recorre un revisor.
- [ ] `DIAGNOSTICO_CLAVE` definida en Render.

## Limitaciones que conviene contar en la ficha

Es mejor decirlo tú que recibir una reseña de una estrella:

- Las tarifas calculadas necesitan plan Advanced, Plus, o Grow con facturación
  anual. En otros planes el formulario funciona, pero el precio del checkout
  sale de las tarifas manuales de la tienda.
- El checkout de Shopify no permite preseleccionar la pestaña «Retiro»: eso lo
  elige el comprador.

## Enlaces

- Requisitos: https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements
- Buenas prácticas: https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices
