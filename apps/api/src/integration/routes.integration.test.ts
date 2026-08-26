import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@ai-sales-agent/database";
import { buildApp } from "../app.js";
import { hashPassword } from "../lib/password.js";
import type { FastifyInstance } from "fastify";

/**
 * These tests run against a REAL Postgres database — see
 * .github/workflows/ci.yml's `validate-database-schema` job, which
 * migrates a fresh Postgres service container before running this suite.
 * They cannot run in the sandbox this repo was originally built in
 * (no way to reach a live Postgres instance there), so this file is
 * excluded from the default `pnpm test` run and only executed by
 * `pnpm test:integration` — see vitest.config.ts / vitest.integration.config.ts.
 */

let app: FastifyInstance;
let authToken: string;
let testUserId: string;

const TEST_EMAIL = "integration-test@example.com";
const TEST_PASSWORD = "correct-horse-battery-staple";

beforeAll(async () => {
  app = buildApp();
  await app.ready();

  const passwordHash = await hashPassword(TEST_PASSWORD);
  const user = await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    create: {
      email: TEST_EMAIL,
      name: "Integration Test User",
      passwordHash,
      role: "ADMIN",
    },
    update: { passwordHash, isActive: true },
  });
  testUserId = user.id;

  const loginResponse = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  authToken = loginResponse.json().data.token;
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: testUserId } }).catch(() => undefined);
  await app.close();
  await prisma.$disconnect();
});

describe("POST /auth/login", () => {
  it("returns a token for correct credentials", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(typeof body.data.token).toBe("string");
    expect(body.data.user.email).toBe(TEST_EMAIL);
    // Password hash must never be returned to the client.
    expect(body.data.user.passwordHash).toBeUndefined();
  });

  it("rejects an incorrect password with a generic message", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: TEST_EMAIL, password: "wrong-password" },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects an unknown email with the SAME generic message (no user enumeration)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "nobody@example.com", password: "whatever" },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("INVALID_CREDENTIALS");
  });
});

describe("authentication gate", () => {
  it("rejects a protected route with no Authorization header", async () => {
    const response = await app.inject({ method: "GET", url: "/leads" });
    expect(response.statusCode).toBe(401);
  });

  it("rejects a protected route with a garbage token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/leads",
      headers: { authorization: "Bearer not-a-real-token" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("allows a protected route with a valid token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/leads",
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(response.statusCode).toBe(200);
  });
});

describe("Portfolio CRUD", () => {
  let createdId: string;

  it("creates a portfolio item", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/portfolio",
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        title: "Test Shopify Store",
        description: "An integration-test portfolio item.",
        technologies: ["shopify"],
        serviceCategory: "shopify",
      },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.data.title).toBe("Test Shopify Store");
    createdId = body.data.id;
  });

  it("lists the created item on the public GET endpoint", async () => {
    const response = await app.inject({ method: "GET", url: "/portfolio" });
    expect(response.statusCode).toBe(200);
    const items = response.json().data;
    expect(items.some((i: { id: string }) => i.id === createdId)).toBe(true);
  });

  it("updates the item", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/portfolio/${createdId}`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { title: "Updated Title" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.title).toBe("Updated Title");
  });

  it("returns 404 updating a nonexistent item", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/portfolio/does-not-exist",
      headers: { authorization: `Bearer ${authToken}` },
      payload: { title: "X" },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("NOT_FOUND");
  });

  it("deletes the item", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: `/portfolio/${createdId}`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(response.statusCode).toBe(204);
  });

  it("no longer lists the deleted item", async () => {
    const response = await app.inject({ method: "GET", url: "/portfolio" });
    const items = response.json().data;
    expect(items.some((i: { id: string }) => i.id === createdId)).toBe(false);
  });
});

describe("Settings", () => {
  it("returns defaults for settings never explicitly written", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/settings",
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.AUTOMATION_ENABLED).toBe(false);
  });

  it("persists a valid settings update", async () => {
    const putResponse = await app.inject({
      method: "PUT",
      url: "/settings",
      headers: { authorization: `Bearer ${authToken}` },
      payload: { OPERATOR_NAME: "Test Operator" },
    });
    expect(putResponse.statusCode).toBe(200);

    const getResponse = await app.inject({
      method: "GET",
      url: "/settings",
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(getResponse.json().data.OPERATOR_NAME).toBe("Test Operator");
  });

  it("rejects an unknown settings key", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/settings",
      headers: { authorization: `Bearer ${authToken}` },
      payload: { NOT_A_REAL_SETTING: "value" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("rejects a value that fails its schema (bad WhatsApp number format)", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/settings",
      headers: { authorization: `Bearer ${authToken}` },
      payload: { WHATSAPP_BUSINESS_NUMBER: "not-a-phone-number" },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe("Automation start/stop (emergency stop mechanism)", () => {
  it("starts automation and reflects it in settings", async () => {
    const startResponse = await app.inject({
      method: "POST",
      url: "/automation/start",
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(startResponse.statusCode).toBe(200);
    expect(startResponse.json().data.automationEnabled).toBe(true);

    const settingsResponse = await app.inject({
      method: "GET",
      url: "/settings",
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(settingsResponse.json().data.AUTOMATION_ENABLED).toBe(true);
  });

  it("stops automation and reflects it in settings", async () => {
    const stopResponse = await app.inject({
      method: "POST",
      url: "/automation/stop",
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(stopResponse.statusCode).toBe(200);
    expect(stopResponse.json().data.automationEnabled).toBe(false);

    const settingsResponse = await app.inject({
      method: "GET",
      url: "/settings",
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(settingsResponse.json().data.AUTOMATION_ENABLED).toBe(false);
  });

  it("records an activity log entry for each start/stop action", async () => {
    const logs = await prisma.activityLog.findMany({
      where: { action: { in: ["automation.start", "automation.stop"] } },
      orderBy: { createdAt: "desc" },
      take: 2,
    });
    expect(logs.length).toBeGreaterThanOrEqual(2);
  });
});

describe("404 handling", () => {
  it("returns a structured 404 for a nonexistent lead", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/leads/does-not-exist",
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("NOT_FOUND");
  });

  it("returns a structured 404 for an unknown route", async () => {
    const response = await app.inject({ method: "GET", url: "/this-route-does-not-exist" });
    expect(response.statusCode).toBe(404);
    expect(response.json().success).toBe(false);
  });
});
