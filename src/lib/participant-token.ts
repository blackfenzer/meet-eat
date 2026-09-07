import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Proof that a browser really is a given participant.
 *
 * The app has no accounts (SPEC.md), so a participant id is the only identity
 * there is — which means it must never be accepted as a plain request
 * parameter. Anyone could then pass someone else's id and read or overwrite
 * their availability. Instead the server signs the identity once, at join
 * time, and reads it back out of an httpOnly cookie it cannot be talked out of.
 */

export type ParticipantIdentity = {
  sessionId: string;
  participantId: string;
};

const COOKIE_PREFIX = "meet-eat-id";

/**
 * One cookie per session. A device can legitimately be a participant in
 * several plans at once, so a single shared cookie would silently log someone
 * out of one plan when they joined another.
 */
export function participantCookieName(sessionId: string): string {
  return `${COOKIE_PREFIX}_${sessionId.replace(/[^A-Za-z0-9_-]/g, "")}`;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signParticipantToken(
  identity: ParticipantIdentity,
  secret: string,
): string {
  const payload = Buffer.from(
    JSON.stringify({
      sessionId: identity.sessionId,
      participantId: identity.participantId,
    }),
  ).toString("base64url");

  return `${payload}.${sign(payload, secret)}`;
}

export function verifyParticipantToken(
  token: string,
  secret: string,
): ParticipantIdentity | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payload, provided] = parts;
  if (!payload || !provided) return null;

  const expected = sign(payload, secret);

  // Compared byte-wise in constant time so the signature cannot be recovered
  // by measuring how long a rejection takes.
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;

    const { sessionId, participantId } = parsed as Record<string, unknown>;
    if (typeof sessionId !== "string" || typeof participantId !== "string") return null;

    return { sessionId, participantId };
  } catch {
    return null;
  }
}
