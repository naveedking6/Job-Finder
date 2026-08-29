import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@ai-sales-agent/database";
import { buildApp } from "../app.js";
import { hashPassword } from "../lib/password.js";
import type { FastifyInstance } from "fastify";

/**
 * Real database integration tests for POST /opportunities/:id/analyze.
 * Runs against the MockAiProvider (see lib/ai-provider.ts's safe default
 * when DEFAULT_AI_PROVIDER is unset, which it deliberately is in CI) —
 * deterministic and free, not a real Anthropic/OpenAI call. See
 * docs/ADR.md Round 5 section for why testing the real-provider path
 * isn't attempted here, same reasoning as Round 4's connector tests.
 */

let app: FastifyInstance;
let authToken: string;
let testUserId: string;
let testPlatformId: string;
let testServiceId: string;
let testPortfolioItemId: string;

const TEST_EMAIL = "analysis-integration-test@example.com";
const TEST_PASSWORD = "correct-horse-battery-staple";

beforeAll(async () => {
  app = buildApp();
  await app.ready();

  const passwordHash = await hashPassword(TEST_PASSWORD);
  const user = await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    create: { email: TEST_EMAIL, name: "Analysis Test User", passwordHash, role: "ADMIN" },
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
    where: { key: "analysis_test_platform" },
    create: {
      key: "analysis_test_platform",
      name: "Analysis Test Platform",
      isEnabled: true,
      discoveryAllowed: true,
      automationAllowed: false,
      autoMessageAllowed: false,
      autoCommentAllowed: false,
    },
    update: {},
  });
  testPlatformId = platform.id;

  const service = await prisma.service.upsert({
    where: { slug: "shopify-development" },
    create: { name: "Shopify Development", slug: "shopify-development", isActive: true },
    update: { isActive: true },
  });
  testServiceId = service.id;

  const portfolioItem = await prisma.portfolioItem.create({
    data: {
      title: "Test Shopify Portfolio Item",
      description: "A test portfolio item for the analysis integration suite.",
      technologies: ["shopify"],
      serviceCategory: "shopify-development",
      isActive: true,
    },
  });
  testPortfolioItemId = portfolioItem.id;
});

afterAll(async () => {
  await prisma.opportunity.deleteMany({ where: { sourcePlatformId: testPlatformId } });
  await prisma.portfolioItem.delete({ where: { id: testPortfolioItemId } }).catch(() => undefined);
  await prisma.service.delete({ where: { id: testServiceId } }).catch(() => undefined);
  await prisma.platform.delete({ where: { id: testPlatformId } }).catch(() => undefined);
  await prisma.user.delete({ where: { id: testUserId } }).catch(() => undefined);
  await app.close();
  await prisma.$disconnect();
});

describe("POST /opportunities/:id/analyze", () => {
  it("returns 401 without authentication", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/opportunities/does-not-exist/analyze",
    });
    expect(response.statusCode).toBe(401);
  });

  it("returns 404 for a nonexistent opportunity", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/opportunities/does-not-exist/analyze",
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(response.statusCode).toBe(404);
  });

  it("analyzes a real opportunity end-to-end: DB fetch -> mock AI call -> DB update -> portfolio matching", async () => {
    const opportunity = await prisma.opportunity.create({
      data: {
        sourcePlatformId: testPlatformId,
        externalId: `analysis-test-${Date.now()}`,
        title: "Need a Shopify store for my clothing brand",
        description: "Looking for a Shopify expert to build an online store.",
        status: "DISCOVERED",
        automationPermission: "DISCOVERY_ONLY",
      },
    });

    const response = await app.inject({
      method: "POST",
      url: `/opportunities/${opportunity.id}/analyze`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json().data;

    // The mock provider's keyword heuristic should match "Shopify".
    expect(body.analysis.matchedServiceSlugs).toContain("shopify-development");
    expect(body.analysis.relevanceScore).toBeGreaterThan(50);

    // The opportunity row was actually updated in the database.
    expect(body.opportunity.status).toBe("ANALYZED");
    expect(body.opportunity.relevanceScore).toBe(body.analysis.relevanceScore);

    const reloaded = await prisma.opportunity.findUnique({ where: { id: opportunity.id } });
    expect(reloaded?.status).toBe("ANALYZED");
    expect(reloaded?.relevanceScore).toBe(body.analysis.relevanceScore);

    // Real portfolio matching happened — the seeded Shopify portfolio
    // item should be recommended since its category matches.
    expect(
      body.recommendedPortfolioItems.some((p: { id: string }) => p.id === testPortfolioItemId),
    ).toBe(true);

    await prisma.opportunity.delete({ where: { id: opportunity.id } });
  });

  it("logs an ActivityLog entry recording the analysis", async () => {
    const opportunity = await prisma.opportunity.create({
      data: {
        sourcePlatformId: testPlatformId,
        externalId: `analysis-log-test-${Date.now()}`,
        title: "Another Shopify project",
        description: "Test.",
        status: "DISCOVERED",
        automationPermission: "DISCOVERY_ONLY",
      },
    });

    await app.inject({
      method: "POST",
      url: `/opportunities/${opportunity.id}/analyze`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    const log = await prisma.activityLog.findFirst({
      where: { entityType: "Opportunity", entityId: opportunity.id, action: "opportunity.analyzed" },
      orderBy: { createdAt: "desc" },
    });
    expect(log).not.toBeNull();
    expect(log?.actor).toBe("AI");

    await prisma.opportunity.delete({ where: { id: opportunity.id } });
  });

  it("produces a low relevance score for an opportunity with no matching services", async () => {
    const opportunity = await prisma.opportunity.create({
      data: {
        sourcePlatformId: testPlatformId,
        externalId: `analysis-lowmatch-test-${Date.now()}`,
        title: "Need someone to walk my dog every morning",
        description: "Looking for a reliable pet sitter, completely unrelated to any technical work.",
        status: "DISCOVERED",
        automationPermission: "DISCOVERY_ONLY",
      },
    });

    const response = await app.inject({
      method: "POST",
      url: `/opportunities/${opportunity.id}/analyze`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    const body = response.json().data;
    expect(body.analysis.matchedServiceSlugs).toEqual([]);
    expect(body.analysis.relevanceScore).toBeLessThan(50);
    expect(body.recommendedPortfolioItems).toEqual([]);

    await prisma.opportunity.delete({ where: { id: opportunity.id } });
  });
});
