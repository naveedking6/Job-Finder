import { buildPaginatedData, leadHandoffSchema, paginationQuerySchema } from "@ai-sales-agent/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { NotFoundError } from "../plugins/error-handler.js";

const listQuerySchema = paginationQuerySchema.extend({
  stage: z.string().optional(),
});

export default async function leadRoutes(app: FastifyInstance): Promise<void> {
  app.get("/leads", { preHandler: [app.authenticate] }, async (request) => {
    const query = listQuerySchema.parse(request.query);
    const where = query.stage ? { stage: query.stage as never } : {};

    const [items, totalItems] = await Promise.all([
      app.prisma.lead.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          opportunity: { select: { title: true, sourceUrl: true } },
          client: true,
        },
      }),
      app.prisma.lead.count({ where }),
    ]);

    return { success: true, data: buildPaginatedData(items, totalItems, query) };
  });

  app.get<{ Params: { id: string } }>(
    "/leads/:id",
    { preHandler: [app.authenticate] },
    async (request) => {
      const lead = await app.prisma.lead.findUnique({
        where: { id: request.params.id },
        include: {
          opportunity: true,
          client: true,
          conversations: { include: { messages: { orderBy: { sentAt: "asc" } } } },
          leadScores: { orderBy: { scoredAt: "desc" }, take: 10 },
          riskAssessments: { orderBy: { assessedAt: "desc" }, take: 10 },
        },
      });

      if (!lead) {
        throw new NotFoundError("Lead", request.params.id);
      }

      return { success: true, data: lead };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/leads/:id/handoff",
    { preHandler: [app.authenticate] },
    async (request) => {
      const body = leadHandoffSchema.parse(request.body);

      const lead = await app.prisma.lead.findUnique({ where: { id: request.params.id } });
      if (!lead) {
        throw new NotFoundError("Lead", request.params.id);
      }

      const [updatedLead] = await app.prisma.$transaction([
        app.prisma.lead.update({
          where: { id: request.params.id },
          data: {
            stage: "HUMAN_HANDOFF",
            handoffAt: new Date(),
            handoffReason: body.reason,
          },
        }),
        app.prisma.activityLog.create({
          data: {
            actor: "HUMAN",
            action: "lead.handoff",
            entityType: "Lead",
            entityId: request.params.id,
            details: { reason: body.reason },
          },
        }),
        app.prisma.notification.create({
          data: {
            type: "LEAD_HANDOFF",
            title: "Lead handed off for review",
            body: body.reason,
            relatedEntityType: "Lead",
            relatedEntityId: request.params.id,
          },
        }),
      ]);

      return { success: true, data: updatedLead };
    },
  );
}
