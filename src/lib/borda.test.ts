import { describe, expect, it } from "vitest";
import { bordaRanking, type Ballot } from "./borda";

const ballot = (participantId: string, activityIds: string[]): Ballot => ({
  participantId,
  activityIds,
});

describe("bordaRanking", () => {
  it("returns nothing when nobody has ranked anything", () => {
    expect(bordaRanking([], [])).toEqual([]);
  });

  it("keeps one person's order", () => {
    const r = bordaRanking([ballot("p1", ["a", "b", "c"])], ["a", "b", "c"]);
    expect(r.map((x) => x.activityId)).toEqual(["a", "b", "c"]);
  });

  it("scores a list of three as 3, 2, 1", () => {
    const r = bordaRanking([ballot("p1", ["a", "b", "c"])], ["a", "b", "c"]);
    expect(r.map((x) => x.score)).toEqual([3, 2, 1]);
  });

  it("adds up agreeing ballots", () => {
    const r = bordaRanking(
      [ballot("p1", ["a", "b"]), ballot("p2", ["a", "b"])],
      ["a", "b"],
    );
    expect(r[0]).toMatchObject({ activityId: "a", score: 4 });
    expect(r[1]).toMatchObject({ activityId: "b", score: 2 });
  });

  it("lets a broad second choice beat a divisive first choice", () => {
    // a: 3 + 1 = 4, b: 2 + 3 = 5 -> b wins despite fewer firsts
    const r = bordaRanking(
      [ballot("p1", ["a", "b", "c"]), ballot("p2", ["b", "c", "a"])],
      ["a", "b", "c"],
    );
    expect(r[0].activityId).toBe("b");
  });

  it("puts an option nobody ranked last, on zero", () => {
    const r = bordaRanking([ballot("p1", ["a"])], ["a", "unloved"]);
    expect(r.at(-1)).toMatchObject({ activityId: "unloved", score: 0 });
  });

  it("includes every option from the pool even with no ballots", () => {
    const r = bordaRanking([], ["a", "b"]);
    expect(r.map((x) => x.activityId).sort()).toEqual(["a", "b"]);
    expect(r.every((x) => x.score === 0)).toBe(true);
  });

  it("weights a short list by its own length, not the pool size", () => {
    // p1 ranks only one of three options: that pick is worth 1, not 3
    const r = bordaRanking([ballot("p1", ["a"])], ["a", "b", "c"]);
    expect(r[0]).toMatchObject({ activityId: "a", score: 1 });
  });

  it("counts how many people put each option first", () => {
    const r = bordaRanking(
      [ballot("p1", ["a", "b"]), ballot("p2", ["a", "b"]), ballot("p3", ["b", "a"])],
      ["a", "b"],
    );
    expect(r.find((x) => x.activityId === "a")!.firstChoices).toBe(2);
    expect(r.find((x) => x.activityId === "b")!.firstChoices).toBe(1);
  });

  it("breaks a score tie on first-choice votes", () => {
    // a: first of three = 3, and one first-choice vote.
    // b: second of three (2) + second of two (1) = 3, never anyone's first.
    const r = bordaRanking(
      [ballot("p1", ["a", "b", "x"]), ballot("p2", ["y", "b"])],
      ["a", "b", "x", "y"],
    );
    const a = r.find((x) => x.activityId === "a")!;
    const b = r.find((x) => x.activityId === "b")!;
    expect(a.score).toBe(3);
    expect(b.score).toBe(3);
    expect(a.firstChoices).toBe(1);
    expect(b.firstChoices).toBe(0);
    expect(r.findIndex((x) => x.activityId === "a")).toBeLessThan(
      r.findIndex((x) => x.activityId === "b"),
    );
  });

  it("ignores a ranking for an option not in the pool", () => {
    const r = bordaRanking([ballot("p1", ["a", "ghost"])], ["a"]);
    expect(r.map((x) => x.activityId)).toEqual(["a"]);
  });

  it("ignores a duplicated option within one ballot", () => {
    const r = bordaRanking([ballot("p1", ["a", "a", "b"])], ["a", "b"]);
    const a = r.find((x) => x.activityId === "a")!;
    // counted once, at its best position in a 2-long effective list
    expect(a.score).toBe(2);
  });

  it("records how many people ranked each option", () => {
    const r = bordaRanking(
      [ballot("p1", ["a"]), ballot("p2", ["a", "b"])],
      ["a", "b"],
    );
    expect(r.find((x) => x.activityId === "a")!.voters).toBe(2);
    expect(r.find((x) => x.activityId === "b")!.voters).toBe(1);
  });

  it("is deterministic for a total tie", () => {
    const once = bordaRanking([], ["b", "a", "c"]).map((x) => x.activityId);
    const twice = bordaRanking([], ["c", "b", "a"]).map((x) => x.activityId);
    expect(once).toEqual(twice);
  });
});
