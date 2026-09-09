/**
 * Turns everyone's personal ranked lists into one group ranking.
 *
 * Borda count rather than "most first-place votes", because SPEC.md asks for a
 * group ordering rather than a single winner: an option everybody is happy with
 * should beat one that half the group loves and half cannot stand.
 *
 * People rank as many options as they care to, so each ballot is scored against
 * its own length — the top of a 2-long list is worth 2, not the size of the
 * whole pool. Otherwise ranking fewer options would quietly carry more weight.
 */

export type Ballot = {
  participantId: string;
  /** The participant's order, best first. */
  activityIds: string[];
};

export type BordaResult = {
  activityId: string;
  score: number;
  /** How many people put this first — the first tie-break. */
  firstChoices: number;
  /** How many people ranked it at all. */
  voters: number;
};

export function bordaRanking(ballots: Ballot[], pool: string[]): BordaResult[] {
  const inPool = new Set(pool);
  const score = new Map<string, number>();
  const firstChoices = new Map<string, number>();
  const voters = new Map<string, number>();

  for (const id of pool) {
    score.set(id, 0);
    firstChoices.set(id, 0);
    voters.set(id, 0);
  }

  for (const ballot of ballots) {
    // Ballots come from the browser, so drop anything no longer in the pool and
    // collapse duplicates to the first mention before scoring.
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const id of ballot.activityIds) {
      if (!inPool.has(id) || seen.has(id)) continue;
      seen.add(id);
      ordered.push(id);
    }

    const length = ordered.length;
    ordered.forEach((id, index) => {
      score.set(id, (score.get(id) ?? 0) + (length - index));
      voters.set(id, (voters.get(id) ?? 0) + 1);
      if (index === 0) firstChoices.set(id, (firstChoices.get(id) ?? 0) + 1);
    });
  }

  return pool
    .map((activityId) => ({
      activityId,
      score: score.get(activityId) ?? 0,
      firstChoices: firstChoices.get(activityId) ?? 0,
      voters: voters.get(activityId) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.firstChoices - a.firstChoices ||
        // Last resort so the order never depends on pool insertion order.
        a.activityId.localeCompare(b.activityId),
    );
}
