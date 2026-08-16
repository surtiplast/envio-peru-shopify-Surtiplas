import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { ajustesDe, obtenerOCrearTienda } from "../lib/shopify/tienda.server";
import catalogo from "../../data/ubigeo.json";

/**
 * Plantilla de tarifas para descargar.
 *
 * Se genera con los 1.874 distritos del catálogo ya escritos, para que el
 * comerciante solo tenga que poner precios. Sale del mismo catálogo que usa la
 * app, así que nunca se desincroniza.
 *
 * Dos variantes:
 *   ?tipo=vacia   (por defecto) geografía completa, precios en blanco
 *   ?tipo=ejemplo la misma, con una escalera de precios de muestra
 *
 * Se usa punto y coma como separador y BOM al principio: es lo que abre bien
 * Excel en español sin pasar por el asistente de importación. El importador
 * detecta el separador solo, así que da igual con cuál lo devuelvan.
 *
 * Devuelve JSON, no el archivo directamente. Dentro del iframe del admin de
 * Shopify una descarga por enlace no lleva la sesión y acaba rebotando al
 * OAuth; el navegador tiene que pedirla con fetch autenticado y construir el
 * archivo en local.
 */

interface DistritoCatalogo {
  ubigeo: string;
  codDep: string;
  codProv: string;
  departamento: string;
  provincia: string;
  distrito: string;
}

const N_RANGOS = 4;

const LIMITES: Array<[string, string]> = [
  ["0", "99.99"],
  ["100", "199.99"],
  ["200", "299.99"],
  ["300", ""], // sin límite superior
];

/** Precios de muestra por zona. Solo para la variante "ejemplo". */
function precios(d: DistritoCatalogo) {
  if (d.codProv === "1501") return { estandar: [15, 10, 5, 0], express: [25, 20, 15, 12] };
  if (d.codProv === "0701") return { estandar: [18, 12, 8, 0], express: [28, 22, 18, 15] };
  if (d.codDep === "15") return { estandar: [25, 20, 15, 10], express: [40, 35, 30, 25] };
  return { estandar: [35, 30, 25, 20], express: [65, 60, 55, 50] };
}

function celda(valor: unknown): string {
  const s = valor === null || valor === undefined ? "" : String(valor);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const tienda = await obtenerOCrearTienda(session.shop);
  const ajustes = await ajustesDe(tienda.id);

  const conEjemplo = new URL(request.url).searchParams.get("tipo") === "ejemplo";
  const distritos = catalogo as DistritoCatalogo[];

  const cabeceras = [
    "id", "storename", "codshopify",
    "departamento", "provincia", "distrito", "ubigeo",
  ];
  for (let i = 1; i <= N_RANGOS; i++) {
    cabeceras.push(`rango${i}_min`, `rango${i}_max`, `rango${i}_costo`, `rango${i}_costo2`, `rango${i}_costo3`);
  }
  cabeceras.push(
    "texto", "texto_description",
    "texto2", "texto2_description",
    "texto_collect", "texto_collect_description",
  );

  const lineas = [cabeceras.join(";")];

  distritos.forEach((d, i) => {
    const fila: Record<string, unknown> = {
      id: i + 1,
      storename: tienda.dominio.replace(".myshopify.com", ""),
      codshopify: "",
      departamento: d.departamento,
      provincia: d.provincia,
      distrito: d.distrito,
      ubigeo: d.ubigeo,
      texto: ajustes.etiquetaEstandar,
      texto_description: ajustes.descripcionEstandar,
      texto2: ajustes.etiquetaExpress,
      texto2_description: ajustes.descripcionExpress,
      texto_collect: "",
      texto_collect_description: "",
    };

    const p = conEjemplo ? precios(d) : null;

    LIMITES.forEach(([min, max], idx) => {
      const n = idx + 1;
      fila[`rango${n}_min`] = min;
      fila[`rango${n}_max`] = max;

      if (p) {
        const estandar = p.estandar[idx];
        fila[`rango${n}_costo`] = estandar === 0 ? "GRATIS" : estandar.toFixed(2);
        fila[`rango${n}_costo2`] = p.express[idx].toFixed(2);
        fila[`rango${n}_costo3`] = "";
      } else {
        // En blanco: es lo que el comerciante viene a rellenar.
        fila[`rango${n}_costo`] = "";
        fila[`rango${n}_costo2`] = "";
        fila[`rango${n}_costo3`] = "";
      }
    });

    lineas.push(cabeceras.map((h) => celda(fila[h])).join(";"));
  });

  const nombre = conEjemplo ? "tarifas-ejemplo-completo.csv" : "tarifas-plantilla-vacia.csv";

  // El BOM va aquí para que Excel en Windows respete los acentos al abrirlo.
  return json(
    { nombre, csv: "\ufeff" + lineas.join("\r\n") + "\r\n", filas: distritos.length },
    { headers: { "Cache-Control": "no-store" } },
  );
};
