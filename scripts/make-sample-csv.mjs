#!/usr/bin/env node
/**
 * Genera data/tarifas-ejemplo.csv con TODOS los distritos del Perú y la misma
 * estructura de columnas descrita por el comerciante. Sirve como plantilla de
 * importación y como juego de datos para probar el flujo completo.
 *
 * Las tarifas se calculan por cercanía a Lima (solo como ejemplo verosímil):
 * el comerciante reemplazará los importes por los suyos.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, "..", "data");
const distritos = JSON.parse(fs.readFileSync(path.join(DATA, "ubigeo.json"), "utf8"));

const STORE = process.env.STORE_NAME || "mi-tienda";

/** Escalón de precio segun zona. */
function zona(d) {
  if (d.codProv === "1501") return "LIMA_METRO"; // Lima ciudad
  if (d.codProv === "0701") return "CALLAO";
  if (d.codDep === "15") return "LIMA_PROV";
  if (["04", "08", "13", "20", "14"].includes(d.codDep)) return "CIUDAD_PRINCIPAL";
  return "PROVINCIA";
}

const TABLA = {
  //            r1(0-99.99) r2(100-199.99) r3(200-299.99) r4(300+)  express  recojo
  LIMA_METRO: { base: [15, 10, 5, 0], express: [25, 20, 15, 12], recojo: true },
  CALLAO: { base: [18, 12, 8, 0], express: [28, 22, 18, 15], recojo: true },
  LIMA_PROV: { base: [25, 20, 15, 10], express: [40, 35, 30, 25], recojo: false },
  CIUDAD_PRINCIPAL: { base: [30, 25, 20, 15], express: [55, 50, 45, 40], recojo: false },
  PROVINCIA: { base: [35, 30, 25, 20], express: [65, 60, 55, 50], recojo: false },
};

const COLUMNAS = [
  "id", "storename", "codshopify", "departamento", "provincia", "distrito", "ubigeo",
  "rango1_min", "rango1_max", "rango1_costo", "rango1_costo2", "rango1_costo3",
  "rango2_min", "rango2_max", "rango2_costo", "rango2_costo2", "rango2_costo3",
  "rango3_min", "rango3_max", "rango3_costo", "rango3_costo2", "rango3_costo3",
  "rango4_min", "rango4_max", "rango4_costo", "rango4_costo2", "rango4_costo3",
  "texto", "texto_description", "texto2", "texto2_description",
  "texto3", "texto3_description", "texto_collect", "texto_collect_description",
];

const LIMITES = [
  ["0", "99.99"],
  ["100", "199.99"],
  ["200", "299.99"],
  ["300", ""], // sin límite
];

function comilla(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const filas = [COLUMNAS.join(",")];

distritos.forEach((d, i) => {
  const cfg = TABLA[zona(d)];
  const celdas = {
    id: i + 1,
    storename: STORE,
    codshopify: `${STORE.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 4)}-${d.ubigeo}`,
    departamento: d.departamento,
    provincia: d.provincia,
    distrito: d.distrito,
    ubigeo: d.ubigeo,
    texto: "Envío estándar",
    texto_description: "Entrega en 2 a 5 días hábiles",
    texto2: "Envío express",
    texto2_description: "Entrega en 24 horas",
    texto3: "Envío programado",
    texto3_description: "Elige el día de entrega",
    texto_collect: cfg.recojo ? "Recojo en tienda" : "",
    texto_collect_description: cfg.recojo ? "Sin costo de envío" : "",
  };

  LIMITES.forEach(([min, max], idx) => {
    const n = idx + 1;
    const estandar = cfg.base[idx];
    celdas[`rango${n}_min`] = min;
    celdas[`rango${n}_max`] = max;
    celdas[`rango${n}_costo`] = estandar === 0 ? "GRATIS" : estandar.toFixed(2);
    celdas[`rango${n}_costo2`] = cfg.express[idx].toFixed(2);
    celdas[`rango${n}_costo3`] = (estandar === 0 ? 0 : estandar * 0.8).toFixed(2);
  });

  filas.push(COLUMNAS.map((c) => comilla(celdas[c])).join(","));
});

const destino = path.join(DATA, "tarifas-ejemplo.csv");
fs.writeFileSync(destino, filas.join("\n") + "\n", "utf8");
console.log(`CSV de ejemplo generado: ${destino} (${distritos.length} filas de tarifa)`);

// --- Segundo archivo: casos límite, para probar el validador del importador ---
const problemas = [
  // distrito inexistente
  ["9001", STORE, "X-1", "Lima", "Lima", "Distrito Fantasma", "", "0", "99.99", "15", "20", "12"],
  // ubigeo mal formado
  ["9002", STORE, "X-2", "Lima", "Lima", "Miraflores", "ABC123", "0", "99.99", "15", "20", "12"],
  // importe no numérico
  ["9003", STORE, "X-3", "Lima", "Lima", "Barranco", "150104", "0", "99.99", "quince soles", "20", "12"],
  // hueco entre rangos
  ["9004", STORE, "X-4", "Lima", "Lima", "Surquillo", "150140", "0", "50", "15", "20", "12"],
  // duplicado del anterior
  ["9005", STORE, "X-5", "Lima", "Lima", "Surquillo", "150140", "0", "99.99", "18", "22", "14"],
  // errata en el nombre (debe resolverse por aproximación)
  ["9006", STORE, "X-6", "Lima", "Lima", "Magdalena del Mr", "", "0", "99.99", "15", "20", "12"],
];
const cabeceraProblemas = COLUMNAS.slice(0, 12).join(",");
fs.writeFileSync(
  path.join(DATA, "tarifas-con-errores.csv"),
  [cabeceraProblemas, ...problemas.map((f) => f.map(comilla).join(","))].join("\n") + "\n",
  "utf8",
);
console.log("CSV de casos límite generado: data/tarifas-con-errores.csv");
