import {
  advanceStage,
  computeRuleBasedLeadScore,
  computeRuleBasedRiskScore,
  detectLeadSignals,
  detectRiskSignals,
  DEFAULT_SETTINGS,
  type ConversationEvent,
  type ConversationMemoryData,
} from "@ai-sales-agent/shared";
import type { FastifyInstance } from "fastify";
import { NotFoundError } from "../plugins/error-handler.js";
import { getConfiguredAiProvider } from "../lib/ai-provider.js";
import { toJsonSafe } from "../lib/json-safe.js";
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

      // A hot lead score crossing the threshold is a real state-machine
      // event, not just a stored number — this is the concrete tie-in
      // between scoring (this round) and the conversation stage
      // progression (Round 6).
      const events: ConversationEvent[] = [];
      if (finalLeadScore >= handoffThreshold) events.push("HOT_LEAD_THRESHOLD");
      const newStage = events.reduce((stage, event) => advanceStage(stage, event), lead.stage);

      const flaggedForReview = finalRiskScore >= reviewThreshold;

      const [updatedLead] = await app.prisma.$transaction([
        app.prisma.lead.update({
          where: { id: lead.id },
          data: { leadScore: finalLeadScore, riskScore: finalRiskScore, stage: newStage },
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
              stageAdvanced: newStage !== lead.stage,
            }),
          },
        }),
      ]);

      return {
        success: true,
        data: {
          lead: updatedLead,
          leadScore: { score: finalLeadScore, reasoning: leadScoreResult.reasoning, ruleBasedScore: ruleBasedLeadScore },
          riskScore: { score: finalRiskScore, signals: riskResult.signals, reasoning: riskResult.reasoning, ruleBasedScore: ruleBasedRiskScore },
          flaggedForReview,
          stage: newStage,
        },
      };
    },
  );
}
