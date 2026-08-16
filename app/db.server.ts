import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

/**
 * Cliente Prisma único. En desarrollo Remix recarga el módulo en cada cambio,
 * así que lo guardamos en globalThis para no abrir un pool nuevo cada vez.
 */
const prisma = global.prismaGlobal ?? new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

if (process.env.NODE_ENV !== "production") global.prismaGlobal = prisma;

export default prisma;
