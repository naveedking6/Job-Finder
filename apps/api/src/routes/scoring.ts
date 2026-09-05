import {
  advanceStage,
  computeRuleBasedLeadScore,
  computeRuleBasedRiskScore,
  detectLeadSignals,
  detectRiskSignals,
  isLockedStage,
  shouldTriggerHandoff,
  DEFAULT_SETTINGS,
  type ConversationEvent,
  type ConversationMemoryData,
} from "@ai-sales-agent/shared";
import type { FastifyInstance } from "fastify";
import { NotFoundError } from "../plugins/error-handler.js";
import { getConfiguredAiProvider } from "../lib/ai-provider.js";
import { toJsonSafe } from "../lib/json-safe.js";
import { assembleHandoff } from "../lib/handoff.js";
import type { Message } from "@ai-sales-agent/database";

export default async function scoringRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>(
    "/leads/:id/score",
    { preHandler: [app.authenticate] },
    async (request) => {
      const lead = await app.prisma.lead.findUnique({
        where: { id: request.params.id },
        include: {
          opportunity: true,
          conversations: {
            orderBy: { lastMessageAt: "desc" },
            take: 1,
            include: { memory: true, messages: { orderBy: { sentAt: "desc" }, take: 10 } },
          },
        },
      });
      if (!lead) {
        throw new NotFoundError("Lead", request.params.id);
      }

      const primaryConversation = lead.conversations[0];
      const memory: ConversationMemoryData = primaryConversation?.memory
        ? {
            clientName: primaryConversation.memory.clientName,
            business: primaryConversation.memory.business,
            requirements: primaryConversation.memory.requirements as Record<string, unknown> | null,
            featuresDiscussed: primaryConversation.memory.featuresDiscussed as string[] | null,
            budgetDiscussed: primaryConversation.memory.budgetDiscussed,
            timelineDiscussed: primaryConversation.memory.timelineDiscussed,
            questionsAnswered: primaryConversation.memory.questionsAnswered as string[] | null,
            recommendedSolution: primaryConversation.memory.recommendedSolution,
            portfolioSharedIds: primaryConversation.memory.portfolioSharedIds as string[] | null,
          }
        : {};

      const recentMessages = primaryConversation?.messages ?? [];
      const clientMessageCount = recentMessages.filter((m: Message) => m.sender === "CLIENT").length;
      const recentMessagesText = recentMessages.map((m: Message) => m.content).join(" ");

      const leadSignals = detectLeadSignals(memory, clientMessageCount, recentMessagesText);
      const riskSignals = detectRiskSignals(memory, recentMessagesText);
      const ruleBasedLeadScore = computeRuleBasedLeadScore(leadSignals);
      const ruleBasedRiskScore = computeRuleBasedRiskScore(riskSignals);

      const conversationSummary =
        primaryConversation?.summary ?? lead.projectSummary ?? "No conversation summary available yet.";

      const provider = getConfiguredAiProvider();

      const [leadScoreResult, riskResult] = await Promise.all([
        provider.scoreLead({
          conversationSummary,
          signals: { ...leadSignals, ruleBasedLeadScore },
        }),
        provider.analyzeRisk({
          conversationSummary,
          clientMetadata: { ...riskSignals, ruleBasedRiskScore },
        }),
      ]);

      // The AI's score is the final answer (it has the fuller picture),
      // but never let it drift outside 0-100 regardless of what a model
      // returns — parseJsonResponse already enforces this at the schema
      // level, this is just defense in depth at the point of use.
      const finalLeadScore = Math.max(0, Math.min(100, leadScoreResult.score));
      const finalRiskScore = Math.max(0, Math.min(100, riskResult.score));

      // Fetch configured thresholds, falling back to safe defaults if
      // never explicitly set — same pattern as GET /settings.
      const [handoffThresholdSetting, reviewThresholdSetting] = await Promise.all([
        app.prisma.setting.findUnique({ where: { key: "LEAD_SCORE_HANDOFF_THRESHOLD" } }),
        app.prisma.setting.findUnique({ where: { key: "RISK_SCORE_REVIEW_THRESHOLD" } }),
      ]);
      const handoffThreshold =
        (handoffThresholdSetting?.value as number | undefined) ??
        DEFAULT_SETTINGS.LEAD_SCORE_HANDOFF_THRESHOLD;
      const reviewThreshold =
        (reviewThresholdSetting?.value as number | undefined) ??
        DEFAULT_SETTINGS.RISK_SCORE_REVIEW_THRESHOLD;

      // A hot lead score / risk threshold / explicit client signal is a
      // real state-machine event, not just a stored number — this is
      // the concrete tie-in between scoring (Round 7) and handoff
      // (this round). Superseding Round 7's HOT_LEAD-stage-only
      // behavior: reaching the same threshold now escalates all the way
      // to a human handoff, which is what the brief actually asks for.
      const handoffTrigger = shouldTriggerHandoff({
        leadScore: finalLeadScore,
        riskScore: finalRiskScore,
        leadScoreThreshold: handoffThreshold,
        riskScoreThreshold: reviewThreshold,
        requestsDirectContact: leadSignals.requestsDirectContact,
        mentionsReadyToStart: leadSignals.mentionsReadyToStart,
      });

      // Never re-trigger a handoff (or send another notification) for a
      // lead that's already locked into HUMAN_HANDOFF or another exit
      // stage — the brief is explicit: "I do not want notifications for
      // every lead." One notification per lead reaching handoff, not
      // one per scoring run.
      const alreadyLocked = isLockedStage(lead.stage);
      const isNewHandoff = handoffTrigger.shouldHandoff && !alreadyLocked;

      const events: ConversationEvent[] = [];
      if (isNewHandoff) events.push("HANDOFF_TRIGGERED");
      const newStage = events.reduce((stage, event) => advanceStage(stage, event), lead.stage);

      const flaggedForReview = finalRiskScore >= reviewThreshold;

      // Assembled BEFORE the transaction (read-only queries of its own)
      // so the notification can include the recommended next action and
      // WhatsApp link, not just a bare "handoff happened" message.
      const handoff = isNewHandoff
        ? await assembleHandoff(app, lead.id, handoffTrigger.reasons)
        : null;

      const [updatedLead] = await app.prisma.$transaction([
        app.prisma.lead.update({
          where: { id: lead.id },
          data: {
            leadScore: finalLeadScore,
            riskScore: finalRiskScore,
            stage: newStage,
            ...(isNewHandoff
              ? { handoffAt: new Date(), handoffReason: handoffTrigger.reasons.join(" ") }
              : {}),
          },
        }),
        app.prisma.leadScore.create({
          data: {
            leadId: lead.id,
            score: finalLeadScore,
            reason: leadScoreResult.reasoning,
            signals: toJsonSafe({ ...leadSignals, ruleBasedLeadScore, providerKey: provider.key }),
          },
        }),
        app.prisma.riskAssessment.create({
          data: {
            leadId: lead.id,
            score: finalRiskScore,
            signals: toJsonSafe(riskResult.signals),
            notes: riskResult.reasoning,
          },
        }),
        app.prisma.activityLog.create({
          data: {
            actor: "AI",
            action: "lead.scored",
            entityType: "Lead",
            entityId: lead.id,
            details: toJsonSafe({
              leadScore: finalLeadScore,
              riskScore: finalRiskScore,
              flaggedForReview,
              handoffTriggered: isNewHandoff,
              handoffReasons: handoffTrigger.reasons,
            }),
          },
        }),
        ...(isNewHandoff
          ? [
              app.prisma.notification.create({
                data: {
                  type: "LEAD_HANDOFF",
                  title: "Lead ready for human handoff",
                  body: `${handoffTrigger.reasons.join(" ")} Recommended action: ${handoff!.handoffPackage.recommendedNextAction}`,
                  relatedEntityType: "Lead",
                  relatedEntityId: lead.id,
                },
              }),
            ]
          : []),
      ]);

      return {
        success: true,
        data: {
          lead: updatedLead,
          leadScore: { score: finalLeadScore, reasoning: leadScoreResult.reasoning, ruleBasedScore: ruleBasedLeadScore },
          riskScore: { score: finalRiskScore, signals: riskResult.signals, reasoning: riskResult.reasoning, ruleBasedScore: ruleBasedRiskScore },
          flaggedForReview,
          stage: newStage,
          handoff: isNewHandoff ? handoff : null,
        },
      };
    },
  );
}
