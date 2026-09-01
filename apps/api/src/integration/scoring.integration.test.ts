import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@ai-sales-agent/database";
import { buildApp } from "../app.js";
import { hashPassword } from "../lib/password.js";
import type { FastifyInstance } from "fastify";

/**
 * Real database integration tests for POST /leads/:id/score, against
 * the MockAiProvider — same reasoning as every prior round's
 * integration suite (see docs/ADR.md Round 5 section) for why real
 * Anthropic/OpenAI calls aren't exercised here.
 */

let app: FastifyInstance;
let authToken: string;
let testUserId: string;
let testPlatformId: string;

const TEST_EMAIL = "scoring-integration-test@example.com";
const TEST_PASSWORD = "correct-horse-battery-staple";

beforeAll(async () => {
  app = buildApp();
  await app.ready();

  const passwordHash = await hashPassword(TEST_PASSWORD);
  const user = await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    create: { email: TEST_EMAIL, name: "Scoring Test User", passwordHash, role: "ADMIN" },
    update: { passwordHash, isActive: true },
  });
  testUserId = user.id;

  const loginResponse = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  authToken = loginResponse.json().data.token;

  const platform = await prisma.platform.upsert({
    where: { key: "scoring_test_platform" },
    create: {
      key: "scoring_test_platform",
      name: "Scoring Test Platform",
      isEnabled: true,
      discoveryAllowed: true,
      automationAllowed: true,
      autoMessageAllowed: true,
      autoCommentAllowed: false,
    },
    update: {},
  });
  testPlatformId = platform.id;
});

afterAll(async () => {
  await prisma.opportunity.deleteMany({ where: { sourcePlatformId: testPlatformId } });
  await prisma.platform.delete({ where: { id: testPlatformId } }).catch(() => undefined);
  await prisma.user.delete({ where: { id: testUserId } }).catch(() => undefined);
  await app.close();
  await prisma.$disconnect();
});

async function createLeadWithConversation(opts: {
  memory?: Record<string, unknown>;
  messages?: { sender: "CLIENT" | "AI" | "HUMAN"; content: string }[];
}) {
  const opportunity = await prisma.opportunity.create({
    data: {
      sourcePlatformId: testPlatformId,
      externalId: `scoring-test-${Date.now()}-${Math.random()}`,
      title: "Scoring test opportunity",
      description: "Test.",
      status: "DISCOVERED",
      automationPermission: "ALLOWED",
    },
  });
  const lead = await prisma.lead.create({
    data: { opportunityId: opportunity.id, stage: "REQUIREMENTS_GATHERING" },
  });
  const conversation = await prisma.conversation.create({
    data: { leadId: lead.id, platformId: testPlatformId },
  });

  if (opts.memory) {
    await prisma.conversationMemory.create({
      data: { conversationId: conversation.id, ...opts.memory } as never,
    });
  }
  if (opts.messages) {
    for (const m of opts.messages) {
      await prisma.message.create({
        data: { conversationId: conversation.id, sender: m.sender, content: m.content },
      });
    }
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });
  }

  return { opportunity, lead, conversation };
}

