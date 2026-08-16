# Atender a un comerciante que pide ayuda

Guía práctica para cuando llegue el primer correo. No es teoría: los casos de
abajo son los que ya nos han pasado a nosotros montando la app.

---

## 1. El canal

La ficha de la App Store obliga a publicar un **correo de soporte** y una **URL
de ayuda**. Ese correo es por donde entrará todo. Recomendaciones:

- Usa una dirección del dominio de la empresa, no un Gmail personal. Da
  confianza y te permite pasarla a otra persona más adelante.
- Contesta en menos de 24 h hábiles, aunque sea para decir «lo estoy mirando».
  Shopify mide la calidad del soporte y los comerciantes puntúan la app por
  ello.
- Escribe en español y en inglés en la ficha; en Perú te escribirán en español,
  pero la revisión de Shopify es en inglés.

---

## 2. Qué pedir en la primera respuesta

Casi cualquier incidencia se diagnostica con estos cuatro datos:

1. **El dominio de la tienda** (`algo.myshopify.com`). Sin esto no puedes buscar
   nada: la app separa todo por tienda.
2. **Qué esperaba y qué pasó**, en una frase.
3. **El número de pedido** si el problema afecta a un pedido concreto.
4. **Una captura** de la pantalla donde lo ve.

Y la hora aproximada, si fue algo puntual: la bitácora está ordenada por fecha.

### Qué NO pedir nunca

- **Datos personales del comprador.** Nombre, DNI, teléfono o dirección
  completa por correo o WhatsApp. Si necesitas ver un pedido, pide el número y
  míralo tú con acceso de colaborador.
- **Contraseñas ni códigos de acceso.** Jamás, por ningún motivo.
- Capturas del checkout sin recortar: llevan el correo y el teléfono del
  comprador a la vista.

Esto no es formalismo: lo prometimos en la política de privacidad y es lo que
declaramos a Shopify en el formulario de datos protegidos.

---

## 3. Tus herramientas

### La pantalla de diagnóstico

```
https://innovasoft-shipping-peru.onrender.com/diagnostico?clave=TU_CLAVE
```

Sin la clave devuelve 404. Te muestra:

- **`baseDatos`** — tiendas instaladas, sesiones guardadas, distritos cargados.
  Si `sesiones` es 0, el OAuth nunca se completó.
- **`geolocalizacion`** — proveedor activo, si la clave está definida, los
  últimos avisos de error y las últimas direcciones enviadas al checkout.
- **`documentos`** — proveedor de DNI/RUC, si las plantillas tienen `{numero}`,
  y las últimas consultas (solo los tres últimos dígitos, nunca el número).
- **`credenciales`** y **`urls`** — para detectar una clave mal pegada o una
  URL que no coincide con la de Render.
- **`ultimosErrores`** — la bitácora reciente.

### El estado del servicio

```
https://innovasoft-shipping-peru.onrender.com/salud
```

Público y sin clave. Si `baseDatos` no dice `conectada` o
`distritosCargados` no es 1874, el problema es tuyo, no del comerciante.

### Acceso de colaborador

Cuando necesites mirar la tienda por dentro, pídele que te envíe una
**solicitud de colaborador** desde su admin (Configuración → Usuarios →
Colaboradores). Pide solo los permisos que necesites: Apps, Pedidos y
Configuración de envíos. No pidas acceso completo «por si acaso»: el
comerciante lo nota y resta confianza.

---

## 4. Los siete casos más frecuentes

### «La app no me aparece en la tienda»

Casi siempre la extensión de tema no está activada. El comerciante tiene que ir
a **Tienda online → Personalizar → Añadir bloque** y colocar el bloque del
formulario. Que la app esté instalada no basta.

### «Sale envío gratis en un distrito que no cubro»

Revisa la tarifa de ese distrito en su panel. Lo más común: la tarifa existe
pero está desactivada, o hay un rango con un hueco (por ejemplo, termina en
S/ 99.99 y el siguiente empieza en S/ 101). El editor avisa de los huecos con
una advertencia arriba.

### «El campo Distrito del checkout está vacío»

Limitación de Shopify: la precarga por URL descarta ese campo. La extensión de
checkout intenta rellenarlo, pero no funciona con Apple Pay ni Google Pay, y el
recuadro solo existe si la tienda tiene activados los campos de dirección
adicionales (acceso anticipado, se pide al soporte de Shopify).

**Lo importante:** el distrito sí llega al pedido, porque el webhook lo repone.
Enséñale el pedido en el admin y comprueba que la dirección está completa. Para
despachar no le falta nada.

### «No guarda la fecha de nacimiento ni los consentimientos»

Falta el permiso `write_customers`. Se soluciona desinstalando y reinstalando
la app: Shopify solo pide permisos nuevos en una instalación nueva.

### «El buscador de direcciones dice que el servicio está ocupado»

Es el límite de peticiones del proveedor de mapas. Mira `geolocalizacion` en
diagnóstico: si `proveedorActivo` es `nominatim`, ese servicio bloquea las IP de
servidores. Con Google configurado no debería pasar; si pasa, revisa la cuota en
Google Cloud Console.

### «No encuentra mi dirección»

Distinto del anterior. Suele ser una dirección mal escrita o un distrito que el
proveedor no reconoce. Recuérdale que el buscador es una ayuda: el comprador
siempre puede elegir su distrito de la lista a mano.

### «Cambié las tarifas y el checkout sigue con las de antes»

Shopify cachea las respuestas del CarrierService unos minutos. Que espere y
pruebe con un carrito nuevo.

---

## 5. Cuando el fallo es tuyo

Pasa. Cuando pase:

- **Dilo.** «Era un fallo nuestro, ya está corregido» vale más que una
  explicación técnica larga.
- Corrige, despliega y avisa al comerciante de que ya puede probar.
- Si afectó a pedidos reales, dile exactamente a cuáles y qué debe revisar.
- Si afectó a datos personales, esto deja de ser soporte y pasa a ser un
  incidente: sigue `/seguridad`.

No prometas fechas que no puedas cumplir. «Esta semana» que se convierte en tres
semanas hace más daño que un «no sé cuándo, te aviso».

---

## 6. Lo que conviene tener antes de publicar

- Correo de soporte del dominio propio, con respuesta automática de recepción.
- Una página de ayuda con las preguntas frecuentes de arriba, para que la mitad
  de los correos no lleguen.
- `DIAGNOSTICO_CLAVE` puesta en Render y guardada donde la encuentres rápido.
- El servicio de Render en plan de pago, para que no duerma cuando un
  comerciante entre a las 11 de la noche.
