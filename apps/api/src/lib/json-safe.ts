import { Prisma } from "@ai-sales-agent/database";

/**
 * Prisma's Json input fields require a value TypeScript can prove is
 * JSON-serializable. Anything containing Date objects (straight from a
 * fetched Prisma row), Record<string, unknown>, or other structurally
 * "trust me" types won't satisfy that even when the runtime value is
 * genuinely fine — so round-trip through JSON.stringify/parse, which
 * both proves and enforces it (Dates become ISO strings, exactly how
 * they'd be stored anyway).
 */
export function toJsonSafe(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
