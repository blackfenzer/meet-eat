/**
 * Makes guessing a 4-digit PIN impractical.
 *
 * A PIN is only 10,000 possibilities, and joining is a public endpoint, so
 * without a ceiling anyone who knows a participant's name can walk the whole
 * space in minutes and take over that identity. State lives on the participant
 * row rather than in memory, because Vercel runs many short-lived instances
 * and an in-process counter would reset with each one.
 */

export const MAX_PIN_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

export type ThrottleState = {
  attempts: number;
  lockedUntil: Date | null;
};

export function isLocked(state: ThrottleState, now: Date): boolean {
  if (!state.lockedUntil) return false;
  return state.lockedUntil.getTime() > now.getTime();
}

export function remainingAttempts(state: ThrottleState): number {
  return Math.max(0, MAX_PIN_ATTEMPTS - state.attempts);
}

/** The row's next throttle state after an attempt with the given outcome. */
export function nextThrottleState(
  state: ThrottleState,
  correct: boolean,
  now: Date,
): ThrottleState {
  if (correct) return { attempts: 0, lockedUntil: null };

  const attempts = state.attempts + 1;
  if (attempts < MAX_PIN_ATTEMPTS) return { attempts, lockedUntil: null };

  // At or past the ceiling, keep pushing the lock out so a bot hammering the
  // endpoint never gets a window to resume in.
  const until = new Date(now.getTime() + LOCKOUT_MINUTES * 60_000);
  const lockedUntil =
    state.lockedUntil && state.lockedUntil.getTime() > until.getTime()
      ? state.lockedUntil
      : until;

  return { attempts, lockedUntil };
}
