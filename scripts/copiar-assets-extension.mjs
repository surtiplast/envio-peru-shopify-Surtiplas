/**
 * Copia el CSS y el JavaScript del formulario a los assets de la extensión.
 *
 * Los archivos viven en `public/envio` porque desde ahí los sirve la app en sus
 * propias páginas (/apps/envio y /apps/envio/calculadora). La extensión de tema
 * necesita su propia copia para que Shopify los publique en su CDN y les ponga
 * versión automáticamente.
 *
 * Se ejecuta antes de `shopify app deploy`: así nunca se publica una extensión
 * con una copia vieja.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origen = join(raiz, "public", "envio");
const destino = join(raiz, "extensions", "envio-peru", "assets");

mkdirSync(destino, { recursive: true });

for (const archivo of ["form.css", "form.js", "calculadora.js"]) {
  copyFileSync(join(origen, archivo), join(destino, archivo));
  console.log(`  copiado ${archivo}`);
}
