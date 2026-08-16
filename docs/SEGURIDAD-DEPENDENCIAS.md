# Vulnerabilidades conocidas en dependencias

Última revisión: agosto de 2026
`npm audit` → **18 avisos** (8 moderados, 9 altos, 1 crítico) tras aplicar los
`overrides` de `package.json`. Sin ellos serían 22, con 2 críticos.

Ninguna está en el código de este proyecto. Todas vienen de dependencias
transitivas de Remix, Vite y ExcelJS.

---

## 1. Resueltas con `overrides`

`npm audit fix` **no** las arregla, aunque diga «fix available»: no puede subir
la versión porque el paquete vulnerable viene fijado por su padre
(`@remix-run/dev` → `cacache` → `tar`). La única vía es forzar la versión desde
`package.json`:

```json
"overrides": {
  "tar": "^7.5.21"
}
```

| Paquete | Severidad | Qué era |
|---|---|---|
| `tar` (vía `cacache`) | **crítica** | 12 avisos de path traversal, sobrescritura de archivos y DoS al extraer un `.tar`. |

Comprobado: tras el override, `tar` y `cacache` desaparecen del informe.

### Por qué NO se fuerza `estree-util-value-to-estree`

Lo intentamos y **rompe la compilación**. La versión corregida (3.3.3) es solo
ESM, pero `remark-mdx-frontmatter` —que arrastra `@remix-run/dev`— la carga con
`require()`, que es CommonJS. El build muere con `ERR_REQUIRE_ESM`.

El aviso es de contaminación de prototipo al generar árboles ESTree, dentro de
la cadena de herramientas de MDX. **Este proyecto no tiene ni un solo archivo
`.mdx`**, así que ese código nunca llega a ejecutarse: está instalado porque
Remix lo incluye, no porque lo usemos. Se acepta.

> Lección aprendida: un `override` puede romper el build sin que lo noten ni
> las pruebas ni el chequeo de tipos. Después de tocar dependencias hay que
> ejecutar **`npm run build`**, no solo `npm test` y `npm run typecheck`.

---

## 2. Solo afectan al ENTORNO DE DESARROLLO

Estas no llegan nunca al servidor de producción. Se ejecutan mientras corres
`npm run dev` o `npm test` en tu máquina.

### `vitest` (crítica) — servidor UI

> Cuando el servidor UI de Vitest está escuchando, se puede leer y ejecutar
> cualquier archivo. (`vitest < 3.2.6`)

**No expuesta.** El script del proyecto es `vitest run`, que ejecuta las
pruebas y termina. El servidor UI solo se levanta con `vitest --ui`, que no
usamos. **No lo ejecutes** mientras no haya versión corregida compatible.

### `vite` (alta) y `esbuild` (moderada) — servidor de desarrollo

- `server.fs.deny` se puede saltar en Windows mediante rutas alternativas.
- `esbuild` permite que cualquier web haga peticiones al servidor de desarrollo
  y lea la respuesta.
- `launch-editor`: filtración del hash NTLMv2 vía rutas UNC en Windows.

**Riesgo real en Windows, acotado:** si navegas por una web maliciosa *mientras*
tienes `npm run dev` levantado, esa web podría leer archivos de tu proyecto.

**Mitigación práctica:** no dejes el servidor de desarrollo corriendo mientras
navegas por sitios en los que no confías. Apágalo cuando no lo uses.

---

## 3. Aceptadas: afectan a producción pero sin arreglo disponible

### `react-router` (moderada) — vía `@remix-run/react`

- Redirección abierta mediante barra invertida en `<Link>` y `useNavigate`.
- Inyección de constructor arbitrario en `deserializeErrors()` durante la
  hidratación SSR.

**Exposición acotada.** React Router solo corre en el **panel del comerciante**,
embebido en el Shopify Admin detrás de OAuth: hay que estar autenticado como
administrador de la tienda para llegar. El **formulario del comprador**
(`public/envio/form.js`) es JavaScript plano, sin React ni React Router: la
superficie pública de la app no toca este código.

### `turbo-stream` (alta) — vía `@remix-run/server-runtime`

Denegación de servicio por entrada reflejada en *single fetch*.

**No explotable con la configuración actual:** `v3_singleFetch` está desactivado
en `vite.config.ts`. Si algún día lo activas, revisa antes si ya hay corrección.

### `uuid` (moderada) — vía `exceljs`

Falta comprobación de límites del búfer en UUID v3/v5/v6 cuando se pasa un `buf`
propio.

**No aplica.** ExcelJS solo genera el XLSX de exportación, con UUID v4 y sin
pasar búferes. El «arreglo» de npm es bajar ExcelJS a 3.4.0 —tres versiones
mayores atrás— y rompería la exportación.

---

## Lo que NO hay que hacer

```bash
npm audit fix --force   # ← no
```

Subiría Remix y ExcelJS de versión mayor sin avisar. Rompe la app y deja las
pruebas en rojo.

---

## Cómo revisar esto de nuevo

```bash
npm audit
npm test        # las 87 pruebas deben seguir en verde
```

Regla de este documento: **se acepta lo que no es alcanzable desde fuera; se
arregla todo lo demás.** Si un aviso nuevo afecta a `app/` o al formulario
público, se atiende, no se acepta.

---

## Pendiente a medio plazo

Migrar de **Remix 2 + Vite 5** a **React Router v7 + Vite 6**. Resuelve de raíz
`react-router`, `turbo-stream`, `vite` y `esbuild`, que son casi todo lo que
queda. Shopify ya publica plantillas de app basadas en React Router v7, así que
la ruta de migración está documentada.
