import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("ai-sales-agent-api");
  });

  it("returns a valid ISO timestamp", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    const body = response.json();

    expect(() => new Date(body.timestamp)).not.toThrow();
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it("returns 404 for an unknown route", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/does-not-exist" });
    expect(response.statusCode).toBe(404);
  });
});
