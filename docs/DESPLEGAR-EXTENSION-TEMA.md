# Añadir el formulario y la calculadora desde el editor del tema

Con la extensión de tema publicada, el comerciante **no pega código**: entra al
editor del tema, pulsa «Agregar bloque» y elige el que quiera. Al desinstalar la
app, los bloques desaparecen solos.

Esto sustituye al «Liquid personalizado» que había que pegar a mano, y elimina
el número de versión (`?v=`): Shopify pone su propia versión a los archivos de
la extensión, así que al publicar una versión nueva el navegador la descarga sin
que nadie tenga que tocar nada.

## Publicar la extensión (lo haces tú, una vez por cada cambio del formulario)

Desde la carpeta del proyecto:

```
npm run extension:assets
shopify app deploy
```

El primer comando copia el CSS y el JavaScript a la extensión. El segundo la
publica. Si es la primera vez, la CLI pedirá iniciar sesión y elegir la app.

## Instalarlo en una tienda (lo hace el comerciante)

### Formulario del carrito

1. Tienda online → Temas → **Personalizar**.
2. Arriba, cambia la plantilla a **Carrito**.
3. **Agregar bloque** → sección **Apps** → **Formulario de envío**.
4. Colócalo donde quieras y ajusta el ancho y los espacios.
5. Guardar.

### Calculadora de envíos

1. Crea o abre la página donde la quieras (por ejemplo «Costos de envío»).
2. En el editor, **Agregar bloque** → **Apps** → **Calculadora de envíos**.
3. Cambia el título y el subtítulo si quieres.
4. Guardar.

También se puede poner en la ficha de producto o en el pie: el bloque no exige
ninguna plantilla concreta.

## Colores, textos e iconos

No se configuran en el tema, sino en la app: **Envío Perú → Personalización**.
Así el formulario y la calculadora comparten la misma apariencia y hay una sola
pantalla que aprender. La vista previa de esa pantalla muestra las dos piezas.

## Si prefieres seguir con el Liquid pegado a mano

Sigue funcionando: los mismos archivos se sirven desde el dominio de la app. La
diferencia es que ahí sí hay que subir el `?v=` cada vez que se publica un
cambio. Con la extensión no.
