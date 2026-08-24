import { PrismaClient } from "@prisma/client";

/**
 * Singleton Prisma client. Reused across the API process instead of
 * instantiating a new client per request, which would exhaust Postgres
 * connections quickly on a free-tier connection pool.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";
