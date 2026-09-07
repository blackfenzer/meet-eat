import { describe, expect, it } from "vitest";
import {
  participantCookieName,
  signParticipantToken,
  verifyParticipantToken,
} from "./participant-token";

const SECRET = "test-secret-value-at-least-32-chars-long";
const OTHER = "different-secret-value-also-32-chars!!";
const sessionId = "11111111-1111-4111-8111-111111111111";
const participantId = "22222222-2222-4222-8222-222222222222";

describe("signParticipantToken", () => {
  it("produces a token that verifies back to the same identity", () => {
    const token = signParticipantToken({ sessionId, participantId }, SECRET);
    expect(verifyParticipantToken(token, SECRET)).toEqual({ sessionId, participantId });
  });

  it("does not put the identity in the clear", () => {
    const token = signParticipantToken({ sessionId, participantId }, SECRET);
    expect(token).not.toContain(participantId);
  });

  it("gives different identities different tokens", () => {
    const a = signParticipantToken({ sessionId, participantId }, SECRET);
    const b = signParticipantToken({ sessionId, participantId: sessionId }, SECRET);
    expect(a).not.toBe(b);
  });
});

describe("verifyParticipantToken", () => {
  it("rejects a token signed with another secret", () => {
    const token = signParticipantToken({ sessionId, participantId }, OTHER);
    expect(verifyParticipantToken(token, SECRET)).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const token = signParticipantToken({ sessionId, participantId }, SECRET);
    const [payload, sig] = token.split(".");
    const evil = Buffer.from(
      JSON.stringify({ sessionId, participantId: "33333333-3333-4333-8333-333333333333" }),
    ).toString("base64url");
    expect(verifyParticipantToken(`${evil}.${sig}`, SECRET)).toBeNull();
    expect(payload).not.toBe(evil);
  });

  it("rejects a tampered signature", () => {
    const token = signParticipantToken({ sessionId, participantId }, SECRET);
    const [payload] = token.split(".");
    expect(verifyParticipantToken(`${payload}.deadbeef`, SECRET)).toBeNull();
  });

  it("rejects a token with no signature", () => {
    expect(verifyParticipantToken("just-a-payload", SECRET)).toBeNull();
  });

  it("rejects an empty token", () => {
    expect(verifyParticipantToken("", SECRET)).toBeNull();
  });

  it("rejects payload that is not the expected shape", () => {
    const bad = Buffer.from(JSON.stringify({ nope: true })).toString("base64url");
    // sign the bad payload correctly so only the shape is wrong
    const token = signParticipantToken({ sessionId, participantId }, SECRET);
    const sig = token.split(".")[1];
    expect(verifyParticipantToken(`${bad}.${sig}`, SECRET)).toBeNull();
  });

  it("rejects garbage that is not base64 json", () => {
    expect(verifyParticipantToken("!!!!.!!!!", SECRET)).toBeNull();
  });
});

describe("participantCookieName", () => {
  it("scopes the cookie to one session", () => {
    expect(participantCookieName(sessionId)).toContain(sessionId);
  });

  it("gives two sessions different cookies, so one device can be in both", () => {
    expect(participantCookieName(sessionId)).not.toBe(participantCookieName(participantId));
  });

  it("produces a name safe to use as a cookie key", () => {
    expect(participantCookieName(sessionId)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
