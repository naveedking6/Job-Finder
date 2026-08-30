import {
  advanceStage,
  mergeConversationMemory,
  type ConversationEvent,
  type ConversationMemoryData,
} from "@ai-sales-agent/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { NotFoundError } from "../plugins/error-handler.js";
import { getConfiguredAiProvider } from "../lib/ai-provider.js";
import { toJsonSafe } from "../lib/json-safe.js";
import type { Message } from "@ai-sales-agent/database";

const RECENT_MESSAGES_FOR_CONTEXT = 10;

const postMessageSchema = z.object({
  sender: z.enum(["CLIENT", "HUMAN"]),
  content: z.string().min(1),
});

export default async function conversationMessageRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>(
    "/conversations/:id/messages",
    { preHandler: [app.authenticate] },
    async (request) => {
      const body = postMessageSchema.parse(request.body);

      const conversation = await app.prisma.conversation.findUnique({
        where: { id: request.params.id },
        include: { memory: true, lead: true },
      });
      if (!conversation) {
        throw new NotFoundError("Conversation", request.params.id);
      }

      const incomingMessage = await app.prisma.message.create({
        data: {
          conversationId: conversation.id,
          sender: body.sender,
          content: body.content,
        },
      });

      // A human sending a message directly means they've taken over —
      // the AI does not also reply to its own operator. Persist and stop.
      if (body.sender === "HUMAN") {
        await app.prisma.conversation.update({
          where: { id: conversation.id },
          data: { status: "HUMAN_TAKEOVER", lastMessageAt: incomingMessage.sentAt },
        });
        return { success: true, data: { message: incomingMessage, aiReply: null } };
      }

      // --- sender === CLIENT: the real conversation-agent loop ---

      const provider = getConfiguredAiProvider();

      const extraction = await provider.extractRequirements({
        conversationText: body.content,
      });

      const existingMemory: ConversationMemoryData = conversation.memory
        ? {
            clientName: conversation.memory.clientName,
            business: conversation.memory.business,
            requirements: conversation.memory.requirements as Record<string, unknown> | null,
            featuresDiscussed: conversation.memory.featuresDiscussed as string[] | null,
            budgetDiscussed: conversation.memory.budgetDiscussed,
            timelineDiscussed: conversation.memory.timelineDiscussed,
            questionsAnswered: conversation.memory.questionsAnswered as string[] | null,
            recommendedSolution: conversation.memory.recommendedSolution,
            portfolioSharedIds: conversation.memory.portfolioSharedIds as string[] | null,
          }
        : {};

      const hadRequirementsBefore = Object.keys(existingMemory.requirements ?? {}).length > 0;

      const mergedMemory = mergeConversationMemory(existingMemory, {
        requirements: extraction.requirements,
        budgetDiscussed: extraction.budget,
        timelineDiscussed: extraction.timeline,
      });

      // Determine which state-machine events fired this turn, in order.
      // Stage lives on Lead, not Conversation — see schema.prisma;
      // Conversation only has a lifecycle `status` (ACTIVE/PAUSED/...),
      // while the CONVERSATION_STAGES progression is tracked per-lead.
      const events: ConversationEvent[] = ["CLIENT_REPLIED"];
      const gainedNewRequirements =
        Object.keys(extraction.requirements).length > 0 && !hadRequirementsBefore;
      if (gainedNewRequirements) events.push("REQUIREMENTS_CAPTURED");
      if (extraction.budget) events.push("BUDGET_DISCUSSED");
      if (extraction.timeline) events.push("TIMELINE_DISCUSSED");

      const newStage = events.reduce(
        (stage, event) => advanceStage(stage, event),
        conversation.lead.stage,
      );

      const recentMessages = await app.prisma.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { sentAt: "desc" },
        take: RECENT_MESSAGES_FOR_CONTEXT,
      });
      recentMessages.reverse();

      const aiResponse = await provider.generateResponse({
        conversationSummary: conversation.summary ?? undefined,
        recentMessages: recentMessages.map((m: Message) => ({ sender: m.sender, content: m.content })),
      });

      const aiMessage = await app.prisma.message.create({
        data: {
          conversationId: conversation.id,
          sender: "AI",
          content: aiResponse.response,
          metadata: toJsonSafe({ providerKey: provider.key }),
        },
      });

      // Refresh the rolling summary every turn. Documented trade-off (see
      // docs/ADR.md Round 6 section): this is an extra AI call per
      // message, simple and correct, at the cost of not being the
      // cheapest possible approach — refining to "every N messages" is
      // a reasonable later optimization once real usage volume exists.
      const allMessagesForSummary = await app.prisma.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { sentAt: "asc" },
      });
      const summaryResult = await provider.summarizeConversation({
        messages: allMessagesForSummary.map((m: Message) => ({ sender: m.sender, content: m.content })),
      });

      await app.prisma.$transaction([
        app.prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            summary: summaryResult.summary,
            lastMessageAt: aiMessage.sentAt,
          },
        }),
        app.prisma.conversationMemory.upsert({
          where: { conversationId: conversation.id },
          create: {
            conversationId: conversation.id,
            clientName: mergedMemory.clientName,
            business: mergedMemory.business,
            requirements: mergedMemory.requirements
              ? toJsonSafe(mergedMemory.requirements)
              : undefined,
            featuresDiscussed: mergedMemory.featuresDiscussed
              ? toJsonSafe(mergedMemory.featuresDiscussed)
              : undefined,
            budgetDiscussed: mergedMemory.budgetDiscussed,
            timelineDiscussed: mergedMemory.timelineDiscussed,
            questionsAnswered: mergedMemory.questionsAnswered
              ? toJsonSafe(mergedMemory.questionsAnswered)
              : undefined,
            recommendedSolution: mergedMemory.recommendedSolution,
            portfolioSharedIds: mergedMemory.portfolioSharedIds
              ? toJsonSafe(mergedMemory.portfolioSharedIds)
              : undefined,
          },
          update: {
            clientName: mergedMemory.clientName,
            business: mergedMemory.business,
            requirements: mergedMemory.requirements
              ? toJsonSafe(mergedMemory.requirements)
              : undefined,
            featuresDiscussed: mergedMemory.featuresDiscussed
              ? toJsonSafe(mergedMemory.featuresDiscussed)
              : undefined,
            budgetDiscussed: mergedMemory.budgetDiscussed,
            timelineDiscussed: mergedMemory.timelineDiscussed,
            questionsAnswered: mergedMemory.questionsAnswered
              ? toJsonSafe(mergedMemory.questionsAnswered)
              : undefined,
            recommendedSolution: mergedMemory.recommendedSolution,
            portfolioSharedIds: mergedMemory.portfolioSharedIds
              ? toJsonSafe(mergedMemory.portfolioSharedIds)
              : undefined,
          },
        }),
        app.prisma.lead.update({
          where: { id: conversation.lead.id },
          data: { stage: newStage },
        }),
      ]);

      return {
        success: true,
        data: {
          message: incomingMessage,
          aiReply: aiMessage,
          stage: newStage,
        },
      };
    },
  );
}
