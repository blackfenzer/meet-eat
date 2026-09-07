import { describe, expect, it } from "vitest";
import {
  SLOT_MINUTES,
  daysInRange,
  isSlotWithin,
  slotStartMinutes,
  slotsForSession,
  type SessionWindow,
} from "./slots";

const window = (over: Partial<SessionWindow> = {}): SessionWindow => ({
  dateRangeStart: new Date("2026-09-10T00:00:00Z"),
  dateRangeEnd: new Date("2026-09-12T00:00:00Z"),
  dailyStartMinutes: 9 * 60,
  dailyEndMinutes: 23 * 60,
  ...over,
});

describe("daysInRange", () => {
  it("includes both the first and last day", () => {
    expect(daysInRange(window())).toHaveLength(3);
  });

  it("returns a single day when the range starts and ends together", () => {
    const w = window({ dateRangeEnd: new Date("2026-09-10T00:00:00Z") });
    expect(daysInRange(w)).toHaveLength(1);
  });

  it("lists the days in order", () => {
    const days = daysInRange(window()).map((d) => d.toISOString().slice(0, 10));
    expect(days).toEqual(["2026-09-10", "2026-09-11", "2026-09-12"]);
  });

  it("returns nothing when the range is inverted", () => {
    const w = window({
      dateRangeStart: new Date("2026-09-12T00:00:00Z"),
      dateRangeEnd: new Date("2026-09-10T00:00:00Z"),
    });
    expect(daysInRange(w)).toEqual([]);
  });

  it("crosses a month boundary", () => {
    const w = window({
      dateRangeStart: new Date("2026-09-30T00:00:00Z"),
      dateRangeEnd: new Date("2026-10-02T00:00:00Z"),
    });
    expect(daysInRange(w).map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
  });
});

describe("slotStartMinutes", () => {
  it("treats the daily end as exclusive", () => {
    // 09:00-23:00 is 14 hours, so 28 half-hour slots starting at 09:00..22:30
    const mins = slotStartMinutes(window());
    expect(mins).toHaveLength(28);
    expect(mins[0]).toBe(9 * 60);
    expect(mins.at(-1)).toBe(22 * 60 + 30);
  });

  it("yields a single slot for a half-hour window", () => {
    const w = window({ dailyStartMinutes: 540, dailyEndMinutes: 570 });
    expect(slotStartMinutes(w)).toEqual([540]);
  });

  it("yields nothing when the window is shorter than one slot", () => {
    const w = window({ dailyStartMinutes: 540, dailyEndMinutes: 555 });
    expect(slotStartMinutes(w)).toEqual([]);
  });

  it("steps by the slot size", () => {
    const w = window({ dailyStartMinutes: 540, dailyEndMinutes: 660 });
    expect(slotStartMinutes(w)).toEqual([540, 570, 600, 630]);
  });
});

describe("slotsForSession", () => {
  it("produces every day-by-slot combination", () => {
    expect(slotsForSession(window())).toHaveLength(3 * 28);
  });

  it("starts at the first day's opening time", () => {
    expect(slotsForSession(window())[0].toISOString()).toBe("2026-09-10T09:00:00.000Z");
  });

  it("ends at the last day's final slot", () => {
    expect(slotsForSession(window()).at(-1)!.toISOString()).toBe(
      "2026-09-12T22:30:00.000Z",
    );
  });

  it("keeps slots in chronological order", () => {
    const s = slotsForSession(window()).map((d) => d.getTime());
    expect([...s].sort((a, b) => a - b)).toEqual(s);
  });
});

describe("isSlotWithin", () => {
  it("accepts a slot inside the window", () => {
    expect(isSlotWithin(window(), new Date("2026-09-11T13:30:00Z"))).toBe(true);
  });

  it("accepts the very first slot", () => {
    expect(isSlotWithin(window(), new Date("2026-09-10T09:00:00Z"))).toBe(true);
  });

  it("rejects a slot before the daily window opens", () => {
    expect(isSlotWithin(window(), new Date("2026-09-11T08:30:00Z"))).toBe(false);
  });

  it("rejects the daily end time itself, since it is exclusive", () => {
    expect(isSlotWithin(window(), new Date("2026-09-11T23:00:00Z"))).toBe(false);
  });

  it("rejects a day before the range", () => {
    expect(isSlotWithin(window(), new Date("2026-09-09T13:00:00Z"))).toBe(false);
  });

  it("rejects a day after the range", () => {
    expect(isSlotWithin(window(), new Date("2026-09-13T13:00:00Z"))).toBe(false);
  });

  it("rejects a slot that is not aligned to the grid", () => {
    expect(isSlotWithin(window(), new Date("2026-09-11T13:15:00Z"))).toBe(false);
  });

  it("rejects a slot carrying stray seconds", () => {
    expect(isSlotWithin(window(), new Date("2026-09-11T13:30:30Z"))).toBe(false);
  });

  it("accepts every slot it generates", () => {
    const w = window();
    for (const slot of slotsForSession(w)) {
      expect(isSlotWithin(w, slot)).toBe(true);
    }
  });
});

describe("SLOT_MINUTES", () => {
  it("is the half hour the spec calls for", () => {
    expect(SLOT_MINUTES).toBe(30);
  });
});
