#!/usr/bin/env node
/**
 * Borra las sesiones de envío caducadas.
 * Minimización de datos: no guardamos datos personales más de lo necesario.
 * Programar con cron: 0 3 * * *  node scripts/limpiar-sesiones.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const { count } = await prisma.sesionEnvio.deleteMany({ where: { expiraEn: { lt: new Date() } } });
console.log(`Sesiones de envío eliminadas: ${count}`);
await prisma.$disconnect();
