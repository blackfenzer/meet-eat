import type { JoinFailure, NameStatus } from "./session-service";
import { LOCKOUT_MINUTES } from "./pin-throttle";

/** Which prompt the join form shows once the server has judged the typed name. */
export type JoinStep = "name" | "set-pin" | "enter-pin" | "full";

export function stepForNameStatus(status: NameStatus): JoinStep {
  switch (status) {
    case "new":
      return "set-pin";
    case "existing":
      return "enter-pin";
    case "full":
      return "full";
  }
}

/** Every failure `joinSession` can return, so the UI can be checked for gaps. */
export const ALL_JOIN_FAILURES = [
  "invalid_name",
  "invalid_pin",
  "no_such_session",
  "session_full",
  "wrong_pin",
  "locked_out",
] as const satisfies readonly JoinFailure[];

export function messageForJoinFailure(reason: JoinFailure): string {
  switch (reason) {
    case "invalid_name":
      return "Enter a name so everyone knows who is free when.";
    case "invalid_pin":
      return "PINs are exactly four digits.";
    case "no_such_session":
      return "That plan no longer exists. Ask whoever shared the link.";
    case "session_full":
      return "This plan is full. If you have joined before, use the same name and PIN to get your spot back.";
    case "wrong_pin":
      return "That PIN does not match this name. Try again, or pick a different name.";
    case "locked_out":
      return `Too many wrong PINs for this name. Try again in ${LOCKOUT_MINUTES} minutes, or use a different name.`;
  }
}
