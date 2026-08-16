#!/usr/bin/env node
/**
 * Construye los archivos normalizados de UBIGEO a partir del dataset crudo del INEI.
 *
 * Entrada : data/_raw-ubigeo-inei.json  (registros { departamento, provincia, distrito, nombre })
 * Salidas :
 *   data/ubigeo.json        -> catálogo plano de distritos (1 fila por distrito)
 *   data/ubigeo-index.json  -> índices de departamentos y provincias
 *
 * El UBIGEO INEI es de 6 dígitos: DDPPDD. Se conserva SIEMPRE como string para no
 * perder ceros a la izquierda. Nunca usar Number() sobre un ubigeo.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, "..", "data");

/** Normaliza texto para comparación difusa: sin tildes, sin puntuación, MAYÚSCULAS. */
export function norm(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

const raw = JSON.parse(fs.readFileSync(path.join(DATA, "_raw-ubigeo-inei.json"), "utf8"));

const departamentos = new Map();
const provincias = new Map();
const distritos = [];
/**
 * El dataset público del INEI trae algunas filas de provincia mal codificadas
 * como "provincia 00" (p. ej. Bagua aparece como 01-00-00 en vez de 01-02-00).
 * Si las tratáramos como departamento sobrescribiríamos el nombre real y
 * perderíamos toda una provincia con sus distritos. Las apartamos y luego las
 * reasignamos a los códigos de provincia que quedaron huérfanos.
 */
const huerfanas = [];

for (const row of raw) {
  const dep = String(row.departamento).padStart(2, "0");
  const prov = String(row.provincia).padStart(2, "0");
  const dist = String(row.distrito).padStart(2, "0");
  const nombre = String(row.nombre).trim();

  if (prov === "00" && dist === "00") {
    if (departamentos.has(dep)) huerfanas.push({ dep, nombre });
    else departamentos.set(dep, nombre);
  } else if (dist === "00") {
    provincias.set(dep + prov, { nombre, dep });
  } else {
    distritos.push({ dep, prov, dist, nombre });
  }
}

// Reparación: códigos de provincia usados por distritos pero sin fila de cabecera.
const sinNombre = new Map(); // dep -> [codProv, ...]
for (const d of distritos) {
  const cod = d.dep + d.prov;
  if (provincias.has(cod)) continue;
  const lista = sinNombre.get(d.dep) ?? [];
  if (!lista.includes(cod)) lista.push(cod);
  sinNombre.set(d.dep, lista);
}
for (const [dep, codigos] of sinNombre) {
  const disponibles = huerfanas.filter((h) => h.dep === dep);
  codigos.sort();
  codigos.forEach((cod, i) => {
    const nombre = disponibles[i]?.nombre;
    if (nombre) {
      provincias.set(cod, { nombre, dep });
      console.warn(`  · provincia reparada: ${cod} -> ${nombre}`);
    } else {
      console.warn(`  · AVISO: la provincia ${cod} no tiene nombre en el dataset.`);
    }
  });
}

const catalogo = distritos
  .map((d) => {
    const depNombre = departamentos.get(d.dep);
    const provRef = provincias.get(d.dep + d.prov);
    if (!depNombre || !provRef) {
      console.warn(`  · AVISO: se descarta ${d.dep}${d.prov}${d.dist} (${d.nombre}) por falta de cabecera.`);
      return null;
    }
    return {
      ubigeo: d.dep + d.prov + d.dist,
      codDep: d.dep,
      codProv: d.dep + d.prov,
      departamento: depNombre,
      provincia: provRef.nombre,
      distrito: d.nombre,
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.ubigeo.localeCompare(b.ubigeo));

const index = {
  departamentos: [...departamentos.entries()]
    .map(([codigo, nombre]) => ({ codigo, nombre, key: norm(nombre) }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo)),
  provincias: [...provincias.entries()]
    .map(([codigo, v]) => ({ codigo, codDep: v.dep, nombre: v.nombre, key: norm(v.nombre) }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo)),
};

fs.writeFileSync(path.join(DATA, "ubigeo.json"), JSON.stringify(catalogo));
fs.writeFileSync(path.join(DATA, "ubigeo-index.json"), JSON.stringify(index));

console.log(
  `UBIGEO generado: ${index.departamentos.length} departamentos, ` +
    `${index.provincias.length} provincias, ${catalogo.length} distritos.`,
);
