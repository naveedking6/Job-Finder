import type { FastifyInstance } from "fastify";

async function setAutomationEnabled(app: FastifyInstance, enabled: boolean): Promise<void> {
  await app.prisma.$transaction([
    app.prisma.setting.upsert({
      where: { key: "AUTOMATION_ENABLED" },
      create: { key: "AUTOMATION_ENABLED", value: enabled },
      update: { value: enabled },
    }),
    app.prisma.activityLog.create({
      data: {
        actor: "HUMAN",
        action: enabled ? "automation.start" : "automation.stop",
        entityType: "Setting",
        entityId: "AUTOMATION_ENABLED",
        details: { enabled },
      },
    }),
  ]);
}

export default async function automationRoutes(app: FastifyInstance): Promise<void> {
  // This is the brief's "Emergency Stop" mechanism: a single flag, gated
  // behind auth, that every automated action (once connectors/AI-core
  // exist in later rounds) must check before doing anything outbound.
  app.post("/automation/start", { preHandler: [app.authenticate] }, async () => {
    await setAutomationEnabled(app, true);
    return { success: true, data: { automationEnabled: true } };
  });

  app.post("/automation/stop", { preHandler: [app.authenticate] }, async () => {
    await setAutomationEnabled(app, false);
    return { success: true, data: { automationEnabled: false } };
  });
}
