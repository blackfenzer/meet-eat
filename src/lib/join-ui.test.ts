import { describe, expect, it } from "vitest";
import type { JoinFailure, NameStatus } from "./session-service";
import {
  ALL_JOIN_FAILURES,
  messageForJoinFailure,
  stepForNameStatus,
} from "./join-ui";

describe("stepForNameStatus", () => {
  it("sends an unused name to the PIN-creation step", () => {
    expect(stepForNameStatus("new")).toBe("set-pin");
  });

  it("sends a known name to the PIN-entry step", () => {
    expect(stepForNameStatus("existing")).toBe("enter-pin");
  });

  it("sends an unused name in a full room to the rejection step", () => {
    expect(stepForNameStatus("full")).toBe("full");
  });

  it("covers every name status", () => {
    const all: NameStatus[] = ["new", "existing", "full"];
    for (const s of all) expect(stepForNameStatus(s)).toBeTruthy();
  });
});

describe("messageForJoinFailure", () => {
  it("explains a wrong PIN in terms of what to do next", () => {
    expect(messageForJoinFailure("wrong_pin")).toMatch(/different name|pin/i);
  });

  it("explains that a full room only blocks new names", () => {
    expect(messageForJoinFailure("session_full")).toMatch(/full/i);
  });

  it("gives every failure reason a non-empty message", () => {
    for (const reason of ALL_JOIN_FAILURES) {
      expect(messageForJoinFailure(reason).length).toBeGreaterThan(0);
    }
  });

  it("gives each failure reason a distinct message", () => {
    const msgs = ALL_JOIN_FAILURES.map(messageForJoinFailure);
    expect(new Set(msgs).size).toBe(ALL_JOIN_FAILURES.length);
  });

  it("lists exactly the failure reasons the service can return", () => {
    const expected: JoinFailure[] = [
      "invalid_name", "invalid_pin", "no_such_session", "session_full", "wrong_pin",
      "locked_out",
    ];
    expect([...ALL_JOIN_FAILURES].sort()).toEqual(expected.sort());
  });
});
