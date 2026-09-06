const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

/** Parses an `<input type="time">` value into minutes past midnight. */
export function timeToMinutes(value: string): number | null {
  const m = TIME_PATTERN.exec(value);
  if (!m) return null;

  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
}

/** Formats minutes past midnight back into an `<input type="time">` value. */
export function minutesToTime(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
