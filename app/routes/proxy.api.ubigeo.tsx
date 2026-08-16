import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { exigirProxy } from "../lib/security/proxy.server";
import { listarDepartamentos, listarDistritos, listarProvincias, buscar } from "../lib/ubigeo/catalogo";

/**
 * Catálogo geográfico para el selector dependiente.
 * Es información pública y estática, así que se puede cachear con tranquilidad.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  exigirProxy(request);
  const url = new URL(request.url);
  const dep = url.searchParams.get("dep");
  const prov = url.searchParams.get("prov");
  const q = url.searchParams.get("q");

  const cabeceras = { "Cache-Control": "public, max-age=86400" };

  if (q) return json({ distritos: buscar(q) }, { headers: cabeceras });
  if (prov) return json({ distritos: listarDistritos(prov) }, { headers: cabeceras });
  if (dep) return json({ provincias: listarProvincias(dep) }, { headers: cabeceras });
  return json({ departamentos: listarDepartamentos() }, { headers: cabeceras });
};
