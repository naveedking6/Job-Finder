import type { FastifyInstance } from "fastify";

export default async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/analytics", { preHandler: [app.authenticate] }, async () => {
    const [
      totalOpportunities,
      totalLeads,
      hotLeads,
      activeConversations,
      highRiskLeads,
      automationSetting,
    ] = await Promise.all([
      app.prisma.opportunity.count(),
      app.prisma.lead.count(),
      app.prisma.lead.count({ where: { stage: "HOT_LEAD" } }),
      app.prisma.conversation.count({ where: { status: "ACTIVE" } }),
      app.prisma.lead.count({ where: { riskScore: { gte: 61 } } }),
      app.prisma.setting.findUnique({ where: { key: "AUTOMATION_ENABLED" } }),
    ]);

    return {
      success: true,
      data: {
        totalOpportunities,
        totalLeads,
        hotLeads,
        activeConversations,
        highRiskLeads,
        automationEnabled: (automationSetting?.value as boolean | undefined) ?? false,
      },
    };
  });
}
