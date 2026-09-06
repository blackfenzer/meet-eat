/**
 * Device recognition. SPEC.md: a device that has already joined a session skips
 * the name/PIN prompt entirely. This is a convenience cache, never an authority
 * — the server re-checks identity on every mutation, because anyone can edit
 * their own localStorage.
 */

export type LocalIdentity = {
  participantId: string;
  name: string;
  /** Present only on the browser that created the session. */
  adminToken?: string;
};

/** The subset of `window.localStorage` this module needs, so it can be tested. */
export type IdentityStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function identityKey(sessionId: string): string {
  return `meet-eat:session:${sessionId}`;
}

function isIdentity(value: unknown): value is LocalIdentity {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.participantId === "string" && typeof v.name === "string";
}

export function readIdentity(
  store: IdentityStore,
  sessionId: string,
): LocalIdentity | null {
  let raw: string | null;
  try {
    // Throws outright in browsers set to block site data, so never assume a
    // read merely returns null.
    raw = store.getItem(identityKey(sessionId));
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    return isIdentity(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Returns whether the write landed; a blocked store is not an error worth crashing on. */
export function writeIdentity(
  store: IdentityStore,
  sessionId: string,
  identity: LocalIdentity,
): boolean {
  try {
    store.setItem(identityKey(sessionId), JSON.stringify(identity));
    return true;
  } catch {
    return false;
  }
}

export function clearIdentity(store: IdentityStore, sessionId: string): void {
  try {
    store.removeItem(identityKey(sessionId));
  } catch {
    // Nothing to do: the identity is already unreachable.
  }
}
