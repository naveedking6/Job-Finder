import { CONVERSATION_STAGES, type ConversationStage } from "../enums.js";

/**
 * Events that can move a conversation forward. Deliberately NOT a 1:1
 * mirror of every possible thing that could happen in a conversation —
 * these are the specific triggers the rest of the system actually fires
 * (see apps/api's conversation-handling route), each mapping to exactly
 * one of the brief's CONVERSATION_STAGES.
 */
export const CONVERSATION_EVENTS = [
  "OUTREACH_SENT",
  "CLIENT_REPLIED",
  "REQUIREMENTS_CAPTURED",
  "SOLUTION_PROPOSED",
  "PORTFOLIO_SHARED",
  "BUDGET_DISCUSSED",
  "TIMELINE_DISCUSSED",
  "QUALIFIED",
  "HOT_LEAD_THRESHOLD",
  "HANDOFF_TRIGGERED",
  "CONVERTED",
  "LOST",
  "ARCHIVE",
] as const;
export type ConversationEvent = (typeof CONVERSATION_EVENTS)[number];

/**
 * The main, ordered progression path. A conversation only moves FORWARD
 * along this path — receiving an event that maps to an earlier stage
 * than the conversation is already at (e.g. another CLIENT_REPLIED event
 * after the conversation has already reached BUDGET_DISCUSSION) doesn't
 * move it backward. This makes the state machine robust to real
 * conversations that don't happen in a strict linear order (a client
 * might mention budget before requirements are fully gathered, and that
 * shouldn't un-advance the stage once requirements gathering already
 * happened).
 */
const MAIN_PATH_ORDER: ConversationStage[] = [
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
];

/** These four are exits from the main path, not points along it. Once a
 *  conversation enters one, it's LOCKED — no ordinary event moves it
 *  back onto the main path or into a different exit stage. Unlocking
 *  requires an explicit human action outside this state machine (e.g. a
 *  direct PUT to change the stage), not an automatic event. */
const EXIT_STAGES: ConversationStage[] = ["HUMAN_HANDOFF", "CONVERTED", "LOST", "ARCHIVED"];

const EVENT_TO_MAIN_PATH_STAGE: Record<
  Exclude<ConversationEvent, "HANDOFF_TRIGGERED" | "CONVERTED" | "LOST" | "ARCHIVE">,
  ConversationStage
> = {
  OUTREACH_SENT: "OUTREACH_SENT",
  CLIENT_REPLIED: "CLIENT_RESPONDED",
  REQUIREMENTS_CAPTURED: "REQUIREMENTS_GATHERING",
  SOLUTION_PROPOSED: "SOLUTION_DISCUSSION",
  PORTFOLIO_SHARED: "PORTFOLIO_SHARED",
  BUDGET_DISCUSSED: "BUDGET_DISCUSSION",
  TIMELINE_DISCUSSED: "TIMELINE_DISCUSSION",
  QUALIFIED: "QUALIFIED",
  HOT_LEAD_THRESHOLD: "HOT_LEAD",
};

const EVENT_TO_EXIT_STAGE: Record<string, ConversationStage> = {
  HANDOFF_TRIGGERED: "HUMAN_HANDOFF",
  CONVERTED: "CONVERTED",
  LOST: "LOST",
  ARCHIVE: "ARCHIVED",
};

/**
 * Given the conversation's current stage and an event that just
 * happened, returns the new stage. Pure — no side effects, no I/O,
 * fully deterministic. The caller (apps/api) is responsible for
 * persisting the result and for deciding WHEN to fire which event.
 */
export function advanceStage(
  currentStage: ConversationStage,
  event: ConversationEvent,
): ConversationStage {
  // Locked: an exit stage never moves via an ordinary event.
  if (EXIT_STAGES.includes(currentStage)) {
    return currentStage;
  }

  const exitTarget = EVENT_TO_EXIT_STAGE[event];
  if (exitTarget) {
    return exitTarget;
  }

  const targetStage =
    EVENT_TO_MAIN_PATH_STAGE[
      event as Exclude<ConversationEvent, "HANDOFF_TRIGGERED" | "CONVERTED" | "LOST" | "ARCHIVE">
    ];
  const currentRank = MAIN_PATH_ORDER.indexOf(currentStage);
  const targetRank = MAIN_PATH_ORDER.indexOf(targetStage);

  // Defensive: a stage not found on the main path (shouldn't happen —
  // every ConversationStage is either on MAIN_PATH_ORDER or in
  // EXIT_STAGES, and EXIT_STAGES was already handled above) is treated
  // as "don't move", not a crash.
  if (currentRank === -1 || targetRank === -1) {
    return currentStage;
  }

  return targetRank > currentRank ? targetStage : currentStage;
}

/** True once a conversation has reached a locked exit stage. */
export function isLockedStage(stage: ConversationStage): boolean {
  return EXIT_STAGES.includes(stage);
}

// Sanity check the two lists above actually cover every declared stage —
// this runs once at module load, not per-call, and throws immediately
// (loudly, at startup) if someone adds a new ConversationStage to
// enums.ts without updating this state machine to account for it.
const coveredStages = new Set([...MAIN_PATH_ORDER, ...EXIT_STAGES]);
for (const stage of CONVERSATION_STAGES) {
  if (!coveredStages.has(stage)) {
    throw new Error(
      `ConversationStage "${stage}" is declared in enums.ts but not covered by the conversation state machine (conversation-state.ts). Add it to MAIN_PATH_ORDER or EXIT_STAGES.`,
    );
  }
}
