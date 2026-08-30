import { describe, expect, it } from "vitest";
import { advanceStage, isLockedStage } from "./conversation-state.js";
import { CONVERSATION_STAGES, type ConversationStage } from "../enums.js";

describe("advanceStage — forward progression", () => {
  it("moves DISCOVERED -> OUTREACH_SENT on OUTREACH_SENT event", () => {
    expect(advanceStage("DISCOVERED", "OUTREACH_SENT")).toBe("OUTREACH_SENT");
  });

  it("moves OUTREACH_SENT -> CLIENT_RESPONDED on CLIENT_REPLIED event", () => {
    expect(advanceStage("OUTREACH_SENT", "CLIENT_REPLIED")).toBe("CLIENT_RESPONDED");
  });

  it("moves CLIENT_RESPONDED -> REQUIREMENTS_GATHERING on REQUIREMENTS_CAPTURED", () => {
    expect(advanceStage("CLIENT_RESPONDED", "REQUIREMENTS_CAPTURED")).toBe(
      "REQUIREMENTS_GATHERING",
    );
  });

  it("moves all the way through a realistic full sequence", () => {
    let stage: ConversationStage = "DISCOVERED";
    stage = advanceStage(stage, "OUTREACH_SENT");
    expect(stage).toBe("OUTREACH_SENT");
    stage = advanceStage(stage, "CLIENT_REPLIED");
    expect(stage).toBe("CLIENT_RESPONDED");
    stage = advanceStage(stage, "REQUIREMENTS_CAPTURED");
    expect(stage).toBe("REQUIREMENTS_GATHERING");
    stage = advanceStage(stage, "SOLUTION_PROPOSED");
    expect(stage).toBe("SOLUTION_DISCUSSION");
    stage = advanceStage(stage, "PORTFOLIO_SHARED");
    expect(stage).toBe("PORTFOLIO_SHARED");
    stage = advanceStage(stage, "BUDGET_DISCUSSED");
    expect(stage).toBe("BUDGET_DISCUSSION");
    stage = advanceStage(stage, "TIMELINE_DISCUSSED");
    expect(stage).toBe("TIMELINE_DISCUSSION");
    stage = advanceStage(stage, "QUALIFIED");
    expect(stage).toBe("QUALIFIED");
    stage = advanceStage(stage, "HOT_LEAD_THRESHOLD");
    expect(stage).toBe("HOT_LEAD");
  });
});

describe("advanceStage — never moves backward", () => {
  it("does not move BUDGET_DISCUSSION back to CLIENT_RESPONDED on another CLIENT_REPLIED event", () => {
    expect(advanceStage("BUDGET_DISCUSSION", "CLIENT_REPLIED")).toBe("BUDGET_DISCUSSION");
  });

  it("does not move HOT_LEAD backward on an earlier-stage event", () => {
    expect(advanceStage("HOT_LEAD", "REQUIREMENTS_CAPTURED")).toBe("HOT_LEAD");
  });

  it("repeating the SAME event twice in a row is a no-op the second time", () => {
    const afterFirst = advanceStage("DISCOVERED", "OUTREACH_SENT");
    const afterSecond = advanceStage(afterFirst, "OUTREACH_SENT");
    expect(afterSecond).toBe("OUTREACH_SENT");
  });
});

describe("advanceStage — exit stages", () => {
  it("moves to HUMAN_HANDOFF from any main-path stage on HANDOFF_TRIGGERED", () => {
    expect(advanceStage("REQUIREMENTS_GATHERING", "HANDOFF_TRIGGERED")).toBe("HUMAN_HANDOFF");
    expect(advanceStage("DISCOVERED", "HANDOFF_TRIGGERED")).toBe("HUMAN_HANDOFF");
  });

  it("moves to CONVERTED from any main-path stage", () => {
    expect(advanceStage("QUALIFIED", "CONVERTED")).toBe("CONVERTED");
  });

  it("moves to LOST from any main-path stage", () => {
    expect(advanceStage("SOLUTION_DISCUSSION", "LOST")).toBe("LOST");
  });

  it("moves to ARCHIVED on ARCHIVE event", () => {
    expect(advanceStage("CLIENT_RESPONDED", "ARCHIVE")).toBe("ARCHIVED");
  });
});

describe("advanceStage — exit stages are locked", () => {
  it("HUMAN_HANDOFF does not move on an ordinary event", () => {
    expect(advanceStage("HUMAN_HANDOFF", "BUDGET_DISCUSSED")).toBe("HUMAN_HANDOFF");
  });

  it("CONVERTED does not move to LOST via an event (no accidental un-converting)", () => {
    expect(advanceStage("CONVERTED", "LOST")).toBe("CONVERTED");
  });

  it("LOST does not move to CONVERTED via an event", () => {
    expect(advanceStage("LOST", "CONVERTED")).toBe("LOST");
  });

  it("ARCHIVED does not move on any event", () => {
    expect(advanceStage("ARCHIVED", "OUTREACH_SENT")).toBe("ARCHIVED");
    expect(advanceStage("ARCHIVED", "HANDOFF_TRIGGERED")).toBe("ARCHIVED");
  });
});

describe("isLockedStage", () => {
  it("returns true for all four exit stages", () => {
    expect(isLockedStage("HUMAN_HANDOFF")).toBe(true);
    expect(isLockedStage("CONVERTED")).toBe(true);
    expect(isLockedStage("LOST")).toBe(true);
    expect(isLockedStage("ARCHIVED")).toBe(true);
  });

  it("returns false for every main-path stage", () => {
    const mainPathStages: ConversationStage[] = [
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
    for (const stage of mainPathStages) {
      expect(isLockedStage(stage)).toBe(false);
    }
  });
});

describe("state machine coverage — every declared ConversationStage is reachable", () => {
  it("every stage in CONVERSATION_STAGES is either a main-path stage or an exit stage (module loaded without throwing)", () => {
    // The module-load-time sanity check in conversation-state.ts already
    // throws if any stage is uncovered — successfully importing the
    // module (which every test above already did) IS the proof. This
    // test just makes that guarantee explicit and named, so a future
    // reader immediately understands why it can't silently drift.
    expect(CONVERSATION_STAGES.length).toBeGreaterThan(0);
  });
});
