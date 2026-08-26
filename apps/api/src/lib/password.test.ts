import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("hashPassword / verifyPassword", () => {
  it("produces a hash that verifies against the original password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword("correct-horse-battery-staple", hash)).toBe(true);
  });

  it("rejects an incorrect password against a valid hash", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("never stores the plaintext password in the hash", async () => {
    const hash = await hashPassword("my-secret-password");
    expect(hash).not.toContain("my-secret-password");
  });

  it("produces different hashes for the same password (random salt)", async () => {
    const hashOne = await hashPassword("same-password");
    const hashTwo = await hashPassword("same-password");
    expect(hashOne).not.toBe(hashTwo);
    // Both must still verify correctly despite differing.
    expect(await verifyPassword("same-password", hashOne)).toBe(true);
    expect(await verifyPassword("same-password", hashTwo)).toBe(true);
  });
});
