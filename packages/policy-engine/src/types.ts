/**
 * The four kinds of action a connector might want to take on a platform.
 * These map directly onto the boolean flags on the Platform model
 * (discoveryAllowed, automationAllowed, autoMessageAllowed,
 * autoCommentAllowed) — see packages/database/prisma/schema.prisma.
 */
export type PolicyAction = "DISCOVER" | "AUTOMATE" | "AUTO_MESSAGE" | "AUTO_COMMENT";

/**
 * The subset of a Platform row this engine actually needs to make a
 * decision. Deliberately NOT importing the Prisma-generated Platform
 * type here — this package has zero database dependency by design, so
 * it can be unit tested anywhere, including environments (like the
 * sandbox this repo was originally built in) that can't generate a
 * Prisma client. The API layer maps a real Platform row onto this shape
 * when it calls in.
 */
export interface PlatformPolicyInput {
  key: string;
  name: string;
  isEnabled: boolean;
  discoveryAllowed: boolean;
  automationAllowed: boolean;
  autoMessageAllowed: boolean;
  autoCommentAllowed: boolean;
}

export interface PolicyDecision {
  allowed: boolean;
  action: PolicyAction;
  platformKey: string;
  /** Human-readable explanation — always present, on both allow and deny,
   *  so a decision is auditable without cross-referencing code. */
  reason: string;
}
