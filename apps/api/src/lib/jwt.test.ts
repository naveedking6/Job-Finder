import { beforeEach, describe, expect, it } from "vitest";
import { InvalidTokenError, signAuthToken, verifyAuthToken } from "./jwt.js";

const samplePayload = { userId: "user_123", email: "naveed@example.com", role: "ADMIN" };

beforeEach(() => {
  process.env.JWT_SECRET = "test-secret-do-not-use-in-production";
  process.env.JWT_EXPIRES_IN = "1h";
});

describe("signAuthToken / verifyAuthToken", () => {
  it("round-trips a payload through sign and verify", () => {
    const token = signAuthToken(samplePayload);
    const decoded = verifyAuthToken(token);
    expect(decoded.userId).toBe(samplePayload.userId);
    expect(decoded.email).toBe(samplePayload.email);
    expect(decoded.role).toBe(samplePayload.role);
  });

  it("throws InvalidTokenError for a garbage token", () => {
    expect(() => verifyAuthToken("not-a-real-token")).toThrow(InvalidTokenError);
  });

  it("throws InvalidTokenError for a token signed with a different secret", () => {
    const token = signAuthToken(samplePayload);
    process.env.JWT_SECRET = "a-different-secret";
    expect(() => verifyAuthToken(token)).toThrow(InvalidTokenError);
  });

  it("throws a clear error if JWT_SECRET is unset when signing", () => {
    delete process.env.JWT_SECRET;
    expect(() => signAuthToken(samplePayload)).toThrow(/JWT_SECRET is not set/);
  });

  it("throws a clear error if JWT_SECRET is unset when verifying", () => {
    const token = signAuthToken(samplePayload);
    delete process.env.JWT_SECRET;
    expect(() => verifyAuthToken(token)).toThrow(/JWT_SECRET is not set/);
  });
});
