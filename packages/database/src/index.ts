import { PrismaClient } from "@prisma/client";
import { normalizeSqliteDatabaseUrl } from "./sqlite-url";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createClient() {
  normalizeSqliteDatabaseUrl();
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient();
  }
  return globalForPrisma.prisma;
}

export async function resetPrismaClient() {
  if (globalForPrisma.prisma) {
    await globalForPrisma.prisma.$disconnect().catch(() => undefined);
  }
  globalForPrisma.prisma = createClient();
  return globalForPrisma.prisma;
}

/** Always resolves to the current client (survives resetPrismaClient). */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrisma();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export * from "@prisma/client";
export { normalizeSqliteDatabaseUrl, findMonorepoRootFromCwd } from "./sqlite-url";
