import { evaluateCombinedPolicy, type PlatformPolicyInput, type PolicyAction } from "@ai-sales-agent/policy-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AutomationRule } from "@ai-sales-agent/database";
import { NotFoundError } from "../plugins/error-handler.js";

const policyCheckQuerySchema = z.object({
  action: z.enum(["DISCOVER", "AUTOMATE", "AUTO_MESSAGE", "AUTO_COMMENT"]),
});

/**
 * This is the real integration point between the policy engine and live
 * data — the actual connector framework doesn't exist yet (Round 4), so
 * for now this is exposed as a debug/dashboard-facing endpoint a human
 * (or the dashboard, once built) can use to answer "would automation be
 * allowed on this platform right now, and why/why not". Once connectors
 * exist, they call the exact same underlying logic
 * (evaluateCombinedPolicy) before taking any outbound action — this
 * route isn't a separate code path, it's a thin HTTP wrapper around it.
 */
export default async function policyRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>(
    "/platforms/:id/policy-check",
    { preHandler: [app.authenticate] },
    async (request) => {
      const query = policyCheckQuerySchema.parse(request.query);

      const platform = await app.prisma.platform.findUnique({
        where: { id: request.params.id },
      });
      if (!platform) {
        throw new NotFoundError("Platform", request.params.id);
      }

      const automationSetting = await app.prisma.setting.findUnique({
        where: { key: "AUTOMATION_ENABLED" },
      });
      const globalAutomationEnabled = (automationSetting?.value as boolean | undefined) ?? false;

      const rules = await app.prisma.automationRule.findMany({
        where: {
          isActive: true,
          OR: [{ platformId: platform.id }, { platformId: null }],
        },
      });

      // Approximation for this round: all rate/daily-style rules share a
      // single "since start of today" window. Per-rule custom windows
      // (e.g. a genuinely rolling 60-minute RATE_LIMIT distinct from a
      // calendar-day DAILY_LIMIT) are a refinement for when the connector
      // framework (Round 4) actually generates this traffic — right now
      // there IS no real outreach traffic yet, so this is a reasonable,
      // clearly-documented simplification rather than premature precision.
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const [actionsInWindow, lastAction] = await Promise.all([
        app.prisma.activityLog.count({
          where: {
            entityType: "Platform",
            entityId: platform.id,
            action: "automation.outreach_sent",
            createdAt: { gte: startOfToday },
          },
        }),
        app.prisma.activityLog.findFirst({
          where: {
            entityType: "Platform",
            entityId: platform.id,
            action: "automation.outreach_sent",
          },
          orderBy: { createdAt: "desc" },
        }),
      ]);

      const platformInput: PlatformPolicyInput = {
        key: platform.key,
        name: platform.name,
        isEnabled: platform.isEnabled,
        discoveryAllowed: platform.discoveryAllowed,
        automationAllowed: platform.automationAllowed,
        autoMessageAllowed: platform.autoMessageAllowed,
        autoCommentAllowed: platform.autoCommentAllowed,
      };

      const result = evaluateCombinedPolicy(
        platformInput,
        query.action as PolicyAction,
        globalAutomationEnabled,
        rules.map((r: AutomationRule) => ({ type: r.type, config: r.config })),
        { now: new Date(), actionsInWindow, lastActionAt: lastAction?.createdAt ?? null },
      );

      return { success: true, data: result };
    },
  );
}
