import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@ai-sales-agent/database";
import { buildApp } from "../app.js";
import { hashPassword } from "../lib/password.js";
import type { FastifyInstance } from "fastify";

/**
 * Real database integration tests for POST /conversations/:id/messages —
 * runs against the MockAiProvider (see docs/ADR.md Round 5/6 sections
 * for why real provider calls aren't exercised in CI).
 */

let app: FastifyInstance;
let authToken: string;
let testUserId: string;
let testPlatformId: string;
let conversationId: string;
let leadId: string;

const TEST_EMAIL = "conversation-integration-test@example.com";
const TEST_PASSWORD = "correct-horse-battery-staple";

beforeAll(async () => {
  app = buildApp();
  await app.ready();

  const passwordHash = await hashPassword(TEST_PASSWORD);
  const user = await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    create: { email: TEST_EMAIL, name: "Conversation Test User", passwordHash, role: "ADMIN" },
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
    where: { key: "conversation_test_platform" },
    create: {
      key: "conversation_test_platform",
      name: "Conversation Test Platform",
      isEnabled: true,
      discoveryAllowed: true,
      automationAllowed: true,
      autoMessageAllowed: true,
      autoCommentAllowed: false,
    },
    update: {},
  });
  testPlatformId = platform.id;

  const opportunity = await prisma.opportunity.create({
    data: {
      sourcePlatformId: testPlatformId,
      externalId: `conversation-test-${Date.now()}`,
      title: "Test opportunity for conversation flow",
      description: "Test.",
      status: "DISCOVERED",
      automationPermission: "ALLOWED",
    },
  });

  const lead = await prisma.lead.create({
    data: { opportunityId: opportunity.id, stage: "OUTREACH_SENT" },
  });
  leadId = lead.id;

  const conversation = await prisma.conversation.create({
    data: { leadId: lead.id, platformId: testPlatformId },
  });
  conversationId = conversation.id;
});

afterAll(async () => {
  await prisma.conversationMemory.deleteMany({ where: { conversationId } }).catch(() => undefined);
  await prisma.message.deleteMany({ where: { conversationId } });
  await prisma.conversation.delete({ where: { id: conversationId } }).catch(() => undefined);
  await prisma.lead.delete({ where: { id: leadId } }).catch(() => undefined);
  await prisma.opportunity.deleteMany({ where: { sourcePlatformId: testPlatformId } });
  await prisma.platform.delete({ where: { id: testPlatformId } }).catch(() => undefined);
  await prisma.user.delete({ where: { id: testUserId } }).catch(() => undefined);
  await app.close();
  await prisma.$disconnect();
});

describe("POST /conversations/:id/messages", () => {
  it("returns 401 without authentication", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/conversations/${conversationId}/messages`,
      payload: { sender: "CLIENT", content: "Hi" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("returns 404 for a nonexistent conversation", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/conversations/does-not-exist/messages",
      headers: { authorization: `Bearer ${authToken}` },
      payload: { sender: "CLIENT", content: "Hi" },
    });
    expect(response.statusCode).toBe(404);
  });

  it("returns 400 for an empty message body", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/conversations/${conversationId}/messages`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { sender: "CLIENT", content: "" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("handles a CLIENT message: persists it, generates an AI reply, advances the stage", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/conversations/${conversationId}/messages`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { sender: "CLIENT", content: "Hi, I'm interested in your services." },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json().data;

    expect(body.message.sender).toBe("CLIENT");
    expect(body.message.content).toBe("Hi, I'm interested in your services.");
    expect(body.aiReply).not.toBeNull();
    expect(body.aiReply.sender).toBe("AI");
    expect(body.aiReply.content.length).toBeGreaterThan(0);

    // Stage genuinely advanced from OUTREACH_SENT -> CLIENT_RESPONDED.
    expect(body.stage).toBe("CLIENT_RESPONDED");

    const reloaded = await prisma.conversation.findUnique({ where: { id: conversationId } });
    expect(reloaded?.summary).not.toBeNull();

    // The lead's stage was kept in sync with the conversation's.
    const reloadedLead = await prisma.lead.findUnique({ where: { id: leadId } });
    expect(reloadedLead?.stage).toBe("CLIENT_RESPONDED");

    // Both messages actually persisted to the database.
    const messages = await prisma.message.findMany({ where: { conversationId } });
    expect(messages.length).toBeGreaterThanOrEqual(2);
  });

  it("never regresses the stage on a subsequent message that doesn't add new signal", async () => {
    const beforeLead = await prisma.lead.findUnique({ where: { id: leadId } });

    const response = await app.inject({
      method: "POST",
      url: `/conversations/${conversationId}/messages`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { sender: "CLIENT", content: "Just following up." },
    });

    const body = response.json().data;
    // Should stay at whatever stage it already reached, not move
    // backward, even though CLIENT_REPLIED fired again.
    expect(body.stage).toBe(beforeLead?.stage);
  });

  it("handles a HUMAN message by persisting it and marking human takeover, without calling the AI", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/conversations/${conversationId}/messages`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { sender: "HUMAN", content: "I'll take it from here." },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json().data;
    expect(body.message.sender).toBe("HUMAN");
    expect(body.aiReply).toBeNull();

    const reloaded = await prisma.conversation.findUnique({ where: { id: conversationId } });
    expect(reloaded?.status).toBe("HUMAN_TAKEOVER");
  });

  it("preserves earlier conversation memory across multiple turns (never-forget-context guarantee)", async () => {
    // Create a fresh conversation for this isolated test.
    const opportunity = await prisma.opportunity.create({
      data: {
        sourcePlatformId: testPlatformId,
        externalId: `memory-test-${Date.now()}`,
        title: "Memory persistence test",
        description: "Test.",
        status: "DISCOVERED",
        automationPermission: "ALLOWED",
      },
    });
    const lead = await prisma.lead.create({
      data: { opportunityId: opportunity.id, stage: "OUTREACH_SENT" },
    });
    const conversation = await prisma.conversation.create({
      data: { leadId: lead.id, platformId: testPlatformId },
    });

    // Turn 1: establishes some requirement info.
    await app.inject({
      method: "POST",
      url: `/conversations/${conversation.id}/messages`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { sender: "CLIENT", content: "I need a website." },
    });

    const memoryAfterTurn1 = await prisma.conversationMemory.findUnique({
      where: { conversationId: conversation.id },
    });
    expect(memoryAfterTurn1).not.toBeNull();

    // Turn 2: a message that mentions nothing new — memory row must
    // still exist and not have been wiped/reset.
    await app.inject({
      method: "POST",
      url: `/conversations/${conversation.id}/messages`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { sender: "CLIENT", content: "Just checking in." },
    });

    const memoryAfterTurn2 = await prisma.conversationMemory.findUnique({
      where: { conversationId: conversation.id },
    });
    expect(memoryAfterTurn2).not.toBeNull();
    expect(memoryAfterTurn2?.requirements).toEqual(memoryAfterTurn1?.requirements);

    // Cleanup this test's own data.
    await prisma.conversationMemory.deleteMany({ where: { conversationId: conversation.id } });
    await prisma.message.deleteMany({ where: { conversationId: conversation.id } });
    await prisma.conversation.delete({ where: { id: conversation.id } });
    await prisma.lead.delete({ where: { id: lead.id } });
    await prisma.opportunity.delete({ where: { id: opportunity.id } });
  });
});
