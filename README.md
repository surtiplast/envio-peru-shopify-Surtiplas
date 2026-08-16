# Envío Perú — App de Shopify para tarifas por distrito

Calcula el costo de envío según **Departamento → Provincia → Distrito (UBIGEO)**,
con un formulario propio antes del checkout oficial de Shopify.

- **1.874 distritos** del INEI incluidos (25 departamentos, 196 provincias).
- Envío estándar, express y recojo en tienda, con rangos por subtotal.
- Importación y exportación CSV/XLSX con mapeo inteligente de columnas.
- Panel del comerciante con Polaris; formulario del comprador sin dependencias.
- Geolocalización y consulta DNI/RUC con proveedores intercambiables.
- Multi-tienda estricto y facturación con la Billing API de Shopify.

---

## Puesta en marcha

```bash
# 1. Requisitos: Node 20+, PostgreSQL 14+, Shopify CLI
npm install

# 2. Variables de entorno
cp .env.example .env
#    Rellena SHOPIFY_API_KEY, SHOPIFY_API_SECRET, DATABASE_URL y
#    SESSION_SIGNING_SECRET como mínimo.

# 3. Base de datos + catálogo geográfico
npx prisma migrate dev --name inicial
npm run ubigeo:build     # genera data/ubigeo.json desde el dataset del INEI
npm run db:seed          # carga departamentos, provincias y distritos

# 4. Datos de ejemplo (opcional)
npm run csv:sample       # genera data/tarifas-ejemplo.csv con los 1.874 distritos

# 5. Pruebas
npm test                 # 87 pruebas

# 6. Desarrollo
npm run dev              # shopify app dev
```

En `shopify.app.toml` reemplaza `client_id` y `application_url` por los de tu
Partner Dashboard antes de instalar.

---

## Cómo lo usa el comerciante

1. **Importar** → arrastra su CSV. La app detecta las columnas, muestra una
   vista previa, valida y resume: *X nuevos · Y actualizaciones · Z errores*.
   Los errores se descargan como CSV para corregirlos en Excel.
2. **Tarifas** → busca, filtra por departamento/provincia/estado, edita rangos.
3. **Probar tarifa** → elige distrito y subtotal, y ve el precio *y la regla
   que se aplicó*. Sirve para validar antes de publicar.
4. **Recojo en tienda** → da de alta sus sedes con horario y teléfono.
5. **Personalización** → logo, colores, textos y qué campos mostrar, con vista
   previa en vivo.

## Cómo lo vive el comprador

```
Carrito → «Continuar con el envío»
   ↓
📍 Ubicación (GPS, buscador de direcciones o selectores)
   ↓
Dirección y referencia
   ↓
👤 Datos (DNI/RUC con autocompletado)
   ↓
🚚 Estándar · ⚡ Express · 🏪 Recojo — con su precio
   ↓
Resumen + términos y condiciones
   ↓
CHECKOUT OFICIAL DE SHOPIFY → pago
```

---

## Estructura

```
app/
  lib/rates/       motor de tarifas (puro) + consulta a BD
  lib/csv/         importación y exportación
  lib/ubigeo/      catálogo INEI + resolución difusa
  lib/geo/         proveedores de geolocalización
  lib/documents/   proveedores DNI/RUC
  lib/security/    firmas, validación, rate limit
  lib/shopify/     CarrierService, billing, tenant
  routes/app.*     panel del comerciante (Polaris)
  routes/proxy.*   formulario del comprador y su API
  routes/api.carrier-service.tsx   callback de tarifas de Shopify
public/envio/      CSS y JS del formulario (sin dependencias)
prisma/schema.prisma
data/              catálogo UBIGEO y CSV de ejemplo
docs/ARQUITECTURA.md   decisiones y límites reales de Shopify
docs/DISTRITO-EN-SHOPIFY.md  cómo viaja el distrito peruano (no documentado)
extensions/        bloque de tema para el botón del carrito
tests/             87 pruebas
```

---

## El CSV

Se admite exactamente la estructura descrita, y el importador tolera variantes
de nombre (`Dpto`, `Rango 1 Desde`, `r1_costo`…):

```
id, storename, codshopify, departamento, provincia, distrito, ubigeo,
rango1_min, rango1_max, rango1_costo, rango1_costo2, rango1_costo3,
rango2_min, ..., rangoN_*,
texto, texto_description, texto2, texto2_description,
texto3, texto3_description, texto_collect, texto_collect_description
```

**No se pierde información.** Las columnas que la app no usa se guardan en
`Tarifa.extras` y se devuelven al exportar, así que exportar → editar → importar
es un ciclo cerrado.

Las tres columnas de costo por rango se pueden interpretar de dos formas, y se
elige al importar:

| Modo | `costo` | `costo2` | `costo3` |
|---|---|---|---|
| `METODOS` (por defecto) | Envío estándar | Envío express | Precio alternativo del estándar |
| `ALTERNATIVOS` | Estándar | Alternativo 1 | Alternativo 2 |

Importes admitidos: `15`, `15.50`, `15,50`, `S/ 1,234.50`, `1.234,50`, `GRATIS`.
Un `rangoN_max` vacío o `-` significa *sin límite*.

---

## Antes de subir a producción, lee esto

`docs/ARQUITECTURA.md` explica en detalle **qué permite y qué no permite
Shopify**. Los dos puntos que más sorprenden:

1. **CarrierService exige plan Advanced+**, plan Shopify anual, o tienda de
   desarrollo. La app lo detecta y avisa; no se rompe.
2. **El checkout no se puede rellenar entero desde fuera.** Se precarga lo que
   Shopify documenta (email, nombre, apellido, dirección, ciudad, provincia,
   país, teléfono) y el resto viaja como atributos del carrito, que sí llegan
   íntegros al pedido.

No se usan hacks sobre el checkout. El pago es 100 % de Shopify y la app nunca
recibe datos de tarjeta.

---

## Créditos de datos

El catálogo de UBIGEO procede del dataset público del INEI distribuido en el
paquete `ubigeo-peru` (licencia en `data/_raw-ubigeo-LICENSE.txt`). El
generador corrige un defecto conocido del dataset (la provincia de Bagua venía
codificada como departamento) — ver `scripts/build-ubigeo.mjs`.
