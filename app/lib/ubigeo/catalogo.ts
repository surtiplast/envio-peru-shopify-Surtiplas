/**
 * Catálogo oficial de UBIGEO (INEI) con búsqueda tolerante a errores.
 *
 * Se carga una sola vez en memoria (≈1.868 distritos, ~230 KB) y se indexa.
 * Es más rápido y más barato que consultar la base de datos en cada tecla del
 * selector de distritos o en cada llamada del CarrierService.
 */
import catalogoJson from "../../../data/ubigeo.json";
import indiceJson from "../../../data/ubigeo-index.json";

export interface DistritoCatalogo {
  ubigeo: string;
  codDep: string;
  codProv: string;
  departamento: string;
  provincia: string;
  distrito: string;
}

export interface ItemGeo {
  codigo: string;
  nombre: string;
  key: string;
}

const DISTRITOS = catalogoJson as DistritoCatalogo[];
const INDICE = indiceJson as { departamentos: ItemGeo[]; provincias: (ItemGeo & { codDep: string })[] };

/** Normaliza para comparar: sin tildes, sin puntuación, MAYÚSCULAS. */
export function normalizar(valor: string | null | undefined): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Alias frecuentes en direcciones reales y en respuestas de geocodificación.
 * Google devuelve "Lima District" o "Cercado de Lima" donde el INEI dice "Lima".
 */
const ALIAS: Record<string, string> = {
  "CERCADO DE LIMA": "LIMA",
  "LIMA CERCADO": "LIMA",
  "LIMA DISTRICT": "LIMA",
  "LIMA METROPOLITANA": "LIMA",
  "PROVINCIA DE LIMA": "LIMA",
  "PROVINCIA CONSTITUCIONAL DEL CALLAO": "CALLAO",
  "CALLAO REGION": "CALLAO",
  "MAGDALENA VIEJA": "PUEBLO LIBRE",
  "SAN MARTIN DE PORRAS": "SAN MARTIN DE PORRES",
  "SANTIAGO DE SURCO": "SANTIAGO DE SURCO",
  "SURCO": "SANTIAGO DE SURCO",
  "SAN JUAN DE MIRAFLORES": "SAN JUAN DE MIRAFLORES",
  "SJM": "SAN JUAN DE MIRAFLORES",
  "SJL": "SAN JUAN DE LURIGANCHO",
  "VMT": "VILLA MARIA DEL TRIUNFO",
  "VES": "VILLA EL SALVADOR",
  "CERCADO DE AREQUIPA": "AREQUIPA",
  "CERCADO DE TRUJILLO": "TRUJILLO",
  "CUSCO REGION": "CUSCO",
  "CUZCO": "CUSCO",
};

function conAlias(valor: string): string {
  const n = normalizar(valor);
  return ALIAS[n] ?? n;
}

// --- Índices ---------------------------------------------------------------

const porUbigeo = new Map<string, DistritoCatalogo>();
/** clave "DISTRITO|PROVINCIA|DEPARTAMENTO" -> distrito (coincidencia exacta) */
const porTerna = new Map<string, DistritoCatalogo>();
/** clave "DISTRITO" -> lista (puede haber homónimos en varios departamentos) */
const porNombreDistrito = new Map<string, DistritoCatalogo[]>();

for (const d of DISTRITOS) {
  porUbigeo.set(d.ubigeo, d);
  const kd = conAlias(d.distrito);
  const kp = conAlias(d.provincia);
  const kdep = conAlias(d.departamento);
  porTerna.set(`${kd}|${kp}|${kdep}`, d);
  const lista = porNombreDistrito.get(kd);
  if (lista) lista.push(d);
  else porNombreDistrito.set(kd, [d]);
}

// --- Consultas del selector dependiente -------------------------------------

export function listarDepartamentos(): ItemGeo[] {
  return INDICE.departamentos;
}

export function listarProvincias(codDep: string): ItemGeo[] {
  return INDICE.provincias.filter((p) => p.codDep === codDep);
}

export function listarDistritos(codProv: string): DistritoCatalogo[] {
  return DISTRITOS.filter((d) => d.codProv === codProv);
}

export function obtenerDistrito(ubigeo: string): DistritoCatalogo | null {
  return porUbigeo.get(String(ubigeo).padStart(6, "0")) ?? null;
}

export function totales() {
  return {
    departamentos: INDICE.departamentos.length,
    provincias: INDICE.provincias.length,
    distritos: DISTRITOS.length,
  };
}

