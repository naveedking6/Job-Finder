import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@ai-sales-agent/database";
import { buildApp } from "../app.js";
import { hashPassword } from "../lib/password.js";
import type { FastifyInstance } from "fastify";

/**
 * Real database integration tests for the policy-check endpoint — see
 * routes/routes.integration.test.ts for why this file only runs via
 * `pnpm test:integration`, not the default `pnpm test`.
 */

let app: FastifyInstance;
let authToken: string;
let testUserId: string;
let openPlatformId: string;
let lockedPlatformId: string;

const TEST_EMAIL = "policy-integration-test@example.com";
const TEST_PASSWORD = "correct-horse-battery-staple";

beforeAll(async () => {
  app = buildApp();
  await app.ready();

  const passwordHash = await hashPassword(TEST_PASSWORD);
  const user = await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    create: { email: TEST_EMAIL, name: "Policy Test User", passwordHash, role: "ADMIN" },
    update: { passwordHash, isActive: true },
  });
  testUserId = user.id;

  const loginResponse = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  authToken = loginResponse.json().data.token;

  const openPlatform = await prisma.platform.upsert({
    where: { key: "policy_test_open" },
    create: {
      key: "policy_test_open",
      name: "Policy Test Open Platform",
      isEnabled: true,
      discoveryAllowed: true,
      automationAllowed: true,
      autoMessageAllowed: true,
      autoCommentAllowed: true,
    },
    update: {},
  });
  openPlatformId = openPlatform.id;

  const lockedPlatform = await prisma.platform.upsert({
    where: { key: "policy_test_locked" },
    create: {
      key: "policy_test_locked",
      name: "Policy Test Locked Platform",
      isEnabled: true,
      discoveryAllowed: true,
      automationAllowed: false,
      autoMessageAllowed: false,
      autoCommentAllowed: false,
      complianceNotes: "Seeded disabled for integration testing.",
    },
    update: {},
  });
  lockedPlatformId = lockedPlatform.id;

  await prisma.setting.upsert({
    where: { key: "AUTOMATION_ENABLED" },
    create: { key: "AUTOMATION_ENABLED", value: true },
    update: { value: true },
  });
});

afterAll(async () => {
  await prisma.automationRule.deleteMany({
    where: { platformId: { in: [openPlatformId, lockedPlatformId] } },
  });
  await prisma.activityLog.deleteMany({
    where: { entityType: "Platform", entityId: { in: [openPlatformId, lockedPlatformId] } },
  });
  await prisma.platform.deleteMany({
    where: { key: { in: ["policy_test_open", "policy_test_locked"] } },
  });
  await prisma.user.delete({ where: { id: testUserId } }).catch(() => undefined);
  await app.close();
  await prisma.$disconnect();
});

describe("GET /platforms/:id/policy-check", () => {
  it("returns 404 for a nonexistent platform", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/platforms/does-not-exist/policy-check?action=DISCOVER",
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(response.statusCode).toBe(404);
  });

  it("requires authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/platforms/${openPlatformId}/policy-check?action=DISCOVER`,
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects an invalid action value", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/platforms/${openPlatformId}/policy-check?action=NOT_A_REAL_ACTION`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(response.statusCode).toBe(400);
  });

  it("allows AUTO_MESSAGE on a fully open platform with global automation on", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/platforms/${openPlatformId}/policy-check?action=AUTO_MESSAGE`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json().data;
    expect(body.allowed).toBe(true);
    expect(body.platformDecision.allowed).toBe(true);
  });

  it("denies AUTO_MESSAGE on a platform seeded with automationAllowed=false", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/platforms/${lockedPlatformId}/policy-check?action=AUTO_MESSAGE`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json().data;
    expect(body.allowed).toBe(false);
    expect(body.blockedBy).toMatch(/automationAllowed=false/);
  });

  it("still allows DISCOVER on the locked platform (discovery-only is a distinct permission)", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/platforms/${lockedPlatformId}/policy-check?action=DISCOVER`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = response.json().data;
    expect(body.allowed).toBe(true);
  });

  it("denies AUTOMATE on the open platform once the global emergency stop is active", async () => {
    await prisma.setting.update({ where: { key: "AUTOMATION_ENABLED" }, data: { value: false } });

    const response = await app.inject({
      method: "GET",
      url: `/platforms/${openPlatformId}/policy-check?action=AUTOMATE`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = response.json().data;
    expect(body.allowed).toBe(false);
    expect(body.blockedBy).toMatch(/globally disabled/i);

    // Restore for subsequent tests.
    await prisma.setting.update({ where: { key: "AUTOMATION_ENABLED" }, data: { value: true } });
  });

  it("applies a real DAILY_LIMIT automation rule fetched from the database", async () => {
    const rule = await prisma.automationRule.create({
      data: {
        name: "Test daily limit",
        type: "DAILY_LIMIT",
        platformId: openPlatformId,
        config: { maxPerDay: 1 },
        isActive: true,
      },
    });

    // No activity logged yet — should be within the limit (0/1).
    const beforeResponse = await app.inject({
      method: "GET",
      url: `/platforms/${openPlatformId}/policy-check?action=AUTO_MESSAGE`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(beforeResponse.json().data.allowed).toBe(true);

    // Log one outreach action — should now be AT the limit (1/1) and denied.
    await prisma.activityLog.create({
      data: {
        actor: "AI",
        action: "automation.outreach_sent",
        entityType: "Platform",
        entityId: openPlatformId,
      },
    });

    const afterResponse = await app.inject({
      method: "GET",
      url: `/platforms/${openPlatformId}/policy-check?action=AUTO_MESSAGE`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    const afterBody = afterResponse.json().data;
    expect(afterBody.allowed).toBe(false);
    expect(afterBody.blockedBy).toMatch(/daily limit reached/i);

    await prisma.automationRule.delete({ where: { id: rule.id } });
  });
});