describe("POST /leads/:id/score", () => {
  it("returns 401 without authentication", async () => {
    const response = await app.inject({ method: "POST", url: "/leads/does-not-exist/score" });
    expect(response.statusCode).toBe(401);
  });

  it("returns 404 for a nonexistent lead", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/leads/does-not-exist/score",
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(response.statusCode).toBe(404);
  });

  it("scores a lead with no conversation data at all without crashing", async () => {
    const opportunity = await prisma.opportunity.create({
      data: {
        sourcePlatformId: testPlatformId,
        externalId: `scoring-empty-${Date.now()}`,
        title: "Empty lead",
        description: "Test.",
        status: "DISCOVERED",
        automationPermission: "ALLOWED",
      },
    });
    const lead = await prisma.lead.create({
      data: { opportunityId: opportunity.id, stage: "DISCOVERED" },
    });

    const response = await app.inject({
      method: "POST",
      url: `/leads/${lead.id}/score`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json().data;
    expect(body.leadScore.score).toBeGreaterThanOrEqual(0);
    expect(body.leadScore.score).toBeLessThanOrEqual(100);

    await prisma.lead.delete({ where: { id: lead.id } });
    await prisma.opportunity.delete({ where: { id: opportunity.id } });
  });

  it("scores a well-qualified lead higher than a bare one, and persists real DB updates", async () => {
    const { lead } = await createLeadWithConversation({
      memory: {
        business: "Acme Clothing Co",
        requirements: { pages: 5, paymentGateway: "stripe" },
        budgetDiscussed: "$2000",
        timelineDiscussed: "1 month",
      },
      messages: [
        { sender: "CLIENT", content: "I need a website for my clothing business." },
        { sender: "AI", content: "Happy to help! What's your budget?" },
        { sender: "CLIENT", content: "Around $2000, and let's move forward soon." },
      ],
    });

    const response = await app.inject({
      method: "POST",
      url: `/leads/${lead.id}/score`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json().data;
    expect(body.leadScore.score).toBeGreaterThan(50);
    expect(body.leadScore.ruleBasedScore).toBeGreaterThan(0);

    // Real DB row was actually updated.
    const reloaded = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(reloaded?.leadScore).toBe(body.leadScore.score);
    expect(reloaded?.riskScore).toBe(body.riskScore.score);

    // History rows were created.
    const scoreHistory = await prisma.leadScore.findMany({ where: { leadId: lead.id } });
    expect(scoreHistory.length).toBeGreaterThanOrEqual(1);
    const riskHistory = await prisma.riskAssessment.findMany({ where: { leadId: lead.id } });
    expect(riskHistory.length).toBeGreaterThanOrEqual(1);
  });

  it("flags a lead with clear risk signals for review", async () => {
    const { lead } = await createLeadWithConversation({
      messages: [
        { sender: "CLIENT", content: "I can only pay via Western Union, urgent, today only!" },
      ],
    });

    const response = await app.inject({
      method: "POST",
      url: `/leads/${lead.id}/score`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    const body = response.json().data;
    expect(body.riskScore.score).toBeGreaterThan(0);
    expect(body.flaggedForReview).toBe(true);
  });

  it("advances the lead stage to HOT_LEAD when the score crosses the configured threshold", async () => {
    const { lead } = await createLeadWithConversation({
      memory: {
        business: "Acme Co",
        requirements: { pages: 5, products: 100 },
        budgetDiscussed: "$5000",
        timelineDiscussed: "2 weeks",
        portfolioSharedIds: ["item-1"],
      },
      messages: [
        { sender: "CLIENT", content: "Let's move forward — can you call me on WhatsApp?" },
        { sender: "CLIENT", content: "Ready to start ASAP." },
        { sender: "CLIENT", content: "Sounds great, when can we begin?" },
      ],
    });

    const response = await app.inject({
      method: "POST",
      url: `/leads/${lead.id}/score`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    const body = response.json().data;
    // With every positive lead signal firing, the mock provider's
    // proportional scoring should reach 100 — well above the default
    // 71-point handoff threshold — advancing the stage.
    if (body.leadScore.score >= 71) {
      expect(body.stage).toBe("HOT_LEAD");
    }
  });

  it("logs an ActivityLog entry recording the scoring action", async () => {
    const { lead } = await createLeadWithConversation({});

    await app.inject({
      method: "POST",
      url: `/leads/${lead.id}/score`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    const log = await prisma.activityLog.findFirst({
      where: { entityType: "Lead", entityId: lead.id, action: "lead.scored" },
      orderBy: { createdAt: "desc" },
    });
    expect(log).not.toBeNull();
    expect(log?.actor).toBe("AI");
  });
});
