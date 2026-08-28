import {
  remoteOkConnector,
  weWorkRemotelyConnector,
  runConnectorPipeline,
  type ExistingOpportunityRef,
} from "@ai-sales-agent/connectors";
import type { PlatformPolicyInput } from "@ai-sales-agent/policy-engine";
import type { FastifyInstance } from "fastify";
import { NotFoundError } from "../plugins/error-handler.js";
import { deriveAutomationPermission } from "../lib/automation-permission.js";
import { toJsonSafe } from "../lib/json-safe.js";

/** Poll-based connectors this endpoint knows how to run. own_website is
 *  deliberately absent — it's push-based, see routes/intake.ts instead. */
const CONNECTORS_BY_PLATFORM_KEY = {
  remoteok: remoteOkConnector,
  we_work_remotely: weWorkRemotelyConnector,
} as const;

export default async function connectorRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { platformKey: string } }>(
    "/connectors/:platformKey/run",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { platformKey } = request.params;
      const connector =
        CONNECTORS_BY_PLATFORM_KEY[platformKey as keyof typeof CONNECTORS_BY_PLATFORM_KEY];

      if (!connector) {
        return reply.status(400).send({
          success: false,
          error: {
            message: `No connector available for platform key "${platformKey}". Available: ${Object.keys(CONNECTORS_BY_PLATFORM_KEY).join(", ")}.`,
            code: "NO_CONNECTOR",
          },
        });
      }

      const platform = await app.prisma.platform.findUnique({ where: { key: platformKey } });
      if (!platform) {
        throw new NotFoundError("Platform", platformKey);
      }

      const platformInput: PlatformPolicyInput = {
        key: platform.key,
        name: platform.name,
        isEnabled: platform.isEnabled,
        discoveryAllowed: platform.discoveryAllowed,
        automationAllowed: platform.automationAllowed,
        autoMessageAllowed: platform.autoMessageAllowed,
        autoCommentAllowed: platform.autoCommentAllowed,
      };

      const [existingForPlatform, existingElsewhere] = await Promise.all([
        app.prisma.opportunity.findMany({
          where: { sourcePlatformId: platform.id },
          select: { externalId: true },
        }),
        app.prisma.opportunity.findMany({
          where: { sourcePlatformId: { not: platform.id } },
          select: { id: true, title: true },
          // Cap this — cross-platform fuzzy matching against the entire
          // history doesn't scale forever. Recent opportunities are the
          // ones actually likely to be live duplicates of a fresh scrape.
          orderBy: { discoveredAt: "desc" },
          take: 500,
        }),
      ]);

      const result = await runConnectorPipeline(connector, {
        platform: platformInput,
        existingExternalIds: new Set(
          existingForPlatform.map((o: { externalId: string }) => o.externalId),
        ),
        existingOpportunities: existingElsewhere as ExistingOpportunityRef[],
      });

      if (!result.policyAllowed) {
        return { success: true, data: { ...result, createdOpportunityIds: [] } };
      }

      const automationPermission = deriveAutomationPermission(platform);

      const created = await app.prisma.$transaction([
        ...result.newOpportunities.map((opp) =>
          app.prisma.opportunity.create({
            data: {
              sourcePlatformId: platform.id,
              externalId: opp.externalId,
              sourceUrl: opp.sourceUrl,
              title: opp.title,
              description: opp.description,
              country: opp.country,
              language: opp.language,
              authorName: opp.authorName,
              authorMetadata: opp.authorMetadata ? toJsonSafe(opp.authorMetadata) : undefined,
              budgetMin: opp.budgetMin,
              budgetMax: opp.budgetMax,
              currency: opp.currency,
              projectType: opp.projectType,
              skillsDetected: opp.skillsDetected ? toJsonSafe(opp.skillsDetected) : undefined,
              automationPermission,
              sourceCreatedAt: opp.sourceCreatedAt,
              status: "DISCOVERED",
            },
            select: { id: true },
          }),
        ),
        app.prisma.activityLog.create({
          data: {
            actor: "SYSTEM",
            action: "connector.run",
            entityType: "Platform",
            entityId: platform.id,
            details: toJsonSafe({
              fetchedCount: result.fetchedCount,
              normalizedCount: result.normalizedCount,
              invalidCount: result.invalidCount,
              exactDuplicateCount: result.exactDuplicateCount,
              createdCount: result.newOpportunities.length,
              likelyCrossPlatformDuplicateCount: result.likelyCrossPlatformDuplicates.length,
            }),
          },
        }),
      ]);

      const createdOpportunityIds = created
        .slice(0, -1) // drop the trailing activityLog.create result
        .map((c: { id: string }) => c.id);

      return {
        success: true,
        data: { ...result, createdOpportunityIds },
      };
    },
  );
}
