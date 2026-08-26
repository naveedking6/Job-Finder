import { Prisma } from "@ai-sales-agent/database";
import { platformUpdateSchema } from "@ai-sales-agent/shared";
import type { FastifyInstance } from "fastify";
import { NotFoundError } from "../plugins/error-handler.js";

/**
 * Prisma's Json fields require plain JSON-serializable values —
 * Date objects, Decimal, etc. from a fetched row aren't directly
 * assignable. Round-tripping through JSON.stringify/parse converts
 * Dates to ISO strings the same way the database will store them.
 */
function toJsonSafe(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export default async function platformRoutes(app: FastifyInstance): Promise<void> {
  app.get("/platforms", { preHandler: [app.authenticate] }, async () => {
    const platforms = await app.prisma.platform.findMany({ orderBy: { name: "asc" } });
    return { success: true, data: platforms };
  });

  app.put<{ Params: { id: string } }>(
    "/platforms/:id",
    { preHandler: [app.authenticate] },
    async (request) => {
      const body = platformUpdateSchema.parse(request.body);

      const existing = await app.prisma.platform.findUnique({
        where: { id: request.params.id },
      });
      if (!existing) {
        throw new NotFoundError("Platform", request.params.id);
      }

      const [platform] = await app.prisma.$transaction([
        app.prisma.platform.update({ where: { id: request.params.id }, data: body }),
        app.prisma.activityLog.create({
          data: {
            actor: "HUMAN",
            action: "platform.policy_updated",
            entityType: "Platform",
            entityId: request.params.id,
            details: { changes: toJsonSafe(body), previousState: toJsonSafe(existing) },
          },
        }),
      ]);

      return { success: true, data: platform };
    },
  );
}
