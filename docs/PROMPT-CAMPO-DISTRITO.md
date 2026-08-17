# Prompt de continuación — campo Distrito en el checkout

Copia todo lo que hay debajo de la línea y pégalo en una sesión nueva.

---

Trabajo en una app de Shopify llamada **Envío Perú** que calcula tarifas de
envío por Departamento → Provincia → Distrito (UBIGEO) para Perú. Necesito
resolver un problema concreto. Antes de proponer nada, lee estos archivos del
repositorio, en este orden:

1. `docs/DISTRITO-EN-SHOPIFY.md` — cómo funciona el campo Distrito en Shopify.
   Contiene el historial completo del diagnóstico y lo que ya se descartó.
2. `extensions/distrito-checkout/src/Checkout.jsx` — la extensión de checkout
   que debería rellenar el campo.
3. `app/lib/ubigeo/direccion.ts` — la capa que envuelve `@shopify/worldwide`.
4. `app/routes/proxy.api.confirmar.tsx` — compone `address2` al mandar al
   comprador al checkout.

No repitas lo que ya está descartado en el historial de ese primer documento.

## El problema

En el checkout, el recuadro **«Distrito»** llega **vacío**. Todo lo demás se
precarga correctamente: nombre, apellidos, documento, dirección, la referencia
en «Casa, apartamento», provincia, región, teléfono. Las tarifas de envío
también aparecen bien.

El distrito es el campo `neighborhood` de Shopify. No tiene columna propia:
viaja dentro de `address2`, unido a la línea 2 con el carácter invisible U+2060,
en el formato que define `@shopify/worldwide`.

Ya está comprobado que la cadena que compone la app es **idéntica byte a byte**
a la que produce la librería oficial. El formato no es el problema. Lo que
ocurre es que la precarga por URL se queda con la referencia y descarta el
distrito. Por eso existe la extensión de checkout: para volver a aplicar la
dirección ya dentro del checkout con `applyShippingAddressChange`.

## Estado actual

| Cosa | Estado |
|---|---|
| Servicio en Render | `https://envio-peru-shopify-surtiplas.onrender.com` — vivo |
| Repositorio | `github.com/surtiplast/envio-peru-shopify-Surtiplas`, rama `main` |
| Base de datos | Neon Postgres, región us-east-2 |
| App de Shopify | «Tarifa de envío Perú», client_id `c3de50d1466dc40754ea28f814d19b46` |
| Organización | InnovaSoft |
| Config activa | `shopify.app.tarifa-envio-peru.toml` |
| Tienda de pruebas | Plaza Multipack (`plazamultipack.pe`), app instalada el 16/08/2026 |

El build, las migraciones, el seed y el arranque funcionan. Las tarifas se
calculan y se muestran en el checkout.

## Dónde se quedó el diagnóstico

`Checkout.jsx` tiene una constante `DIAGNOSTICO` que, en `true`, escribe en la
consola del navegador con el prefijo `[envio-peru][distrito]`. Los mensajes
distinguen cuatro causas que desde fuera se ven idénticas:

| Mensaje | Causa |
|---|---|
| *(ninguna línea)* | La extensión no se ejecuta |
| `sin atributo Distrito` | El atributo del carrito no llegó |
| `NO disponible (¿permisos?)` | Falta acceso a datos protegidos nivel 2, campo Address |
| `RECHAZADO: ...` | Shopify rechazó el cambio |
| `OK: <distrito>` | Funcionó |

**En el archivo local `DIAGNOSTICO` está en `true`, pero no está confirmado que
se haya desplegado ese cambio.** Ese es el primer punto a verificar: sin
desplegar, la versión que corre en el checkout sigue con el diagnóstico apagado
y el silencio en consola no prueba nada.

Ayúdame a:

1. Confirmar que la versión desplegada tiene el diagnóstico activo.
2. Leer correctamente la consola. Las extensiones de checkout corren en un
   entorno aislado y sus mensajes pueden no salir en el contexto `top`.
3. Interpretar lo que salga y proponer el arreglo.

## Restricciones que no debes romper

- **`shopify app deploy` siempre con `--config tarifa-envio-peru`.** Sin la
  bandera, el CLI usa `shopify.app.toml`, que tiene placeholders.
- **`write_customers` está fuera de los scopes a propósito.** Es un scope de
  datos protegidos; mientras esa solicitud siga sin aprobar, pedirlo hace que
  Shopify devuelva 403 a **toda** la Admin API, incluido el registro del
  CarrierService.
- **Los scopes efectivos salen de la variable de entorno `SCOPES` en Render**,
  no del `.toml` (`app/shopify.server.ts` hace `process.env.SCOPES?.split(",")`).
  Si no coinciden, manda la variable.
- **`shopify app config link` regenera el `.toml`.** Puede dejarlo con
  `scopes = ""` y `application_url = "https://example.com"`. Revisa el archivo
  después de cada uso.
- **No inventes el formato de `address2` a mano.** Siempre
  `concatenateAddress2` / `splitAddress2`. Ojo con la firma: la primera recibe
  un objeto, la segunda dos argumentos sueltos `(countryCode, cadena)`.
- **Plaza Multipack es una tienda en producción.** No despliegues cambios que
  puedan alterar sus tarifas o su configuración sin avisarme antes.
- Deja `DIAGNOSTICO` en `false` cuando termine el diagnóstico.

## Dos cabos sueltos, por si aparecen

**CarrierService inactivo.** En algún momento el panel de la app mostró
«CarrierService inactivo — No pudimos registrar el servicio de tarifas».
Según `app/lib/shopify/carrier.server.ts`, ese estado es `ERROR` (no
`NO_ELEGIBLE`), o sea un 403 opaco, no un problema de plan de la tienda. El
texto crudo de Shopify queda guardado en la bitácora como `carrier.detalle` y
se puede ver en `/diagnostico?clave=...` si `DIAGNOSTICO_CLAVE` está definida
en Render.

**Posible conflicto de apps.** Puede que la app antigua «Envío Perú Plaza
multipack» (client_id `fdbdecffe1d5ecd524a682b028ca377c`) siga instalada en esa
misma tienda. Si es así, habría dos extensiones de checkout ejecutándose y dos
CarrierService registrados a la vez, lo que explicaría comportamientos
intermitentes. Esa app está en otra organización de Partners y el CLI actual no
la alcanza: `shopify app deploy --config envo-per-plaza-multipack` falla con
«Cannot find a valid organization». Conviene comprobar en el admin de la tienda
qué apps hay instaladas.

## Cómo quiero que trabajes

Ve paso a paso y verifica antes de concluir. Si un dato no lo puedes comprobar,
dímelo y pídemelo en vez de asumirlo. No soy desarrollador: dame los comandos
completos, sin marcadores de posición que yo tenga que sustituir, y dime en qué
carpeta ejecutarlos.
