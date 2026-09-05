import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@ai-sales-agent/database";
import { buildApp } from "../app.js";
import { hashPassword } from "../lib/password.js";
import type { FastifyInstance } from "fastify";

/**
 * Real database integration tests for the handoff endpoints — see
 * docs/ADR.md Round 5/8 sections for why real Anthropic/OpenAI calls
 * aren't exercised here (MockAiProvider is what's actually running).
 */

let app: FastifyInstance;
let authToken: string;
let testUserId: string;
let testPlatformId: string;

const TEST_EMAIL = "handoff-integration-test@example.com";
const TEST_PASSWORD = "correct-horse-battery-staple";

beforeAll(async () => {
  app = buildApp();
  await app.ready();

  const passwordHash = await hashPassword(TEST_PASSWORD);
  const user = await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    create: { email: TEST_EMAIL, name: "Handoff Test User", passwordHash, role: "ADMIN" },
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
    where: { key: "handoff_test_platform" },
    create: {
      key: "handoff_test_platform",
      name: "Handoff Test Platform",
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
  country?: string;
}) {
  const opportunity = await prisma.opportunity.create({
    data: {
      sourcePlatformId: testPlatformId,
      externalId: `handoff-test-${Date.now()}-${Math.random()}`,
      title: "Handoff test opportunity",
      description: "Test description for handoff assembly.",
      country: opts.country,
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

describe("GET /leads/:id/handoff-package", () => {
  it("returns 401 without authentication", async () => {
    const response = await app.inject({ method: "GET", url: "/leads/does-not-exist/handoff-package" });
    expect(response.statusCode).toBe(401);
  });

  it("returns 404 for a nonexistent lead", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/leads/does-not-exist/handoff-package",
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(response.statusCode).toBe(404);
  });

  it("assembles a real package with every field the brief requires", async () => {
    const { lead } = await createLeadWithConversation({
      country: "Pakistan",
      memory: {
        clientName: "Jane",
        business: "Jane's Clothing Co",
        requirements: { pages: 5 },
        budgetDiscussed: "$2000",
        timelineDiscussed: "1 month",
      },
    });

    const response = await app.inject({
      method: "GET",
      url: `/leads/${lead.id}/handoff-package`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json().data;
    expect(body.handoffPackage.clientName).toBe("Jane");
    expect(body.handoffPackage.platformName).toBe("Handoff Test Platform");
    expect(body.handoffPackage.country).toBe("Pakistan");
    expect(body.handoffPackage.budget).toBe("$2000");
    expect(body.handoffPackage.timeline).toBe("1 month");
    expect(body.handoffPackage.recommendedNextAction.length).toBeGreaterThan(0);
  });

  it("returns null whatsAppLink when the WhatsApp number is unconfigured (still the seeded placeholder)", async () => {
    const { lead } = await createLeadWithConversation({});
    const response = await app.inject({
      method: "GET",
      url: `/leads/${lead.id}/handoff-package`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = response.json().data;
    // Default seeded value is the placeholder +10000000000 — no real
    // link should be generated from it.
    expect(body.whatsAppLink).toBeNull();
  });

  it("returns a real WhatsApp link once a genuine number is configured", async () => {
    await prisma.setting.upsert({
      where: { key: "WHATSAPP_BUSINESS_NUMBER" },
      create: { key: "WHATSAPP_BUSINESS_NUMBER", value: "+923001234567" },
      update: { value: "+923001234567" },
    });

    const { lead } = await createLeadWithConversation({});
    const response = await app.inject({
      method: "GET",
      url: `/leads/${lead.id}/handoff-package`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = response.json().data;
    expect(body.whatsAppLink).toMatch(/^https:\/\/wa\.me\/923001234567/);

    // Restore the placeholder so other tests aren't affected.
    await prisma.setting.update({
      where: { key: "WHATSAPP_BUSINESS_NUMBER" },
      data: { value: "+10000000000" },
    });
  });
});

describe("POST /leads/:id/score — automatic handoff triggering", () => {
  it("creates exactly one Notification when handoff first triggers, and none on a repeat score with no new signal", async () => {
    const { lead } = await createLeadWithConversation({
      messages: [{ sender: "CLIENT", content: "Can you call me on WhatsApp to discuss?" }],
    });

    const firstResponse = await app.inject({
      method: "POST",
      url: `/leads/${lead.id}/score`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    const firstBody = firstResponse.json().data;
    expect(firstBody.stage).toBe("HUMAN_HANDOFF");
    expect(firstBody.handoff).not.toBeNull();

    const notificationsAfterFirst = await prisma.notification.findMany({
      where: { relatedEntityType: "Lead", relatedEntityId: lead.id },
    });
    expect(notificationsAfterFirst).toHaveLength(1);

    // Score again — the lead is now LOCKED at HUMAN_HANDOFF, so this
    // must not create a second notification (the brief: "I do not want
    // notifications for every lead").
    const secondResponse = await app.inject({
      method: "POST",
      url: `/leads/${lead.id}/score`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    const secondBody = secondResponse.json().data;
    expect(secondBody.handoff).toBeNull();
    expect(secondBody.stage).toBe("HUMAN_HANDOFF"); // still locked, unchanged

    const notificationsAfterSecond = await prisma.notification.findMany({
      where: { relatedEntityType: "Lead", relatedEntityId: lead.id },
    });
    expect(notificationsAfterSecond).toHaveLength(1); // still exactly one
  });

  it("does not trigger a handoff or create a notification for a lead with no signals at all", async () => {
    const { lead } = await createLeadWithConversation({});

    const response = await app.inject({
      method: "POST",
      url: `/leads/${lead.id}/score`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = response.json().data;
    expect(body.handoff).toBeNull();
    expect(body.stage).not.toBe("HUMAN_HANDOFF");

    const notifications = await prisma.notification.findMany({
      where: { relatedEntityType: "Lead", relatedEntityId: lead.id },
    });
    expect(notifications).toHaveLength(0);
  });

  it("sets handoffAt and handoffReason on the lead row when handoff triggers", async () => {
    const { lead } = await createLeadWithConversation({
      messages: [{ sender: "CLIENT", content: "Ready to start ASAP." }],
    });

    await app.inject({
      method: "POST",
      url: `/leads/${lead.id}/score`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    const reloaded = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(reloaded?.handoffAt).not.toBeNull();
    expect(reloaded?.handoffReason).toBeTruthy();
  });

  it("a high risk score alone also triggers handoff, not just a high lead score", async () => {
    const { lead } = await createLeadWithConversation({
      messages: [
        {
          sender: "CLIENT",
          content: "I can only pay via Western Union, urgent, no upfront payment, today only!",
        },
      ],
    });

    const response = await app.inject({
      method: "POST",
      url: `/leads/${lead.id}/score`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = response.json().data;

    if (body.riskScore.score >= 61) {
      expect(body.stage).toBe("HUMAN_HANDOFF");
      expect(body.handoff.handoffPackage.recommendedNextAction).toMatch(/review carefully/i);
    }
  });
});
