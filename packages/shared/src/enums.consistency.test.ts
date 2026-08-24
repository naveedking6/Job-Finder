import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ACTIVITY_ACTORS,
  AUTOMATION_PERMISSIONS,
  AUTOMATION_RULE_TYPES,
  CONNECTOR_TYPES,
  CONVERSATION_STAGES,
  CONVERSATION_STATUSES,
  KNOWLEDGE_BASE_CATEGORIES,
  MESSAGE_SENDERS,
  OPPORTUNITY_STATUSES,
  USER_ROLES,
} from "./enums.js";

/**
 * This test does NOT use a generated Prisma client (the engine binary
 * can't be downloaded in every environment this repo is developed in —
 * see docs/ADR.md). Instead it parses the enum blocks directly out of
 * schema.prisma's source text. That's enough to catch the real failure
 * mode this test exists for: someone edits one copy of an enum (in the
 * schema or in enums.ts) and forgets the other.
 */

const schemaPath = fileURLToPath(
  new URL("../../database/prisma/schema.prisma", import.meta.url),
);
const schemaText = readFileSync(schemaPath, "utf-8");

function extractPrismaEnum(enumName: string): string[] {
  const pattern = new RegExp(`enum\\s+${enumName}\\s*\\{([^}]*)\\}`, "m");
  const match = schemaText.match(pattern);
  if (!match) {
    throw new Error(`Could not find "enum ${enumName}" in schema.prisma`);
  }
  return match[1]!
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//"));
}

describe("shared enums stay in sync with schema.prisma", () => {
  it.each([
    ["ConversationStage", CONVERSATION_STAGES],
    ["OpportunityStatus", OPPORTUNITY_STATUSES],
    ["AutomationPermission", AUTOMATION_PERMISSIONS],
    ["MessageSender", MESSAGE_SENDERS],
    ["ConversationStatus", CONVERSATION_STATUSES],
    ["ConnectorType", CONNECTOR_TYPES],
    ["AutomationRuleType", AUTOMATION_RULE_TYPES],
    ["KnowledgeBaseCategory", KNOWLEDGE_BASE_CATEGORIES],
    ["ActivityActor", ACTIVITY_ACTORS],
    ["UserRole", USER_ROLES],
  ] as const)("%s matches between enums.ts and schema.prisma", (prismaEnumName, sharedValues) => {
    const prismaValues = extractPrismaEnum(prismaEnumName);
    expect([...sharedValues].sort()).toEqual([...prismaValues].sort());
  });
});
