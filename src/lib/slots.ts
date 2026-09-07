/**
 * The availability grid's coordinate system.
 *
 * Every slot is a half-hour starting at a wall-clock time on a given day, held
 * in UTC so the grid never shifts under daylight saving or the viewer's own
 * timezone. Session dates are stored as `timestamp without time zone`, so
 * reading and writing them through UTC accessors keeps the number that went
 * into the database identical to the one that comes back out.
 */

export const SLOT_MINUTES = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export type SessionWindow = {
  dateRangeStart: Date;
  dateRangeEnd: Date;
  dailyStartMinutes: number;
  dailyEndMinutes: number;
};

/** Midnight UTC of the day the given instant falls on. */
function utcMidnight(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Every day the session covers, first and last inclusive. */
export function daysInRange(w: SessionWindow): Date[] {
  const start = utcMidnight(w.dateRangeStart);
  const end = utcMidnight(w.dateRangeEnd);
  if (end < start) return [];

  const days: Date[] = [];
  for (let t = start; t <= end; t += DAY_MS) days.push(new Date(t));
  return days;
}

/**
 * Minutes past midnight at which each slot begins. The daily end is exclusive:
 * a 09:00–23:00 window ends with the 22:30 slot, which runs up to 23:00.
 */
export function slotStartMinutes(w: SessionWindow): number[] {
  const out: number[] = [];
  for (
    let m = w.dailyStartMinutes;
    m + SLOT_MINUTES <= w.dailyEndMinutes;
    m += SLOT_MINUTES
  ) {
    out.push(m);
  }
  return out;
}

/** Every slot in the session, in chronological order. */
export function slotsForSession(w: SessionWindow): Date[] {
  const minutes = slotStartMinutes(w);
  const out: Date[] = [];
  for (const day of daysInRange(w)) {
    for (const m of minutes) out.push(new Date(day.getTime() + m * MINUTE_MS));
  }
  return out;
}

/**
 * Whether a slot is one this session actually offers. The server must not trust
 * slots from the browser, which can post any timestamp it likes.
 */
export function isSlotWithin(w: SessionWindow, slot: Date): boolean {
  const t = slot.getTime();
  if (!Number.isFinite(t)) return false;

  const dayStart = utcMidnight(slot);
  const minutes = (t - dayStart) / MINUTE_MS;

  // Rejects stray seconds and milliseconds as well as off-grid times.
  if (!Number.isInteger(minutes) || minutes % SLOT_MINUTES !== 0) return false;

  if (dayStart < utcMidnight(w.dateRangeStart)) return false;
  if (dayStart > utcMidnight(w.dateRangeEnd)) return false;

  return minutes >= w.dailyStartMinutes && minutes + SLOT_MINUTES <= w.dailyEndMinutes;
}
