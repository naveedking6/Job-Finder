import { buildPaginatedData, paginationQuerySchema } from "@ai-sales-agent/shared";
import type { FastifyInstance } from "fastify";
import { NotFoundError } from "../plugins/error-handler.js";

export default async function conversationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/conversations", { preHandler: [app.authenticate] }, async (request) => {
    const query = paginationQuerySchema.parse(request.query);

    const [items, totalItems] = await Promise.all([
      app.prisma.conversation.findMany({
        orderBy: { lastMessageAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          lead: { select: { id: true, stage: true } },
          platform: { select: { key: true, name: true } },
        },
      }),
      app.prisma.conversation.count(),
    ]);

    return { success: true, data: buildPaginatedData(items, totalItems, query) };
  });

  app.get<{ Params: { id: string } }>(
    "/conversations/:id",
    { preHandler: [app.authenticate] },
    async (request) => {
      const conversation = await app.prisma.conversation.findUnique({
        where: { id: request.params.id },
        include: {
          lead: true,
          platform: true,
          memory: true,
        },
      });

      if (!conversation) {
        throw new NotFoundError("Conversation", request.params.id);
      }

      return { success: true, data: conversation };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/conversations/:id/messages",
    { preHandler: [app.authenticate] },
    async (request) => {
      const conversation = await app.prisma.conversation.findUnique({
        where: { id: request.params.id },
        select: { id: true },
      });
      if (!conversation) {
        throw new NotFoundError("Conversation", request.params.id);
      }

      const messages = await app.prisma.message.findMany({
        where: { conversationId: request.params.id },
        orderBy: { sentAt: "asc" },
      });

      return { success: true, data: messages };
    },
  );
}
