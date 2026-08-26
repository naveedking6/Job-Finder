import { portfolioItemInputSchema, portfolioItemUpdateSchema } from "@ai-sales-agent/shared";
import type { FastifyInstance } from "fastify";
import { NotFoundError } from "../plugins/error-handler.js";

export default async function portfolioRoutes(app: FastifyInstance): Promise<void> {
  // Read is public — a portfolio is meant to be shown to prospective
  // clients, potentially surfaced outside the authenticated dashboard
  // later (e.g. embedded in outreach messages).
  app.get("/portfolio", async (request) => {
    const { serviceCategory } = request.query as { serviceCategory?: string };
    const items = await app.prisma.portfolioItem.findMany({
      where: {
        isActive: true,
        ...(serviceCategory ? { serviceCategory } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return { success: true, data: items };
  });

  app.post(
    "/portfolio",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const body = portfolioItemInputSchema.parse(request.body);
      const item = await app.prisma.portfolioItem.create({ data: body });
      return reply.status(201).send({ success: true, data: item });
    },
  );

  app.put<{ Params: { id: string } }>(
    "/portfolio/:id",
    { preHandler: [app.authenticate] },
    async (request) => {
      const body = portfolioItemUpdateSchema.parse(request.body);

      const existing = await app.prisma.portfolioItem.findUnique({
        where: { id: request.params.id },
      });
      if (!existing) {
        throw new NotFoundError("Portfolio item", request.params.id);
      }

      const item = await app.prisma.portfolioItem.update({
        where: { id: request.params.id },
        data: body,
      });
      return { success: true, data: item };
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/portfolio/:id",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const existing = await app.prisma.portfolioItem.findUnique({
        where: { id: request.params.id },
      });
      if (!existing) {
        throw new NotFoundError("Portfolio item", request.params.id);
      }

      await app.prisma.portfolioItem.delete({ where: { id: request.params.id } });
      return reply.status(204).send();
    },
  );
}
