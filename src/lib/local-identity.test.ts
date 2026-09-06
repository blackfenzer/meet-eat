import { describe, expect, it } from "vitest";
import {
  clearIdentity,
  identityKey,
  readIdentity,
  writeIdentity,
  type LocalIdentity,
} from "./local-identity";

/** Minimal stand-in for window.localStorage. */
function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    _map: map,
  };
}

/** Browsers set to block site data throw on access rather than returning null. */
function hostileStorage() {
  return {
    getItem() { throw new DOMException("denied"); },
    setItem() { throw new DOMException("denied"); },
    removeItem() { throw new DOMException("denied"); },
  };
}

const identity: LocalIdentity = { participantId: "p-1", name: "Ploy" };

describe("readIdentity", () => {
  it("returns null when this device has never joined the session", () => {
    expect(readIdentity(fakeStorage(), "s-1")).toBeNull();
  });

  it("reads back what was written", () => {
    const s = fakeStorage();
    writeIdentity(s, "s-1", identity);
    expect(readIdentity(s, "s-1")).toEqual(identity);
  });

  it("keeps the admin token when one was stored", () => {
    const s = fakeStorage();
    writeIdentity(s, "s-1", { ...identity, adminToken: "tok" });
    expect(readIdentity(s, "s-1")?.adminToken).toBe("tok");
  });

  it("returns null rather than throwing on corrupted json", () => {
    const s = fakeStorage({ [identityKey("s-1")]: "{not json" });
    expect(readIdentity(s, "s-1")).toBeNull();
  });

  it("returns null when the stored object is missing a participant id", () => {
    const s = fakeStorage({ [identityKey("s-1")]: JSON.stringify({ name: "Ploy" }) });
    expect(readIdentity(s, "s-1")).toBeNull();
  });

  it("returns null when storage access is blocked", () => {
    expect(readIdentity(hostileStorage(), "s-1")).toBeNull();
  });

  it("does not leak one session's identity into another", () => {
    const s = fakeStorage();
    writeIdentity(s, "s-1", identity);
    expect(readIdentity(s, "s-2")).toBeNull();
  });
});

describe("writeIdentity", () => {
  it("reports failure instead of throwing when storage is blocked", () => {
    expect(writeIdentity(hostileStorage(), "s-1", identity)).toBe(false);
  });

  it("reports success on a working storage", () => {
    expect(writeIdentity(fakeStorage(), "s-1", identity)).toBe(true);
  });
});

describe("clearIdentity", () => {
  it("forgets the identity for that session only", () => {
    const s = fakeStorage();
    writeIdentity(s, "s-1", identity);
    writeIdentity(s, "s-2", identity);

    clearIdentity(s, "s-1");

    expect(readIdentity(s, "s-1")).toBeNull();
    expect(readIdentity(s, "s-2")).toEqual(identity);
  });

  it("does not throw when storage is blocked", () => {
    expect(() => clearIdentity(hostileStorage(), "s-1")).not.toThrow();
  });
});
