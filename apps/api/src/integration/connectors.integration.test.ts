import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@ai-sales-agent/database";
import { buildApp } from "../app.js";
import { hashPassword } from "../lib/password.js";
import type { FastifyInstance } from "fastify";

/**
 * Real database integration tests — see routes.integration.test.ts for
 * why this file only runs via `pnpm test:integration`.
 *
 * Deliberately NOT tested here: the "successfully fetched real data"
 * path of POST /connectors/:platformKey/run. That path calls the real
 * RemoteOK/We Work Remotely APIs over the network — testing it reliably
 * in CI would mean depending on a third party's uptime and exact
 * response format, which is a flaky-test risk, not a real correctness
 * signal. What IS genuinely testable without any network dependency is
 * covered below: policy denial (short-circuits before fetch() is ever
 * called), auth gating, and the fully self-contained contact-form
 * intake route (push-based, no external network call at all). See
 * docs/ADR.md Round 4 section for the full reasoning.
 */

let app: FastifyInstance;
let authToken: string;
let testUserId: string;
let testPlatformId: string;

const TEST_EMAIL = "connector-integration-test@example.com";
const TEST_PASSWORD = "correct-horse-battery-staple";

beforeAll(async () => {
  app = buildApp();
  await app.ready();

  const passwordHash = await hashPassword(TEST_PASSWORD);
  const user = await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    create: { email: TEST_EMAIL, name: "Connector Test User", passwordHash, role: "ADMIN" },
    update: { passwordHash, isActive: true },
  });
  testUserId = user.id;

  const loginResponse = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  authToken = loginResponse.json().data.token;

  // Ensure the real remoteok platform row exists with discovery DISABLED,
  // so calling its connector-run endpoint exercises the policy-deny path
  // without ever attempting a real network call.
  const platform = await prisma.platform.upsert({
    where: { key: "remoteok" },
    create: {
      key: "remoteok",
      name: "RemoteOK",
      isEnabled: true,
      discoveryAllowed: false, // deliberately denied for this test
      automationAllowed: false,
      autoMessageAllowed: false,
      autoCommentAllowed: false,
    },
    update: { discoveryAllowed: false },
  });
  testPlatformId = platform.id;
});

afterAll(async () => {
  await prisma.opportunity.deleteMany({ where: { sourcePlatformId: testPlatformId } });
  await prisma.user.delete({ where: { id: testUserId } }).catch(() => undefined);
  await app.close();
  await prisma.$disconnect();
});

describe("POST /connectors/:platformKey/run", () => {
  it("returns 401 without authentication", async () => {
    const response = await app.inject({ method: "POST", url: "/connectors/remoteok/run" });
    expect(response.statusCode).toBe(401);
  });

  it("returns 400 for a platform key with no registered connector", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/connectors/upwork/run",
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("NO_CONNECTOR");
  });

  it("short-circuits on policy denial WITHOUT attempting a network call, when discovery is disallowed", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/connectors/remoteok/run",
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json().data;
    expect(body.policyAllowed).toBe(false);
    expect(body.fetchedCount).toBe(0);
    expect(body.createdOpportunityIds).toEqual([]);
  });

  it("returns 404 for a platform key with a registered connector but no matching database row", async () => {
    // Temporarily remove we_work_remotely to exercise the 404 path, then
    // restore it — other tests/suites depend on it being seeded.
    const original = await prisma.platform.findUnique({ where: { key: "we_work_remotely" } });
    if (original) {
      await prisma.platform.delete({ where: { key: "we_work_remotely" } });
    }

    try {
      const response = await app.inject({
        method: "POST",
        url: "/connectors/we_work_remotely/run",
        headers: { authorization: `Bearer ${authToken}` },
      });
      expect(response.statusCode).toBe(404);
    } finally {
      if (original) {
        await prisma.platform.create({ data: original });
      }
    }
  });
});

describe("POST /intake/contact-form", () => {
  it("creates an opportunity from a valid submission", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/intake/contact-form",
      payload: {
        name: "Test Client",
        email: "testclient@example.com",
        projectDescription: "I need a WooCommerce store built for my business.",
        budget: "$1500",
        timeline: "1 month",
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().data.received).toBe(true);

    const ownWebsitePlatform = await prisma.platform.findUnique({
      where: { key: "own_website" },
    });
    const created = await prisma.opportunity.findFirst({
      where: { sourcePlatformId: ownWebsitePlatform!.id, authorName: "Test Client" },
    });
    expect(created).not.toBeNull();
    expect(created?.description).toBe("I need a WooCommerce store built for my business.");

    // Clean up this specific row.
    if (created) await prisma.opportunity.delete({ where: { id: created.id } });
  });

  it("returns 400 for an invalid submission (bad email)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/intake/contact-form",
      payload: {
        name: "Test",
        email: "not-an-email",
        projectDescription: "Something.",
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it("silently accepts (but does not persist) a honeypot-triggered submission", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/intake/contact-form",
      payload: {
        name: "Bot Submission",
        email: "bot@example.com",
        projectDescription: "Spam content here.",
        website: "http://spam-bot-filled-this-in.example", // honeypot field
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.received).toBe(true);

    const ownWebsitePlatform = await prisma.platform.findUnique({
      where: { key: "own_website" },
    });
    const created = await prisma.opportunity.findFirst({
      where: { sourcePlatformId: ownWebsitePlatform!.id, authorName: "Bot Submission" },
    });
    expect(created).toBeNull(); // never actually created
  });

  it("does not require authentication (it's a public endpoint)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/intake/contact-form",
      payload: {
        name: "No Auth Needed",
        email: "public@example.com",
        projectDescription: "Testing that no Authorization header is required.",
      },
    });
    expect(response.statusCode).toBe(201);

    const ownWebsitePlatform = await prisma.platform.findUnique({
      where: { key: "own_website" },
    });
    await prisma.opportunity.deleteMany({
      where: { sourcePlatformId: ownWebsitePlatform!.id, authorName: "No Auth Needed" },
    });
  });
});
