import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("theme tokens", () => {
  const css = readFileSync(new URL("./globals.css", import.meta.url), "utf-8");

  it.each([
    ["--color-maroon", "#8B0909"],
    ["--color-brick", "#B20808"],
    ["--color-cream", "#EDD9CC"],
    ["--color-taupe", "#B8A597"],
    ["--color-umber", "#806350"],
  ])("defines %s as %s", (token, hex) => {
    expect(css).toContain(`${token}: ${hex}`);
  });
});