// --- Distancia de edición para coincidencias aproximadas --------------------

function distancia(a: string, b: string, tope: number): number {
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  const previa = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) previa[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let anterior = previa[0];
    previa[0] = i;
    let mejorFila = previa[0];
    for (let j = 1; j <= b.length; j++) {
      const temp = previa[j];
      previa[j] = Math.min(
        previa[j] + 1,
        previa[j - 1] + 1,
        anterior + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      anterior = temp;
      if (previa[j] < mejorFila) mejorFila = previa[j];
    }
    if (mejorFila > tope) return tope + 1;
  }
  return previa[b.length];
}

// --- Resolución -------------------------------------------------------------

export interface EntradaResolucion {
  ubigeo?: string | null;
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
}

export interface ResultadoResolucion extends DistritoCatalogo {
  /** "UBIGEO" | "TERNA" | "DISTRITO_UNICO" | "APROXIMADO" */
  metodo: string;
  confianza: number;
}

/**
 * Encuentra el distrito a partir de lo que haya: UBIGEO, la terna completa,
 * o solo el nombre del distrito. Estrategia en cascada, de lo más fiable a lo
 * menos fiable, y nunca adivina cuando hay homónimos ambiguos.
 */
export function resolver(entrada: EntradaResolucion): ResultadoResolucion | null {
  // 1. UBIGEO explícito: la vía más fiable.
  if (entrada.ubigeo) {
    const limpio = String(entrada.ubigeo).replace(/\D/g, "");
    if (limpio.length >= 5) {
      const d = porUbigeo.get(limpio.padStart(6, "0"));
      if (d) return { ...d, metodo: "UBIGEO", confianza: 1 };
    }
  }

  const kd = entrada.distrito ? conAlias(entrada.distrito) : "";
  const kp = entrada.provincia ? conAlias(entrada.provincia) : "";
  const kdep = entrada.departamento ? conAlias(entrada.departamento) : "";

  // 2. Terna exacta.
  if (kd && kp && kdep) {
    const d = porTerna.get(`${kd}|${kp}|${kdep}`);
    if (d) return { ...d, metodo: "TERNA", confianza: 1 };
  }

  if (!kd) return null;

  // 3. Nombre de distrito, acotando por provincia/departamento si los hay.
  let candidatos = porNombreDistrito.get(kd) ?? [];
  if (candidatos.length > 1 && kdep) {
    const filtrados = candidatos.filter((c) => conAlias(c.departamento) === kdep);
    if (filtrados.length) candidatos = filtrados;
  }
  if (candidatos.length > 1 && kp) {
    const filtrados = candidatos.filter((c) => conAlias(c.provincia) === kp);
    if (filtrados.length) candidatos = filtrados;
  }
  if (candidatos.length === 1) {
    return { ...candidatos[0], metodo: "DISTRITO_UNICO", confianza: 0.9 };
  }
  if (candidatos.length > 1) return null; // ambiguo: mejor preguntar que equivocarse

  // 4. Coincidencia aproximada (erratas: "Magdalena del Mar" vs "Magdalena de Mar").
  const tope = kd.length <= 6 ? 1 : 2;
  let mejor: DistritoCatalogo | null = null;
  let mejorDistancia = tope + 1;
  let empates = 0;

  for (const d of DISTRITOS) {
    if (kdep && conAlias(d.departamento) !== kdep) continue;
    if (kp && conAlias(d.provincia) !== kp) continue;
    const dist = distancia(kd, conAlias(d.distrito), tope);
    if (dist < mejorDistancia) {
      mejorDistancia = dist;
      mejor = d;
      empates = 1;
    } else if (dist === mejorDistancia) {
      empates++;
    }
  }

  if (mejor && mejorDistancia <= tope && empates === 1) {
    return { ...mejor, metodo: "APROXIMADO", confianza: 1 - mejorDistancia * 0.2 };
  }

  return null;
}

/** Autocompletado de distritos por texto libre, para el buscador del formulario. */
export function buscar(texto: string, limite = 10): DistritoCatalogo[] {
  const q = normalizar(texto);
  if (q.length < 2) return [];
  const empiezan: DistritoCatalogo[] = [];
  const contienen: DistritoCatalogo[] = [];
  for (const d of DISTRITOS) {
    const n = normalizar(d.distrito);
    if (n.startsWith(q)) empiezan.push(d);
    else if (n.includes(q)) contienen.push(d);
    if (empiezan.length >= limite) break;
  }
  return [...empiezan, ...contienen].slice(0, limite);
}
