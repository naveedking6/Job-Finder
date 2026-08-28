/**
 * Opportunity.automationPermission is a SNAPSHOT taken at discovery time
 * (see schema.prisma's comment on that field) — this derives that
 * snapshot value from a platform's current flags, so historical
 * opportunities stay auditable even if the platform's policy changes
 * later (a platform going from ALLOWED to DISABLED shouldn't rewrite
 * what past opportunities were captured under).
 */
export function deriveAutomationPermission(platform: {
  automationAllowed: boolean;
  discoveryAllowed: boolean;
}): "ALLOWED" | "DISCOVERY_ONLY" | "DISABLED" {
  if (platform.automationAllowed) return "ALLOWED";
  if (platform.discoveryAllowed) return "DISCOVERY_ONLY";
  return "DISABLED";
}
