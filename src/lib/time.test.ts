import { describe, expect, it } from "vitest";
import { minutesToTime, timeToMinutes } from "./time";

describe("timeToMinutes", () => {
  it("reads the start of the day", () => {
    expect(timeToMinutes("00:00")).toBe(0);
  });

  it("reads a morning time", () => {
    expect(timeToMinutes("09:00")).toBe(540);
  });

  it("reads a half hour past", () => {
    expect(timeToMinutes("23:30")).toBe(1410);
  });

  it("rejects a malformed value", () => {
    expect(timeToMinutes("9am")).toBeNull();
  });

  it("rejects an out-of-range hour", () => {
    expect(timeToMinutes("24:00")).toBeNull();
  });

  it("rejects an out-of-range minute", () => {
    expect(timeToMinutes("09:60")).toBeNull();
  });

  it("rejects an empty value", () => {
    expect(timeToMinutes("")).toBeNull();
  });
});

describe("minutesToTime", () => {
  it("pads a morning time to two digits", () => {
    expect(minutesToTime(540)).toBe("09:00");
  });

  it("formats a late half hour", () => {
    expect(minutesToTime(1410)).toBe("23:30");
  });

  it("round-trips every half-hour slot in a day", () => {
    for (let m = 0; m < 24 * 60; m += 30) {
      expect(timeToMinutes(minutesToTime(m))).toBe(m);
    }
  });
});
