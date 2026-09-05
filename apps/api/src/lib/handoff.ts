import {
  buildHandoffPackage,
  buildWhatsAppHandoffLink,
  DEFAULT_SETTINGS,
  type HandoffPackage,
} from "@ai-sales-agent/shared";
import type { FastifyInstance } from "fastify";
import { NotFoundError } from "../plugins/error-handler.js";

export interface AssembledHandoff {
  handoffPackage: HandoffPackage;
  whatsAppLink: string | null;
}

/**
 * Fetches everything buildHandoffPackage (pure, packages/shared) needs
 * and calls it — the one place real Lead/Opportunity/Platform/Client
 * data gets mapped onto the brief's required handoff fields. Used by
 * both GET /leads/:id/handoff-package (a human pulling up the package
 * on demand) and the automatic trigger inside routes/scoring.ts.
 */
export async function assembleHandoff(
  app: FastifyInstance,
  leadId: string,
  handoffReasons: string[],
): Promise<AssembledHandoff> {
  const lead = await app.prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      opportunity: { include: { sourcePlatform: true } },
      client: true,
      conversations: {
        orderBy: { lastMessageAt: "desc" },
        take: 1,
        include: { memory: true },
      },
    },
  });
  if (!lead) {
    throw new NotFoundError("Lead", leadId);
  }

  const primaryConversation = lead.conversations[0];
  const memory = primaryConversation?.memory;
  const authorMetadata = lead.opportunity.authorMetadata as Record<string, unknown> | null;

  const handoffPackage = buildHandoffPackage({
    clientName: memory?.clientName ?? lead.client?.name ?? lead.opportunity.authorName ?? null,
    platformName: lead.opportunity.sourcePlatform.name,
    country: lead.opportunity.country,
    projectSummary: lead.projectSummary ?? lead.opportunity.description,
    requirements: (memory?.requirements as Record<string, unknown> | null) ?? (lead.requirements as Record<string, unknown> | null),
    budget: memory?.budgetDiscussed ?? lead.budget,
    timeline: memory?.timelineDiscussed ?? lead.timeline,
    leadScore: lead.leadScore,
    riskScore: lead.riskScore,
    conversationSummary: primaryConversation?.summary ?? null,
    handoffReasons,
    contactEmail: lead.client?.email ?? (authorMetadata?.email as string | undefined) ?? null,
    contactPhone: lead.client?.phone ?? null,
  });

  // The WhatsApp link is for the OPERATOR's number (so a client reviewing
  // the handoff package can tap through to continue on WhatsApp), read
  // from settings — never fabricated, and only built if a real number
  // has actually been configured.
  const [whatsappSetting, operatorNameSetting] = await Promise.all([
    app.prisma.setting.findUnique({ where: { key: "WHATSAPP_BUSINESS_NUMBER" } }),
    app.prisma.setting.findUnique({ where: { key: "OPERATOR_NAME" } }),
  ]);
  const whatsappNumber =
    (whatsappSetting?.value as string | undefined) ?? DEFAULT_SETTINGS.WHATSAPP_BUSINESS_NUMBER;
  const operatorName =
    (operatorNameSetting?.value as string | undefined) ?? DEFAULT_SETTINGS.OPERATOR_NAME;

  // The seeded placeholder number (+10000000000) is never a real
  // contact — don't generate a misleading link from an unconfigured
  // default.
  const whatsAppLink =
    whatsappNumber === DEFAULT_SETTINGS.WHATSAPP_BUSINESS_NUMBER
      ? null
      : buildWhatsAppHandoffLink({
          phoneNumber: whatsappNumber,
          operatorName,
          projectLabel: lead.opportunity.title,
        });

  return { handoffPackage, whatsAppLink };
}
