import { describe, expect, it } from "vitest";
import {
  MAX_PIN_ATTEMPTS,
  isLocked,
  nextThrottleState,
  remainingAttempts,
} from "./pin-throttle";

const now = new Date("2026-09-07T12:00:00Z");

describe("nextThrottleState", () => {
  it("counts a wrong PIN", () => {
    const s = nextThrottleState({ attempts: 0, lockedUntil: null }, false, now);
    expect(s.attempts).toBe(1);
    expect(s.lockedUntil).toBeNull();
  });

  it("locks once the attempt ceiling is reached", () => {
    const s = nextThrottleState({ attempts: MAX_PIN_ATTEMPTS - 1, lockedUntil: null }, false, now);
    expect(s.attempts).toBe(MAX_PIN_ATTEMPTS);
    expect(s.lockedUntil).not.toBeNull();
    expect(s.lockedUntil!.getTime()).toBeGreaterThan(now.getTime());
  });

  it("clears the counter on a correct PIN", () => {
    const s = nextThrottleState({ attempts: 3, lockedUntil: null }, true, now);
    expect(s).toEqual({ attempts: 0, lockedUntil: null });
  });

  it("clears a lock on a correct PIN", () => {
    const locked = new Date(now.getTime() + 60_000);
    const s = nextThrottleState({ attempts: MAX_PIN_ATTEMPTS, lockedUntil: locked }, true, now);
    expect(s).toEqual({ attempts: 0, lockedUntil: null });
  });

  it("extends the lock on a further wrong PIN while locked", () => {
    const locked = new Date(now.getTime() + 60_000);
    const s = nextThrottleState({ attempts: MAX_PIN_ATTEMPTS, lockedUntil: locked }, false, now);
    expect(s.lockedUntil!.getTime()).toBeGreaterThanOrEqual(locked.getTime());
  });
});

describe("isLocked", () => {
  it("is not locked with no lock set", () => {
    expect(isLocked({ attempts: 2, lockedUntil: null }, now)).toBe(false);
  });

  it("is locked while the lock is in the future", () => {
    expect(isLocked({ attempts: 5, lockedUntil: new Date(now.getTime() + 1000) }, now)).toBe(true);
  });

  it("is no longer locked once the lock has passed", () => {
    expect(isLocked({ attempts: 5, lockedUntil: new Date(now.getTime() - 1000) }, now)).toBe(false);
  });

  it("is not locked exactly at expiry", () => {
    expect(isLocked({ attempts: 5, lockedUntil: now }, now)).toBe(false);
  });
});

describe("remainingAttempts", () => {
  it("is the full ceiling before any attempt", () => {
    expect(remainingAttempts({ attempts: 0, lockedUntil: null })).toBe(MAX_PIN_ATTEMPTS);
  });

  it("shrinks with each wrong attempt", () => {
    expect(remainingAttempts({ attempts: 2, lockedUntil: null })).toBe(MAX_PIN_ATTEMPTS - 2);
  });

  it("never goes below zero", () => {
    expect(remainingAttempts({ attempts: MAX_PIN_ATTEMPTS + 5, lockedUntil: null })).toBe(0);
  });
});

describe("MAX_PIN_ATTEMPTS", () => {
  it("is small enough to make 10000 guesses impractical", () => {
    expect(MAX_PIN_ATTEMPTS).toBeLessThanOrEqual(10);
  });
});
