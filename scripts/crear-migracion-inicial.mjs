#!/usr/bin/env node
/**
 * Genera la migración inicial SIN necesitar una base de datos.
 *
 * `prisma migrate dev` exige conectarse a un Postgres real. Pero
 * `prisma migrate diff` compara "nada" contra el esquema y escupe el SQL sin
 * tocar ningún servidor. Es lo que necesitamos para desplegar en Render, donde
 * la base se crea por primera vez durante el propio despliegue.
 *
 * Uso:  npm run db:migracion-inicial
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const carpetaMigraciones = path.join(raiz, "prisma", "migrations");

/**
 * Llama a la CLI de Prisma.
 *
 * No usamos `npx`: desde Node 20.12 / 22, Windows bloquea lanzar archivos .cmd
 * con execFile (corrección de la vulnerabilidad BatBadBut) y falla con EINVAL.
 * Ejecutamos el JavaScript de Prisma con el mismo Node que corre este script.
 */
function ejecutarPrisma(argumentos) {
  const cliLocal = path.join(raiz, "node_modules", "prisma", "build", "index.js");

  /**
   * Prisma valida la sintaxis de las cadenas de conexión al leer el esquema,
   * aunque `migrate diff --from-empty --to-schema-datamodel` no se conecte a
   * ninguna base. Si el .env todavía tiene marcadores de relleno, falla con
   * P1013. Le pasamos cadenas ficticias pero válidas: nadie las va a usar,
   * solo tienen que superar el análisis sintáctico.
   */
  const FICTICIA = "postgresql://usuario:clave@localhost:5432/plantilla?schema=public";
  const entorno = {
    ...process.env,
    DATABASE_URL: FICTICIA,
    DIRECT_URL: FICTICIA,
  };

  if (fs.existsSync(cliLocal)) {
    return execFileSync(process.execPath, [cliLocal, ...argumentos], {
      cwd: raiz,
      env: entorno,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
  }

  return execFileSync("npx", ["prisma", ...argumentos], {
    cwd: raiz,
    env: entorno,
    encoding: "utf8",
    shell: process.platform === "win32",
    maxBuffer: 20 * 1024 * 1024,
  });
}

/** Una migración solo cuenta si tiene su migration.sql. Las carpetas sueltas
 *  son restos de un intento fallido y se pueden reutilizar. */
function revisarMigraciones() {
  if (!fs.existsSync(carpetaMigraciones)) return { completas: [], huerfanas: [] };

  const carpetas = fs
    .readdirSync(carpetaMigraciones, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{14}_/.test(d.name))
    .map((d) => d.name);

  const completas = carpetas.filter((c) =>
    fs.existsSync(path.join(carpetaMigraciones, c, "migration.sql")),
  );
  return { completas, huerfanas: carpetas.filter((c) => !completas.includes(c)) };
}

const { completas, huerfanas } = revisarMigraciones();

if (completas.length) {
  console.error(
    `Ya existe la migración inicial (${completas.join(", ")}).\n` +
      "Este script solo crea la primera. Para cambios posteriores usa:\n" +
      "  npx prisma migrate dev --name lo-que-cambiaste",
  );
  process.exit(1);
}

// --- Primero el SQL, después el disco -------------------------------------
// Si Prisma falla, no queremos dejar carpetas a medias que luego bloqueen
// el siguiente intento (que es exactamente lo que pasaba antes).
console.log("Generando el SQL a partir del esquema…");

let sql;
try {
  sql = ejecutarPrisma([
    "migrate",
    "diff",
    "--from-empty",
    "--to-schema-datamodel",
    "prisma/schema.prisma",
    "--script",
  ]);
} catch (e) {
  console.error("No se pudo ejecutar Prisma:", e.message);
  console.error("Si el error es P1013, revisa la sintaxis de prisma/schema.prisma.");
  process.exit(1);
}

if (!sql.trim() || !/CREATE TABLE/i.test(sql)) {
  console.error("El SQL generado no contiene ninguna tabla. Revisa prisma/schema.prisma.");
  process.exit(1);
}

// --- Ahora sí, escribimos --------------------------------------------------
let nombre = huerfanas[0];
if (nombre) {
  console.log(`Reutilizando la carpeta vacía de un intento anterior: ${nombre}`);
} else {
  const ahora = new Date();
  nombre =
    ahora.getUTCFullYear().toString() +
    String(ahora.getUTCMonth() + 1).padStart(2, "0") +
    String(ahora.getUTCDate()).padStart(2, "0") +
    String(ahora.getUTCHours()).padStart(2, "0") +
    String(ahora.getUTCMinutes()).padStart(2, "0") +
    String(ahora.getUTCSeconds()).padStart(2, "0") +
    "_inicial";
}

const destino = path.join(carpetaMigraciones, nombre);
fs.mkdirSync(destino, { recursive: true });

// Escribimos con Node y no con `>` de PowerShell: PowerShell 5 guarda en UTF-16
// y Prisma no puede leer ese archivo.
fs.writeFileSync(path.join(destino, "migration.sql"), sql, "utf8");
fs.writeFileSync(
  path.join(carpetaMigraciones, "migration_lock.toml"),
  '# Este archivo lo gestiona Prisma. No lo edites a mano.\n\nprovider = "postgresql"\n',
  "utf8",
);

const tablas = (sql.match(/CREATE TABLE/gi) ?? []).length;
const tipos = (sql.match(/CREATE TYPE/gi) ?? []).length;
const indices = (sql.match(/CREATE (UNIQUE )?INDEX/gi) ?? []).length;

console.log(`\nMigración creada: prisma/migrations/${nombre}/migration.sql`);
console.log(`  ${tablas} tablas · ${tipos} tipos enum · ${indices} índices`);
console.log("\nRevísala, súbela al repositorio y Render podrá desplegar.");
