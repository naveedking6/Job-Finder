import { selectRelevantPortfolioItems } from "@ai-sales-agent/ai-core";
import type { FastifyInstance } from "fastify";
import { NotFoundError } from "../plugins/error-handler.js";
import { getConfiguredAiProvider } from "../lib/ai-provider.js";
import { toJsonSafe } from "../lib/json-safe.js";

export default async function analysisRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>(
    "/opportunities/:id/analyze",
    { preHandler: [app.authenticate] },
    async (request) => {
      const opportunity = await app.prisma.opportunity.findUnique({
        where: { id: request.params.id },
      });
      if (!opportunity) {
        throw new NotFoundError("Opportunity", request.params.id);
      }

      const services = await app.prisma.service.findMany({
        where: { isActive: true },
        select: { name: true, slug: true },
      });

      const provider = getConfiguredAiProvider();

      const analysis = await provider.analyzeOpportunity({
        opportunity: {
          title: opportunity.title,
          description: opportunity.description,
          budgetMin: opportunity.budgetMin ? Number(opportunity.budgetMin) : undefined,
          budgetMax: opportunity.budgetMax ? Number(opportunity.budgetMax) : undefined,
          currency: opportunity.currency ?? undefined,
          skillsDetected: Array.isArray(opportunity.skillsDetected)
            ? (opportunity.skillsDetected as string[])
            : undefined,
        },
        services,
      });

      const portfolioItems = await app.prisma.portfolioItem.findMany({
        where: { isActive: true },
        select: { id: true, title: true, serviceCategory: true, createdAt: true },
      });
      const recommendedPortfolioItems = selectRelevantPortfolioItems(
        analysis.matchedServiceSlugs,
        portfolioItems,
      );

      const [updatedOpportunity] = await app.prisma.$transaction([
        app.prisma.opportunity.update({
          where: { id: opportunity.id },
          data: {
            relevanceScore: analysis.relevanceScore,
            status: "ANALYZED",
          },
        }),
        app.prisma.activityLog.create({
          data: {
            actor: "AI",
            action: "opportunity.analyzed",
            entityType: "Opportunity",
            entityId: opportunity.id,
            details: toJsonSafe({
              providerKey: provider.key,
              relevanceScore: analysis.relevanceScore,
              matchedServiceSlugs: analysis.matchedServiceSlugs,
              confidence: analysis.confidence,
              reasoning: analysis.reasoning,
              likelySerious: analysis.likelySerious,
              suggestedSolution: analysis.suggestedSolution,
            }),
          },
        }),
      ]);

      return {
        success: true,
        data: {
          opportunity: updatedOpportunity,
          analysis,
          recommendedPortfolioItems,
        },
      };
    },
  );
}
