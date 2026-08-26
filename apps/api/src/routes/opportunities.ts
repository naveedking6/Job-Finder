import { buildPaginatedData, paginationQuerySchema } from "@ai-sales-agent/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { NotFoundError } from "../plugins/error-handler.js";

const listQuerySchema = paginationQuerySchema.extend({
  status: z.string().optional(),
  platformId: z.string().optional(),
});

export default async function opportunityRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/opportunities",
    { preHandler: [app.authenticate] },
    async (request) => {
      const query = listQuerySchema.parse(request.query);
      const where = {
        ...(query.status ? { status: query.status as never } : {}),
        ...(query.platformId ? { sourcePlatformId: query.platformId } : {}),
      };

      const [items, totalItems] = await Promise.all([
        app.prisma.opportunity.findMany({
          where,
          orderBy: { discoveredAt: "desc" },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          include: { sourcePlatform: { select: { key: true, name: true } } },
        }),
        app.prisma.opportunity.count({ where }),
      ]);

      return {
        success: true,
        data: buildPaginatedData(items, totalItems, query),
      };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/opportunities/:id",
    { preHandler: [app.authenticate] },
    async (request) => {
      const opportunity = await app.prisma.opportunity.findUnique({
        where: { id: request.params.id },
        include: {
          sourcePlatform: true,
          lead: true,
        },
      });

      if (!opportunity) {
        throw new NotFoundError("Opportunity", request.params.id);
      }

      return { success: true, data: opportunity };
    },
  );
}
