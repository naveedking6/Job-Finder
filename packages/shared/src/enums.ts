/**
 * These enums mirror packages/database/prisma/schema.prisma exactly.
 * They're duplicated here (rather than importing Prisma's generated enums
 * directly) so that packages which shouldn't depend on Prisma at all —
 * the dashboard, in particular — can still share the same vocabulary
 * without pulling in a database client.
 *
 * If you change one, change the other. There is a test
 * (enums.consistency.test.ts) that fails loudly if these ever drift from
 * the Prisma schema's enum definitions.
 */

export const CONVERSATION_STAGES = [
  "DISCOVERED",
  "ANALYZED",
  "QUALIFIED_FOR_OUTREACH",
  "OUTREACH_SENT",
  "CLIENT_RESPONDED",
  "REQUIREMENTS_GATHERING",
  "SOLUTION_DISCUSSION",
  "PORTFOLIO_SHARED",
  "BUDGET_DISCUSSION",
  "TIMELINE_DISCUSSION",
  "QUALIFIED",
  "HOT_LEAD",
  "HUMAN_HANDOFF",
  "CONVERTED",
  "LOST",
  "ARCHIVED",
] as const;
export type ConversationStage = (typeof CONVERSATION_STAGES)[number];

export const OPPORTUNITY_STATUSES = [
  "DISCOVERED",
  "ANALYZED",
  "DUPLICATE",
  "IGNORED_LOW_RELEVANCE",
  "IGNORED_POLICY",
  "CONVERTED_TO_LEAD",
  "ARCHIVED",
] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const AUTOMATION_PERMISSIONS = ["ALLOWED", "DISCOVERY_ONLY", "DISABLED"] as const;
export type AutomationPermission = (typeof AUTOMATION_PERMISSIONS)[number];

export const MESSAGE_SENDERS = ["CLIENT", "AI", "HUMAN", "SYSTEM"] as const;
export type MessageSender = (typeof MESSAGE_SENDERS)[number];

export const CONVERSATION_STATUSES = ["ACTIVE", "PAUSED", "HUMAN_TAKEOVER", "CLOSED"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const CONNECTOR_TYPES = ["API", "RSS", "WEBHOOK", "MANUAL"] as const;
export type ConnectorType = (typeof CONNECTOR_TYPES)[number];

export const AUTOMATION_RULE_TYPES = [
  "RATE_LIMIT",
  "DAILY_LIMIT",
  "COOLDOWN",
  "WORKING_HOURS",
  "DUPLICATE_CONTACT_BLOCK",
] as const;
export type AutomationRuleType = (typeof AUTOMATION_RULE_TYPES)[number];

export const KNOWLEDGE_BASE_CATEGORIES = [
  "SERVICE",
  "FAQ",
  "POLICY",
  "PRICING",
  "PROCESS",
  "COMMUNICATION",
] as const;
export type KnowledgeBaseCategory = (typeof KNOWLEDGE_BASE_CATEGORIES)[number];

export const ACTIVITY_ACTORS = ["SYSTEM", "AI", "HUMAN"] as const;
export type ActivityActor = (typeof ACTIVITY_ACTORS)[number];

export const USER_ROLES = ["ADMIN", "OPERATOR"] as const;
export type UserRole = (typeof USER_ROLES)[number];
