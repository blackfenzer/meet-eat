import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { readCapped } from "./read-capped";

const streamOf = (...chunks: string[]) =>
  Readable.from(chunks.map((c) => Buffer.from(c)));

describe("readCapped", () => {
  it("returns a body that fits under the cap", async () => {
    const r = await readCapped(streamOf("hello ", "world"), 100);
    expect(r).toBe("hello world");
  });

  it("stops at the cap instead of buffering the whole body", async () => {
    const r = await readCapped(streamOf("a".repeat(10), "b".repeat(10)), 12);
    expect(r).toHaveLength(12);
    expect(r).toBe("a".repeat(10) + "bb");
  });

  it("destroys the stream once the cap is hit, so the rest is never downloaded", async () => {
    const stream = streamOf("x".repeat(50), "y".repeat(5_000_000));
    await readCapped(stream, 20);
    expect(stream.destroyed).toBe(true);
  });

  it("handles an empty body", async () => {
    expect(await readCapped(streamOf(), 100)).toBe("");
  });

  it("returns null when the stream errors", async () => {
    const stream = new Readable({
      read() {
        this.destroy(new Error("socket hang up"));
      },
    });
    expect(await readCapped(stream, 100)).toBeNull();
  });

  it("does not split a multi-byte character into mojibake at the cap", async () => {
    // three-byte character; cap lands mid-character
    const r = await readCapped(streamOf("ก".repeat(10)), 10);
    expect(r).not.toBeNull();
    expect(r!.includes("��")).toBe(false);
  });
});
