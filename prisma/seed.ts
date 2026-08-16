/**
 * Carga el catálogo geográfico oficial (INEI) en la base de datos.
 *
 * Es un catálogo NACIONAL y compartido por todas las tiendas: se ejecuta una
 * vez al desplegar, no por comerciante. Las tarifas, que sí son de cada tienda,
 * se cargan desde el panel con el importador de CSV.
 */
import { PrismaClient } from "@prisma/client";
import catalogo from "../data/ubigeo.json";
import indice from "../data/ubigeo-index.json";

const prisma = new PrismaClient();

function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

async function main() {
  const departamentos = (indice as any).departamentos as Array<{ codigo: string; nombre: string }>;
  const provincias = (indice as any).provincias as Array<{ codigo: string; codDep: string; nombre: string }>;
  const distritos = catalogo as Array<{ ubigeo: string; codProv: string; codDep: string; distrito: string }>;

  console.log("Cargando departamentos…");
  await prisma.departamento.createMany({
    data: departamentos.map((d) => ({ codigo: d.codigo, nombre: d.nombre, clave: normalizar(d.nombre) })),
    skipDuplicates: true,
  });

  console.log("Cargando provincias…");
  await prisma.provincia.createMany({
    data: provincias.map((p) => ({ codigo: p.codigo, codDep: p.codDep, nombre: p.nombre, clave: normalizar(p.nombre) })),
    skipDuplicates: true,
  });

  console.log("Cargando distritos…");
  // En lotes: createMany con 1.874 filas de golpe funciona, pero por lotes es
  // más amable con la memoria si el dataset crece.
  const LOTE = 500;
  for (let i = 0; i < distritos.length; i += LOTE) {
    await prisma.distrito.createMany({
      data: distritos.slice(i, i + LOTE).map((d) => ({
        ubigeo: d.ubigeo,
        codProv: d.codProv,
        codDep: d.codDep,
        nombre: d.distrito,
        clave: normalizar(d.distrito),
      })),
      skipDuplicates: true,
    });
  }

  const [nd, np, ndist] = await Promise.all([
    prisma.departamento.count(),
    prisma.provincia.count(),
    prisma.distrito.count(),
  ]);
  console.log(`Listo: ${nd} departamentos, ${np} provincias, ${ndist} distritos.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
